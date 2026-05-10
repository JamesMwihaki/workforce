import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireManager } from '@/lib/auth';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';
import DeleteShiftButton from './DeleteShiftButton';

type ShiftRow = {
  id:                  string;
  role:                Role;
  shift_date:          string;
  start_time:          string;
  end_time:            string;
  headcount_needed:    number;
  headcount_confirmed: number;
  status:              'open' | 'filled' | 'cancelled';
  created_at:          string;
};

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const manager = await requireManager();
  const supabase = createClient();

  // History = anything not on the active dashboard:
  //   • shifts whose date has passed (regardless of status)
  //   • shifts that were cancelled (regardless of date — including future ones)
  // Same UTC-date assumption as the active list; see app/dashboard/page.tsx.
  const todayUtc = new Date().toISOString().slice(0, 10);

  const { data: shifts, error } = await supabase
    .from('shift_requests')
    .select(
      'id, role, shift_date, start_time, end_time, headcount_needed, headcount_confirmed, status, created_at',
    )
    .eq('requesting_store_id', manager.store_id)
    .or(`shift_date.lt.${todayUtc},status.eq.cancelled`)
    .order('shift_date', { ascending: false })
    .order('start_time', { ascending: false });

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
        ← Active requests
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load history: {error.message}
        </p>
      )}

      {!error && (!shifts || shifts.length === 0) && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          No past or cancelled shifts.
        </div>
      )}

      <ul className="space-y-2">
        {(shifts as ShiftRow[] | null)?.map((s) => (
          <li
            key={s.id}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/dashboard/requests/${s.id}`}
                className="min-w-0 flex-1 hover:underline"
              >
                <p className="font-medium">
                  {ROLE_LABELS[s.role]} · {formatDate(s.shift_date)}
                </p>
                <p className="text-sm text-gray-600">
                  {formatTime(s.start_time)} – {formatTime(s.end_time)}
                </p>
              </Link>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={s.status} />
                <span className="text-xs text-gray-600">
                  {s.headcount_confirmed} / {s.headcount_needed} confirmed
                </span>
                {s.status === 'cancelled' && <DeleteShiftButton id={s.id} />}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: ShiftRow['status'] }) {
  const styles: Record<ShiftRow['status'], string> = {
    open:      'bg-blue-50 text-blue-700 ring-blue-200',
    filled:    'bg-green-50 text-green-700 ring-green-200',
    cancelled: 'bg-gray-100 text-gray-600 ring-gray-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {status}
    </span>
  );
}
