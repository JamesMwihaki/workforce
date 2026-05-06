-- Workforce Solution: initial schema
-- Tables: stores, workers, managers, shift_requests, shift_claims
-- All tables ship with RLS enabled. Service role bypasses RLS server-side;
-- client-side reads/writes go through narrow policies defined below.

create extension if not exists "pgcrypto";

-- ─── stores ───────────────────────────────────────────────────────────────
create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  created_at  timestamptz not null default now()
);

-- ─── managers ─────────────────────────────────────────────────────────────
-- managers.id mirrors auth.users.id so RLS can match auth.uid() directly.
create table if not exists public.managers (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  store_id    uuid not null references public.stores(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index if not exists managers_store_id_idx on public.managers(store_id);

-- ─── workers ──────────────────────────────────────────────────────────────
create table if not exists public.workers (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null unique,
  name         text not null,
  phone        text not null unique,
  store_id     uuid not null references public.stores(id) on delete restrict,
  roles        text[] not null check (array_length(roles, 1) >= 1),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists workers_store_id_idx     on public.workers(store_id);
create index if not exists workers_phone_idx        on public.workers(phone);
create index if not exists workers_roles_gin_idx    on public.workers using gin (roles);
create index if not exists workers_is_active_idx    on public.workers(is_active);

-- ─── shift_requests ───────────────────────────────────────────────────────
create table if not exists public.shift_requests (
  id                    uuid primary key default gen_random_uuid(),
  requesting_store_id   uuid not null references public.stores(id) on delete restrict,
  created_by            uuid not null references public.managers(id) on delete restrict,
  role                  text not null check (role in ('line_crew','cashier','prep','kitchen')),
  shift_date            date not null,
  start_time            time not null,
  end_time              time not null,
  headcount_needed      integer not null check (headcount_needed >= 1),
  headcount_confirmed   integer not null default 0 check (headcount_confirmed >= 0),
  status                text not null default 'open' check (status in ('open','filled','cancelled')),
  created_at            timestamptz not null default now()
);

create index if not exists shift_requests_store_idx   on public.shift_requests(requesting_store_id);
create index if not exists shift_requests_status_idx  on public.shift_requests(status);
create index if not exists shift_requests_date_idx    on public.shift_requests(shift_date);

-- ─── shift_claims ─────────────────────────────────────────────────────────
create table if not exists public.shift_claims (
  id                uuid primary key default gen_random_uuid(),
  shift_request_id  uuid not null references public.shift_requests(id) on delete cascade,
  worker_id         uuid not null references public.workers(id) on delete restrict,
  status            text not null check (status in ('confirmed','waitlisted')),
  claimed_at        timestamptz not null default now(),
  unique (shift_request_id, worker_id)
);

create index if not exists shift_claims_request_idx on public.shift_claims(shift_request_id);
create index if not exists shift_claims_worker_idx  on public.shift_claims(worker_id);

-- ─── Row Level Security ───────────────────────────────────────────────────
alter table public.stores          enable row level security;
alter table public.managers        enable row level security;
alter table public.workers         enable row level security;
alter table public.shift_requests  enable row level security;
alter table public.shift_claims    enable row level security;

-- stores: every authenticated user can read (used in worker registration dropdown via public anon
-- key as well, so allow public select).
drop policy if exists stores_read_all on public.stores;
create policy stores_read_all on public.stores
  for select using (true);

-- managers: a manager can read their own row.
drop policy if exists managers_read_self on public.managers;
create policy managers_read_self on public.managers
  for select using (auth.uid() = id);

-- workers: no public read. Service role bypasses RLS for registration and broadcasts.
-- Managers don't need direct access to the workers table client-side; dashboard reads happen
-- via API routes using the service role.

-- shift_requests: managers can read shifts that belong to their own store.
drop policy if exists shift_requests_read_own_store on public.shift_requests;
create policy shift_requests_read_own_store on public.shift_requests
  for select using (
    requesting_store_id in (
      select store_id from public.managers where id = auth.uid()
    )
  );

-- shift_claims: managers can read claims that belong to a shift at their store.
drop policy if exists shift_claims_read_own_store on public.shift_claims;
create policy shift_claims_read_own_store on public.shift_claims
  for select using (
    shift_request_id in (
      select sr.id from public.shift_requests sr
      join public.managers m on m.store_id = sr.requesting_store_id
      where m.id = auth.uid()
    )
  );

-- All inserts/updates/deletes are funneled through API routes using the service role.
-- That keeps the policy surface minimal and the broadcast/reply logic atomic.
