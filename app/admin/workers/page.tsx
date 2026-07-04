import { createServiceClient } from '@/lib/supabase/server';
import WorkersPanel, { type WorkerRow } from './WorkersPanel';

export const dynamic = 'force-dynamic';

export default async function AdminWorkersPage() {
  // Layout already enforced requireAdmin.
  const svc = createServiceClient();

  const [{ data: workers }, { data: managerLinks }] = await Promise.all([
    svc
      .from('workers')
      .select('id, employee_id, name, phone, roles, is_active, store:stores(name)')
      .order('created_at', { ascending: false }),
    svc.from('managers').select('worker_id').not('worker_id', 'is', null),
  ]);

  const managerWorkerIds = new Set((managerLinks ?? []).map((m) => m.worker_id));

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
      is_manager:  managerWorkerIds.has(w.id),
    };
  });

  return <WorkersPanel workers={rows} />;
}
