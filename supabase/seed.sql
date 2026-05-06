-- Workforce Solution: dev seed
-- Inserts a small store cluster + one manager auth user.
-- The manager's auth row must be created separately via Supabase Auth (the
-- dashboard or the admin API). Once the auth user exists, run the INSERT
-- below, swapping the placeholder uuid for the real auth.users.id.

insert into public.stores (id, name, address) values
  ('11111111-1111-1111-1111-111111111111', 'Chipotle — Main St',     '101 Main St'),
  ('22222222-2222-2222-2222-222222222222', 'Chipotle — Oak Ave',     '202 Oak Ave'),
  ('33333333-3333-3333-3333-333333333333', 'Chipotle — Riverside',   '303 Riverside Dr'),
  ('44444444-4444-4444-4444-444444444444', 'Chipotle — Westgate',    '404 Westgate Blvd'), 
  ('55555555-5555-5555-5555-555555555555', 'Chipotle — Shawnee',    '22410 W 66th St Shawnee, KS  66226 United States')

on conflict (id) do nothing;
-- Replace <AUTH_USER_ID> with the auth.users.id created via Supabase Auth.
-- insert into public.managers (id, name, email, store_id) values
--   ('<AUTH_USER_ID>', 'Test Manager', 'manager@example.com',
--    '11111111-1111-1111-1111-111111111111')
-- on conflict (id) do nothing;
