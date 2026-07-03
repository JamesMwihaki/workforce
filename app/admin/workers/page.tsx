import { createServiceClient } from '@/lib/supabase/server';
import WorkersPanel, { type WorkerRow } from './WorkersPanel';

export const dynamic = 'force-dynamic';

export default async function AdminWorkersPage() {
  // Layout already enforced requireAdmin.
  const svc = createServiceClient();

  const { data: workers } = await svc
    .from('workers')
    .select('id, employee_id, name, phone, roles, is_active, store:stores(name)')
    .order('created_at', { ascending: false });

  const rows: WorkerRow[] = (workers ?? []).map((w) => {
    const store = Array.isArray(w.store) ? (w.store[0] ?? null) : w.store;
    return {
      id:          w.id,
      employee_id: w.employee_id,
      name:        w.name,
      phone:       w.phone,
      roles:       w.roles ?? [],
      is_active:   w.is_active,
      store_name:  store?.name ?? '—',
    };
  });

  return <WorkersPanel workers={rows} />;
}
