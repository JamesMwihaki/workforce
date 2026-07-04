-- Security fix: the claim/cancel RPCs are SECURITY DEFINER (they bypass RLS to
-- do seat accounting), so any role that can EXECUTE them can book or unbook any
-- worker on any shift — bypassing the Twilio webhook, phone verification, role
-- matching, and the same-store 40-hour rules.
--
-- Supabase grants EXECUTE on public functions to `anon` and `authenticated` by
-- default, and the anon key ships in the browser bundle. `revoke ... from
-- public` in earlier migrations did NOT remove those role-specific grants, so
-- anon could call these via /rest/v1/rpc/*. Only the server (service_role, used
-- by the webhook) should ever call them.

revoke execute on function public.claim_shift(uuid, uuid)  from anon, authenticated;
revoke execute on function public.cancel_claim(uuid, uuid) from anon, authenticated;

-- claim_shift_seat() is legacy — replaced by claim_shift() in migration 0004 and
-- referenced nowhere in the app. Drop it rather than leave an exposed
-- SECURITY DEFINER function lying around.
drop function if exists public.claim_shift_seat(uuid);
