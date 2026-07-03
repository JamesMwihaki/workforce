import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendSms } from '@/lib/sms';
import { formatDate, formatTime } from '@/lib/format';
import { ROLE_LABELS, type Role } from '@/lib/roles';

// DELETE /api/shifts/[id]/claims/[claimId] — manager removes a worker from a
// shift. The cancel_claim() function frees the seat atomically (reopening a
// filled shift), and the worker gets a text so they know not to come in.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; claimId: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  // RLS-scoped lookup confirms the shift belongs to the caller's store and
  // pulls what the notification text needs.
  const { data: shift, error: lookupErr } = await supabase
    .from('shift_requests')
    .select('id, status, role, shift_date, start_time, end_time, store:stores(name)')
    .eq('id', params.id)
    .maybeSingle();

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!shift)    return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const svc = createServiceClient();

  const { data: claim } = await svc
    .from('shift_claims')
    .select('id, worker_id, status, worker:workers(phone)')
    .eq('id', params.claimId)
    .eq('shift_request_id', params.id)
    .maybeSingle();

  if (!claim) return NextResponse.json({ error: 'Claim not found.' }, { status: 404 });
  if (claim.status === 'cancelled') return NextResponse.json({ ok: true });

  const wasConfirmed = claim.status === 'confirmed';

  const { data: result, error: rpcErr } = await svc.rpc('cancel_claim', {
    p_shift_id:  params.id,
    p_worker_id: claim.worker_id,
  });

  if (rpcErr) {
    console.error('[claims delete] cancel_claim', rpcErr);
    return NextResponse.json({ error: 'Could not remove the worker.' }, { status: 500 });
  }
  if (result !== 'cancelled' && result !== 'already_cancelled') {
    return NextResponse.json({ error: 'Claim not found.' }, { status: 404 });
  }

  // Only a confirmed worker was told they're working — they're the only one
  // who needs to hear otherwise. If the whole shift is already cancelled they
  // were texted by the shift-cancel path; don't text twice.
  const worker = Array.isArray(claim.worker) ? claim.worker[0] : claim.worker;
  if (wasConfirmed && shift.status !== 'cancelled' && worker?.phone) {
    const store = Array.isArray(shift.store) ? shift.store[0] : shift.store;
    const message =
      `[ShiftAlert] Update: you've been taken off the ${ROLE_LABELS[shift.role as Role]} ` +
      `shift on ${formatDate(shift.shift_date)} from ${formatTime(shift.start_time)} to ` +
      `${formatTime(shift.end_time)} at ${store?.name ?? 'the requesting store'}. ` +
      `You do not need to come in. Sorry for the change!`;
    await sendSms(params.id, 'claim_cancelled', message, [
      { workerId: claim.worker_id, phone: worker.phone },
    ]);
  }

  return NextResponse.json({ ok: true });
}
