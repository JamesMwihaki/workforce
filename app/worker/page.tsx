import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalWorker } from '@/lib/workerAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';
import type { ScheduleEntry } from '@/lib/schedule';
import ScheduleForm from './ScheduleForm';

export const dynamic = 'force-dynamic';

type UpcomingShift = {
  id:         string;
  role:       Role;
  shift_date: string;
  start_time: string;
  end_time:   string;
  store_name: string;
};

export default async function WorkerPortalPage() {
  const worker = await getPortalWorker();
  if (!worker) redirect('/worker/login');

  const svc = createServiceClient();
  const todayUtc = new Date().toISOString().slice(0, 10);

  const [{ data: claims }, { data: schedule }] = await Promise.all([
    svc
      .from('shift_claims')
      .select(
        'shift_requests!inner(id, role, shift_date, start_time, end_time, status, store:stores(name))',
      )
      .eq('worker_id', worker.id)
      .eq('status', 'confirmed')
      .gte('shift_requests.shift_date', todayUtc)
      .neq('shift_requests.status', 'cancelled')
      .order('shift_date', { referencedTable: 'shift_requests', ascending: true }),
    svc
      .from('worker_schedules')
      .select('weekday, start_time, end_time')
      .eq('worker_id', worker.id),
  ]);

  const upcoming: UpcomingShift[] = (claims ?? []).flatMap((c) => {
    const shift = Array.isArray(c.shift_requests) ? c.shift_requests[0] : c.shift_requests;
    if (!shift) return [];
    const store = Array.isArray(shift.store) ? shift.store[0] : shift.store;
    return [
      {
        id:         shift.id,
        role:       shift.role as Role,
        shift_date: shift.shift_date,
        start_time: shift.start_time,
        end_time:   shift.end_time,
        store_name: store?.name ?? '—',
      },
    ];
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/worker" className="font-semibold tracking-tight">
            ShiftAlert
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-600 sm:inline">{worker.name}</span>
            <form action="/api/worker/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-4 py-6 sm:px-6">
        <section className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Hi, {worker.name.split(' ')[0]}</h1>
          <p className="text-sm text-gray-600">
            Home store: {worker.store?.name ?? '—'}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Shifts you picked up</h2>
          {upcoming.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-white px-4 py-5 text-sm text-gray-500">
              Nothing coming up. When you claim a shift by texting YES, it shows
              up here.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {upcoming.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">
                      {formatDate(s.shift_date)}
                    </span>
                    <span className="text-sm text-gray-600">
                      {formatTime(s.start_time)} – {formatTime(s.end_time)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {ROLE_LABELS[s.role]} · {s.store_name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ScheduleForm
          initialEntries={(schedule ?? []) as ScheduleEntry[]}
          hasSubmitted={worker.schedule_updated_at !== null}
        />
      </main>
    </div>
  );
}
