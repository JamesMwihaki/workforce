import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import ManagersPanel, { type ManagerRow, type StoreOption } from './ManagersPanel';

export const dynamic = 'force-dynamic';

export default async function AdminManagersPage() {
  const admin = await requireAdmin();
  const svc = createServiceClient();

  const [{ data: managers }, { data: stores }] = await Promise.all([
    svc
      .from('managers')
      .select('id, name, email, store_id, is_admin, created_at, store:stores(name)')
      .order('created_at', { ascending: true }),
    svc.from('stores').select('id, name').order('name'),
  ]);

  const rows: ManagerRow[] = (managers ?? []).map((m) => {
    const store = Array.isArray(m.store) ? (m.store[0] ?? null) : m.store;
    return {
      id:         m.id,
      name:       m.name,
      email:      m.email,
      store_id:   m.store_id,
      is_admin:   m.is_admin,
      store_name: store?.name ?? '—',
    };
  });

  return (
    <ManagersPanel
      managers={rows}
      stores={(stores as StoreOption[] | null) ?? []}
      selfId={admin.id}
    />
  );
}
