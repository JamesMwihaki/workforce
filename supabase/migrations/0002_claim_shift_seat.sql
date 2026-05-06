-- Atomically reserves one seat on a shift_requests row, if seats are available.
-- Returns the updated row when a seat was claimed, or null when the shift was
-- already filled / cancelled. The conditional UPDATE makes this race-safe under
-- concurrent SMS replies — Postgres serialises the row update.

create or replace function public.claim_shift_seat(p_shift_id uuid)
returns public.shift_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.shift_requests;
begin
  update public.shift_requests
  set
    headcount_confirmed = headcount_confirmed + 1,
    status = case
      when headcount_confirmed + 1 >= headcount_needed then 'filled'
      else status
    end
  where id = p_shift_id
    and status = 'open'
    and headcount_confirmed < headcount_needed
  returning * into result;

  return result; -- null if no row was updated
end;
$$;

revoke all on function public.claim_shift_seat(uuid) from public;
grant execute on function public.claim_shift_seat(uuid) to service_role;
