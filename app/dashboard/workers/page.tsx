import { requireManager } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import WorkersView, { type WorkerRow } from './WorkersView';

export const dynamic = 'force-dynamic';

export default async function DashboardWorkersPage() {
  const manager = await requireManager();

  // Workers have no manager-facing RLS read policy; reads go through the
  // service role after requireManager has scoped the query to the store.
  const svc = createServiceClient();

  const { data: workers } = await svc
    .from('workers')
    .select('id, employee_id, name, phone, roles, is_active')
    .eq('store_id', manager.store_id)
    .order('name', { ascending: true });

  const rows: WorkerRow[] = (workers ?? []).map((w) => ({
    id:          w.id,
    employee_id: w.employee_id,
    name:        w.name,
    phone:       w.phone,
    roles:       w.roles ?? [],
    is_active:   w.is_active,
  }));

  return <WorkersView workers={rows} storeName={manager.store?.name ?? 'your store'} />;
}
