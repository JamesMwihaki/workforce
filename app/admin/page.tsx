import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  // Layout already enforced requireAdmin; safe to read with the service role.
  const svc = createServiceClient();

  const todayUtc = new Date().toISOString().slice(0, 10);

  const [stores, managers, workers, openShifts] = await Promise.all([
    svc.from('stores').select('id', { count: 'exact', head: true }),
    svc.from('managers').select('id', { count: 'exact', head: true }),
    svc
      .from('workers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    svc
      .from('shift_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('shift_date', todayUtc),
  ]);

  const cards = [
    { label: 'Stores',         count: stores.count ?? 0,     href: '/admin/stores' },
    { label: 'Managers',       count: managers.count ?? 0,   href: '/admin/managers' },
    { label: 'Active workers', count: workers.count ?? 0,    href: '/admin/workers' },
    { label: 'Open shifts',    count: openShifts.count ?? 0, href: '/dashboard' },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Overview</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-400"
          >
            <div className="text-2xl font-semibold tabular-nums">{card.count}</div>
            <div className="text-sm text-gray-600">{card.label}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">
        <p className="font-semibold text-gray-900">Admin tasks</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <Link href="/admin/managers" className="text-gray-900 underline">
              Managers
            </Link>{' '}
            — add manager accounts, assign stores, grant admin access, reset passwords.
          </li>
          <li>
            <Link href="/admin/stores" className="text-gray-900 underline">
              Stores
            </Link>{' '}
            — add stores to the cluster.
          </li>
          <li>
            <Link href="/admin/workers" className="text-gray-900 underline">
              Workers
            </Link>{' '}
            — review registered workers and deactivate ones who left.
          </li>
        </ul>
      </div>
    </div>
  );
}
