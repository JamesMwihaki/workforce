import { createServiceClient } from '@/lib/supabase/server';
import StoresPanel, { type StoreRow } from './StoresPanel';

export const dynamic = 'force-dynamic';

export default async function AdminStoresPage() {
  // Layout already enforced requireAdmin.
  const svc = createServiceClient();

  const [{ data: stores }, { data: workers }, { data: managers }] = await Promise.all([
    svc.from('stores').select('id, name, address').order('name'),
    svc.from('workers').select('store_id').eq('is_active', true),
    svc.from('managers').select('store_id'),
  ]);

  const workerCounts = new Map<string, number>();
  for (const w of workers ?? []) {
    workerCounts.set(w.store_id, (workerCounts.get(w.store_id) ?? 0) + 1);
  }
  const managerCounts = new Map<string, number>();
  for (const m of managers ?? []) {
    managerCounts.set(m.store_id, (managerCounts.get(m.store_id) ?? 0) + 1);
  }

  const rows: StoreRow[] = (stores ?? []).map((s) => ({
    id:            s.id,
    name:          s.name,
    address:       s.address ?? '',
    worker_count:  workerCounts.get(s.id) ?? 0,
    manager_count: managerCounts.get(s.id) ?? 0,
  }));

  return <StoresPanel stores={rows} />;
}
