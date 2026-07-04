import { createServiceClient } from '@/lib/supabase/server';
import { broadcastShift } from '@/lib/broadcast';
import type { Role } from '@/lib/roles';

export type DecideOutcome =
  | {
      ok: true;
      shift: {
        id:               string;
        role:             Role;
        shift_date:       string;
        start_time:       string;
        end_time:         string;
        incentive_amount: number;
        store_name:       string;
      };
    }
  | { ok: false; reason: 'not_found' | 'already_decided' | 'not_open' | 'date_passed' | 'db_error' };

// Decide a pending incentive request and release the broadcast. Shared by the
// admin dashboard endpoint and the APPROVE/DENY SMS reply path — the decision
// itself is what triggers the worker broadcast, so it must be awaited.
export async function decideIncentive(opts: {
  shiftId: string;
  action: 'approve' | 'decline';
  adminId: string;
}): Promise<DecideOutcome> {
  const svc = createServiceClient();

  const { data: shift } = await svc
    .from('shift_requests')
    .select(
      'id, code, role, shift_date, start_time, end_time, status, incentive_status, incentive_amount, requesting_store_id, store:stores(name)',
    )
    .eq('id', opts.shiftId)
    .maybeSingle();

  if (!shift) return { ok: false, reason: 'not_found' };
  if (shift.incentive_status !== 'pending') return { ok: false, reason: 'already_decided' };
  if (shift.status !== 'open') return { ok: false, reason: 'not_open' };

  const todayIso = new Date().toISOString().slice(0, 10);
  if (shift.shift_date < todayIso) return { ok: false, reason: 'date_passed' };

  const { error: updErr } = await svc
    .from('shift_requests')
    .update({
      incentive_status:     opts.action === 'approve' ? 'approved' : 'declined',
      incentive_decided_by: opts.adminId,
      incentive_decided_at: new Date().toISOString(),
    })
    .eq('id', opts.shiftId)
    .eq('incentive_status', 'pending'); // guard against a concurrent decision

  if (updErr) {
    console.error('[decideIncentive] update failed:', updErr);
    return { ok: false, reason: 'db_error' };
  }

  const store = Array.isArray(shift.store) ? shift.store[0] : shift.store;
  const storeName = (store as { name?: string } | null)?.name ?? 'a neighbouring store';

  try {
    await broadcastShift({
      shiftId:           shift.id,
      shiftCode:         shift.code,
      storeName,
      role:              shift.role as Role,
      shiftDate:         shift.shift_date,
      startTime:         shift.start_time,
      endTime:           shift.end_time,
      requestingStoreId: shift.requesting_store_id,
      incentiveAmount:   opts.action === 'approve' ? Number(shift.incentive_amount) : 0,
    });
  } catch (e) {
    // Non-fatal: the decision is saved; the shift just wasn't broadcast.
    console.error('[decideIncentive] broadcast failed:', e);
  }

  return {
    ok: true,
    shift: {
      id:               shift.id,
      role:             shift.role as Role,
      shift_date:       shift.shift_date,
      start_time:       shift.start_time,
      end_time:         shift.end_time,
      incentive_amount: Number(shift.incentive_amount),
      store_name:       storeName,
    },
  };
}
