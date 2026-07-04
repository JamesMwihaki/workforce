import { createServiceClient } from '@/lib/supabase/server';
import { incentiveOwed } from '@/lib/incentives';
import IncentivesPanel, { type PendingShift, type LedgerRow } from './IncentivesPanel';

export const dynamic = 'force-dynamic';

type ShiftJoin = {
  id:               string;
  role:             string;
  shift_date:       string;
  start_time:       string;
  end_time:         string;
  incentive_amount: number;
  store:            { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function AdminIncentivesPage() {
  // Layout already enforced requireAdmin.
  const svc = createServiceClient();

  const todayUtc = new Date().toISOString().slice(0, 10);

  const [{ data: pending }, { data: claims }] = await Promise.all([
    svc
      .from('shift_requests')
      .select(
        'id, role, shift_date, start_time, end_time, headcount_needed, incentive_amount, created_at, store:stores(name), creator:managers!shift_requests_created_by_fkey(name)',
      )
      .eq('incentive_status', 'pending')
      .eq('status', 'open')
      .order('created_at', { ascending: true }),
    svc
      .from('shift_claims')
      .select(
        'id, incentive_paid_at, worker:workers(name, employee_id), shift:shift_requests!inner(id, role, shift_date, start_time, end_time, incentive_amount, store:stores(name))',
      )
      .eq('status', 'confirmed')
      .eq('shift_requests.incentive_status', 'approved')
      .neq('shift_requests.status', 'cancelled')
      .order('incentive_paid_at', { ascending: true, nullsFirst: true }),
  ]);

  const pendingRows: PendingShift[] = (pending ?? []).map((s) => ({
    id:               s.id,
    role:             s.role,
    shift_date:       s.shift_date,
    start_time:       s.start_time,
    end_time:         s.end_time,
    headcount_needed: s.headcount_needed,
    incentive_amount: Number(s.incentive_amount),
    store_name:       one(s.store)?.name ?? '—',
    creator_name:     one(s.creator)?.name ?? '—',
    expired:          s.shift_date < todayUtc,
  }));

  // "Work done" = the shift's date has passed. Today's shifts stay in the
  // committed column until tomorrow, so nothing shows as owed before the
  // shift is actually worked.
  const ledgerRows: LedgerRow[] = (claims ?? []).flatMap((c) => {
    const shift = one(c.shift as ShiftJoin | ShiftJoin[] | null);
    if (!shift) return [];
    const worker = one(c.worker as { name: string; employee_id: string } | { name: string; employee_id: string }[] | null);
    const rate = Number(shift.incentive_amount);
    return [
      {
        claim_id:    c.id,
        worker_name: worker?.name ?? '—',
        employee_id: worker?.employee_id ?? '—',
        store_name:  one(shift.store)?.name ?? '—',
        role:        shift.role,
        shift_date:  shift.shift_date,
        start_time:  shift.start_time,
        end_time:    shift.end_time,
        rate,
        owed:        incentiveOwed(rate, shift.start_time, shift.end_time),
        done:        shift.shift_date < todayUtc,
        paid_at:     c.incentive_paid_at,
      },
    ];
  });

  return <IncentivesPanel pending={pendingRows} ledger={ledgerRows} />;
}
