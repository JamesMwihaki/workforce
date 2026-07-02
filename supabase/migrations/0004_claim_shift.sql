-- Atomic shift claim, replacing the two-step claim_shift_seat + insert flow
-- in the Twilio webhook. That flow incremented the seat count before checking
-- for an existing claim, so a worker texting YES twice consumed two seats.
--
-- claim_shift() does everything in one transaction and returns a status tag:
--   'confirmed'         seat reserved and claim row created
--   'already_confirmed' worker already holds a confirmed claim on this shift
--   'already_waitlisted'worker already responded after the shift filled
--   'day_conflict'      worker is already confirmed on another shift that day
--   'waitlisted'        shift is full — recorded on the waitlist
--   'closed'            shift was cancelled
--   'not_found'         no such shift
--
-- claim_shift_seat() is left in place until the webhook that calls it is
-- fully replaced in production; drop it in a later migration.

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

  -- Repeat replies must not touch the seat count.
  select * into v_existing
  from public.shift_claims
  where shift_request_id = p_shift_id and worker_id = p_worker_id;
  if found then
    return 'already_' || v_existing.status;
  end if;

  if v_shift.status = 'cancelled' then
    return 'closed';
  end if;

  if v_shift.status <> 'open'
     or v_shift.headcount_confirmed >= v_shift.headcount_needed then
    insert into public.shift_claims (shift_request_id, worker_id, status)
    values (p_shift_id, p_worker_id, 'waitlisted')
    on conflict (shift_request_id, worker_id) do nothing;
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
  values (p_shift_id, p_worker_id, 'confirmed');

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

revoke all on function public.claim_shift(uuid, uuid) from public;
grant execute on function public.claim_shift(uuid, uuid) to service_role;
