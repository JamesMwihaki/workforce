import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireManager } from '@/lib/auth';
import type { Role } from '@/lib/roles';
import ShiftList from './ShiftList';

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

export default async function DashboardPage() {
  const manager = await requireManager();
  const supabase = createClient();

  // "Active" = open/filled shifts whose date hasn't passed. We compare on
  // the UTC date for simplicity; for US Central stores this means today's
  // shifts roll off the dashboard around 7pm local — close enough to "the
  // day is over" without bringing tz handling into the query path.
  const todayUtc = new Date().toISOString().slice(0, 10);

  const { data: shifts, error } = await supabase
    .from('shift_requests')
    .select(
      'id, role, shift_date, start_time, end_time, headcount_needed, headcount_confirmed, status, created_at',
    )
    .eq('requesting_store_id', manager.store_id)
    .neq('status', 'cancelled')
    .gte('shift_date', todayUtc)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Shift requests</h1>
        <Link
          href="/dashboard/new"
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          New request
        </Link>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load requests: {error.message}
        </p>
      )}

      {!error && (
        <ShiftList
          shifts={(shifts as ShiftRow[] | null) ?? []}
          todayIso={todayUtc}
        />
      )}

      <div className="pt-2 text-center">
        <Link
          href="/dashboard/history"
          className="text-sm text-gray-600 hover:underline"
        >
          View history →
        </Link>
      </div>
    </div>
  );
}
