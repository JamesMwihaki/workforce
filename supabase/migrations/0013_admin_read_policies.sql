-- The admin incentives dashboard subscribes to Realtime changes on shifts and
-- claims to refresh itself. Realtime filters events by RLS, and admins could
-- only read their own store's rows — so cross-store events never reached
-- them. Give admins client-side read access to all shift data.
drop policy if exists shift_requests_read_admin on public.shift_requests;
create policy shift_requests_read_admin on public.shift_requests
  for select using (
    exists (select 1 from public.managers m where m.id = auth.uid() and m.is_admin)
  );

drop policy if exists shift_claims_read_admin on public.shift_claims;
create policy shift_claims_read_admin on public.shift_claims
  for select using (
    exists (select 1 from public.managers m where m.id = auth.uid() and m.is_admin)
  );

-- Make sure Realtime actually broadcasts changes for these tables.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'shift_requests'
  ) then
    alter publication supabase_realtime add table public.shift_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'shift_claims'
  ) then
    alter publication supabase_realtime add table public.shift_claims;
  end if;
end $$;
