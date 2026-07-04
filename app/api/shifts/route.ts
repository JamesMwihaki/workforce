import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { one } from '@/lib/db';
import { ROLES, ROLE_LABELS } from '@/lib/roles';
import { broadcastShift } from '@/lib/broadcast';
import { sendSms } from '@/lib/sms';
import { getTwilioFromNumber } from '@/lib/twilio';
import { formatDate, formatTime } from '@/lib/format';

const Body = z.object({
  role:             z.enum(ROLES),
  shift_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time:         z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  headcount_needed: z.number().int().min(1).max(50),
  // Extra $/hr on top of regular pay, covered by the owner. Needs admin
  // approval before the shift is broadcast.
  incentive_amount: z.number().min(0).max(20).optional().default(0),
});

export async function POST(req: Request) {
  // 1. AuthN: must be a logged-in manager.
  const auth = createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  const { data: manager, error: mgrErr } = await auth
    .from('managers')
    .select('id, name, store_id, is_admin, store:stores(name)')
    .eq('id', user.id)
    .maybeSingle();

  if (mgrErr || !manager) {
    return NextResponse.json({ error: 'Manager profile missing.' }, { status: 403 });
  }

  // 2. Parse + validate.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please fill out every field correctly.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // End "00:00" represents a midnight close (e.g. 4 PM – 12 AM). Otherwise
  // the end must be strictly after the start within the same day.
  const endsAtMidnight = parsed.data.end_time === '00:00' || parsed.data.end_time === '00:00:00';
  const sameDayInvalid = !endsAtMidnight && parsed.data.start_time >= parsed.data.end_time;
  const midnightStartInvalid = endsAtMidnight && (parsed.data.start_time === '00:00' || parsed.data.start_time === '00:00:00');
  if (sameDayInvalid || midnightStartInvalid) {
    return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 });
  }

  // Shift date must fall within the next 14 days (today inclusive).
  // The dashboard chip picker enforces this client-side; we re-check here so
  // a crafted request can't book months out.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setUTCDate(today.getUTCDate() + 13);
  const todayIso = today.toISOString().slice(0, 10);
  const maxIso = maxDate.toISOString().slice(0, 10);
  if (parsed.data.shift_date < todayIso || parsed.data.shift_date > maxIso) {
    return NextResponse.json(
      { error: 'Shift date must be within the next two weeks.' },
      { status: 400 },
    );
  }

  // Incentivised shifts wait for admin approval before any SMS goes out —
  // unless an admin is creating the shift, which approves it implicitly.
  const incentiveAmount = parsed.data.incentive_amount;
  const incentiveStatus =
    incentiveAmount > 0 ? (manager.is_admin ? 'approved' : 'pending') : 'none';

  // 3. Insert via service role so we keep the workers/shift_claims write surface
  //    behind a single trusted entry point.
  const svc = createServiceClient();
  const { data: shift, error: insErr } = await svc
    .from('shift_requests')
    .insert({
      requesting_store_id: manager.store_id,
      created_by:          manager.id,
      role:                parsed.data.role,
      shift_date:          parsed.data.shift_date,
      start_time:          parsed.data.start_time,
      end_time:            parsed.data.end_time,
      headcount_needed:    parsed.data.headcount_needed,
      incentive_amount:    incentiveAmount,
      incentive_status:    incentiveStatus,
      ...(incentiveStatus === 'approved'
        ? { incentive_decided_by: manager.id, incentive_decided_at: new Date().toISOString() }
        : {}),
    })
    .select('id, code, role, shift_date, start_time, end_time, headcount_needed, requesting_store_id')
    .single();

  if (insErr || !shift) {
    return NextResponse.json({ error: 'Could not create the request.' }, { status: 500 });
  }

  // Pending incentive: no worker broadcast — instead text every admin who has
  // a phone on file so the request doesn't sit unnoticed. Awaited for the same
  // Vercel-suspension reason as the worker broadcast below.
  if (incentiveStatus === 'pending') {
    try {
      const { data: admins } = await svc
        .from('managers')
        .select('worker:workers(id, phone)')
        .eq('is_admin', true)
        .not('worker_id', 'is', null);

      const recipients = (admins ?? [])
        .map((a) => one(a.worker))
        .filter((w): w is { id: string; phone: string } => Boolean(w?.phone));

      if (recipients.length > 0) {
        const mgrStoreName = one(manager.store)?.name;
        // Same tap-to-reply sms: links the worker alerts use — one tap plus
        // send, no typing, no website round-trip.
        const from = getTwilioFromNumber();
        const message =
          `[ShiftAlert] Approval needed: ${manager.name} (${mgrStoreName ?? 'unknown store'}) ` +
          `is offering +$${incentiveAmount}/hr for a ${ROLE_LABELS[shift.role as keyof typeof ROLE_LABELS]} on ` +
          `${formatDate(shift.shift_date)}, ${formatTime(shift.start_time)} – ${formatTime(shift.end_time)} ` +
          `(${shift.headcount_needed} worker${shift.headcount_needed === 1 ? '' : 's'}). ` +
          `Tap to approve with bonus: sms:${from}?&body=APPROVE%20${shift.code} ` +
          `or send at regular pay: sms:${from}?&body=DENY%20${shift.code}`;

        await sendSms(
          shift.id,
          'incentive_approval',
          message,
          recipients.map((w) => ({ workerId: w.id, phone: w.phone })),
        );
      }
    } catch (e) {
      console.error('[shifts] incentive approval sms failed:', e);
    }

    return NextResponse.json({ id: shift.id, pending_approval: true });
  }

  // 4. Broadcast before responding. This MUST be awaited: on Vercel the
  //    function is suspended as soon as the response returns, so a
  //    fire-and-forget broadcast stalls until some later request thaws the
  //    instance (workers got their alert only after one of them texted in).
  //    Errors are still non-fatal — the shift exists; the manager can resend.
  const storeName = one(manager.store)?.name;

  try {
    await broadcastShift({
      shiftId:          shift.id,
      shiftCode:        shift.code,
      storeName:        storeName ?? 'a neighbouring store',
      role:             shift.role,
      shiftDate:        shift.shift_date,
      startTime:        shift.start_time,
      endTime:          shift.end_time,
      requestingStoreId: shift.requesting_store_id,
      incentiveAmount,
    });
  } catch (e) {
    console.error('[broadcastShift]', e);
  }

  return NextResponse.json({ id: shift.id });
}

