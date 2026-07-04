-- A manager is also a worker at their store. Creating a manager now also
-- creates (or adopts) a worker record with every role, linked here so store
-- moves and removals keep the two rows in sync.
alter table public.managers
  add column if not exists worker_id uuid references public.workers(id) on delete set null;

create index if not exists managers_worker_id_idx on public.managers(worker_id);
