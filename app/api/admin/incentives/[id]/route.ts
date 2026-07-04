import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { broadcastShift } from '@/lib/broadcast';
import type { Role } from '@/lib/roles';

const Params = z.object({ id: z.uuid() });
const Body = z.object({ action: z.enum(['approve', 'decline']) });

// POST /api/admin/incentives/[id] — decide a pending incentive request.
// approve: broadcast the shift with the bonus. decline: broadcast at regular
// pay (the shift itself is still wanted — only the extra money was declined).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  const parsedParams = Params.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid shift id.' }, { status: 400 });
  }
  const { id } = parsedParams.data;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }
  const { action } = parsed.data;

  const svc = createServiceClient();

  const { data: shift } = await svc
    .from('shift_requests')
    .select(
      'id, code, role, shift_date, start_time, end_time, status, incentive_status, incentive_amount, requesting_store_id, store:stores(name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (!shift) {
    return NextResponse.json({ error: 'Shift not found.' }, { status: 404 });
  }
  if (shift.incentive_status !== 'pending') {
    return NextResponse.json(
      { error: 'This request has already been decided.' },
      { status: 409 },
    );
  }
  if (shift.status !== 'open') {
    return NextResponse.json(
      { error: 'This shift is no longer open.' },
      { status: 409 },
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  if (shift.shift_date < todayIso) {
    return NextResponse.json(
      { error: 'This shift date has already passed.' },
      { status: 409 },
    );
  }

  const { error: updErr } = await svc
    .from('shift_requests')
    .update({
      incentive_status:     action === 'approve' ? 'approved' : 'declined',
      incentive_decided_by: admin.id,
      incentive_decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('incentive_status', 'pending'); // guard against a concurrent decision

  if (updErr) {
    return NextResponse.json(
      { error: `Couldn't save the decision: ${updErr.message}` },
      { status: 500 },
    );
  }

  // The decision is what releases the broadcast (see /api/shifts POST — it
  // must be awaited so Vercel doesn't suspend the function mid-send).
  const store = Array.isArray(shift.store) ? shift.store[0] : shift.store;
  try {
    await broadcastShift({
      shiftId:           shift.id,
      shiftCode:         shift.code,
      storeName:         (store as { name?: string } | null)?.name ?? 'a neighbouring store',
      role:              shift.role as Role,
      shiftDate:         shift.shift_date,
      startTime:         shift.start_time,
      endTime:           shift.end_time,
      requestingStoreId: shift.requesting_store_id,
      incentiveAmount:   action === 'approve' ? Number(shift.incentive_amount) : 0,
    });
  } catch (e) {
    console.error('[admin/incentives] broadcast failed:', e);
  }

  return NextResponse.json({ ok: true });
}
