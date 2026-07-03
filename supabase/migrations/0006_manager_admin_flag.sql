-- Admin flag for managers. Admins can manage managers, stores and workers
-- through the /admin panel. All admin mutations go through API routes using
-- the service role, so no new RLS policies are needed — managers can already
-- read their own row (including is_admin) via managers_read_self.

alter table public.managers
  add column if not exists is_admin boolean not null default false;
