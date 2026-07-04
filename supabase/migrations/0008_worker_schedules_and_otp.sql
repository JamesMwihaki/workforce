-- Worker portal: regular weekly schedules + SMS login codes.
--
-- worker_schedules holds one time range per weekday (a worker's "regular"
-- shift at their home store). It powers same-store broadcasts: a worker is
-- only texted about a shift at their own store on a day they're off, and only
-- if the pickup keeps their week (Mon–Sun) at or under 40 hours.
--
-- worker_otps holds short-lived hashed login codes for the worker portal.
-- Both tables are service-role only, like workers/managers.

create table if not exists public.worker_schedules (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.workers(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6), -- 0 = Sunday (JS getDay())
  start_time  time not null,
  end_time    time not null, -- '00:00' means a midnight close
  created_at  timestamptz not null default now(),
  unique (worker_id, weekday)
);

create index if not exists worker_schedules_worker_idx on public.worker_schedules(worker_id);

-- Distinguishes "no schedule entered yet" (never eligible for same-store
-- texts — we can't verify the 40-hour rule) from "entered, all days off".
alter table public.workers
  add column if not exists schedule_updated_at timestamptz;

create table if not exists public.worker_otps (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  attempts    integer not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists worker_otps_phone_idx on public.worker_otps(phone);

alter table public.worker_schedules enable row level security;
alter table public.worker_otps      enable row level security;
