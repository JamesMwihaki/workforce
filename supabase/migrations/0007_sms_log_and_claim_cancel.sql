-- 1) sms_log: one row per outbound SMS attempt, so managers can see how many
--    workers were actually reached ("12 alerted") and failures are queryable
--    instead of vanishing into function logs.
-- 2) shift_claims gains a 'cancelled' status so a manager can remove a
--    confirmed worker without erasing the claim history.
-- 3) cancel_claim(): atomically cancels a claim, frees the seat, and reopens
--    a filled shift.
-- 4) claim_shift(): learns to re-claim over a cancelled row (a removed worker
--    may text YES again while the seat is open).

-- ─── sms_log ──────────────────────────────────────────────────────────────
create table if not exists public.sms_log (
  id                uuid primary key default gen_random_uuid(),
  shift_request_id  uuid not null references public.shift_requests(id) on delete cascade,
  worker_id         uuid references public.workers(id) on delete set null,
  phone             text not null,
  kind              text not null check (kind in ('shift_alert','shift_cancelled','claim_cancelled')),
  twilio_sid        text,
  status            text not null check (status in ('sent','failed')),
  error             text,
  created_at        timestamptz not null default now()
);

create index if not exists sms_log_shift_idx  on public.sms_log(shift_request_id);
create index if not exists sms_log_worker_idx on public.sms_log(worker_id);

-- Service-role only: reads surface through API routes, like workers/managers.
alter table public.sms_log enable row level security;

-- ─── shift_claims: allow 'cancelled' ─────────────────────────────────────
alter table public.shift_claims drop constraint if exists shift_claims_status_check;
alter table public.shift_claims
  add constraint shift_claims_status_check
  check (status in ('confirmed','waitlisted','cancelled'));

-- ─── cancel_claim ─────────────────────────────────────────────────────────
-- Returns:
--   'cancelled'         claim cancelled (seat freed if it was confirmed)
--   'already_cancelled' claim was already cancelled
--   'not_found'         no such shift or no claim by this worker
create or replace function public.cancel_claim(p_shift_id uuid, p_worker_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.shift_claims;
begin
  -- Same lock order as claim_shift (worker, then shift) to avoid deadlocks.
  perform 1 from public.workers where id = p_worker_id for update;
  perform 1 from public.shift_requests where id = p_shift_id for update;
  if not found then
    return 'not_found';
  end if;

  select * into v_claim
  from public.shift_claims
  where shift_request_id = p_shift_id and worker_id = p_worker_id;
  if not found then
    return 'not_found';
  end if;
  if v_claim.status = 'cancelled' then
    return 'already_cancelled';
  end if;

  update public.shift_claims set status = 'cancelled' where id = v_claim.id;

  -- Only a confirmed claim held a seat.
  if v_claim.status = 'confirmed' then
    update public.shift_requests
    set
      headcount_confirmed = greatest(headcount_confirmed - 1, 0),
      status = case when status = 'filled' then 'open' else status end
    where id = p_shift_id;
  end if;

  return 'cancelled';
end;
$$;

revoke all on function public.cancel_claim(uuid, uuid) from public;
grant execute on function public.cancel_claim(uuid, uuid) to service_role;

-- ─── claim_shift: re-claim over a cancelled row ──────────────────────────
create or replace function public.claim_shift(p_shift_id uuid, p_worker_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift    public.shift_requests;
  v_existing public.shift_claims;
begin
  -- Lock the worker row first, then the shift row (always in this order, to
  -- avoid deadlocks). The worker lock serialises concurrent YES replies from
  -- the same person across different shifts; the shift lock serialises seat
  -- accounting on one shift.
  perform 1 from public.workers where id = p_worker_id for update;
  if not found then
    return 'not_found';
  end if;

  select * into v_shift
  from public.shift_requests
  where id = p_shift_id
  for update;
  if not found then
    return 'not_found';
  end if;

  -- Repeat replies must not touch the seat count. A cancelled claim is the
  -- exception: the seat was freed, so the worker may claim again.
  select * into v_existing
  from public.shift_claims
  where shift_request_id = p_shift_id and worker_id = p_worker_id;
  if found and v_existing.status <> 'cancelled' then
    return 'already_' || v_existing.status;
  end if;

  if v_shift.status = 'cancelled' then
    return 'closed';
  end if;

  if v_shift.status <> 'open'
     or v_shift.headcount_confirmed >= v_shift.headcount_needed then
    insert into public.shift_claims (shift_request_id, worker_id, status)
    values (p_shift_id, p_worker_id, 'waitlisted')
    on conflict (shift_request_id, worker_id)
      do update set status = 'waitlisted', claimed_at = now();
    return 'waitlisted';
  end if;

  -- One confirmed shift per calendar day: a worker confirmed for a morning
  -- shift must not also be booked for an evening shift the same day.
  if exists (
    select 1
    from public.shift_claims sc
    join public.shift_requests sr on sr.id = sc.shift_request_id
    where sc.worker_id = p_worker_id
      and sc.status = 'confirmed'
      and sr.shift_date = v_shift.shift_date
      and sr.status <> 'cancelled'
  ) then
    return 'day_conflict';
  end if;

  insert into public.shift_claims (shift_request_id, worker_id, status)
  values (p_shift_id, p_worker_id, 'confirmed')
  on conflict (shift_request_id, worker_id)
    do update set status = 'confirmed', claimed_at = now();

  update public.shift_requests
  set
    headcount_confirmed = headcount_confirmed + 1,
    status = case
      when headcount_confirmed + 1 >= headcount_needed then 'filled'
      else status
    end
  where id = p_shift_id;

  return 'confirmed';
end;
$$;
