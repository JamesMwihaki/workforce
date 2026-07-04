import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { createServiceClient } from '@/lib/supabase/server';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';
import { checkSameStorePickup } from '@/lib/schedule';
import { decideIncentive } from '@/lib/incentive-decision';

// Twilio posts inbound SMS as application/x-www-form-urlencoded.
// We respond with TwiML so the carrier sends the auto-reply we craft below.

export async function POST(req: Request) {
  // 1. Read the raw body once. We need the parsed params for both signature
  //    validation and our handler logic.
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  // 2. Validate Twilio signature — never trust this endpoint without it,
  //    or anyone can fake "YES" replies.
  if (process.env.NODE_ENV === 'production') {
    const signature = req.headers.get('x-twilio-signature') ?? '';
    const url = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/twilio/reply`
      : new URL(req.url).toString();

    const ok = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN ?? '',
      signature,
      url,
      params,
    );
    if (!ok) return new NextResponse('Forbidden', { status: 403 });
  }

  const fromPhone = (params.From ?? '').trim();
  const bodyText  = (params.Body ?? '').trim();

  if (!fromPhone || !bodyText) return twiml('Sorry, we couldn\'t read that message.');

  const supabase = createServiceClient();

  // 3. Resolve worker by phone.
  const { data: worker } = await supabase
    .from('workers')
    .select('id, name, store_id, roles, is_active, schedule_updated_at')
    .eq('phone', fromPhone)
    .maybeSingle<{
      id:        string;
      name:      string;
      store_id:  string;
      roles:     Role[];
      is_active: boolean;
      schedule_updated_at: string | null;
    }>();

  // 4. STOP: opt out regardless of whether we recognise the worker.
  if (/^stop\b/i.test(bodyText)) {
    if (worker) {
      await supabase.from('workers').update({ is_active: false }).eq('id', worker.id);
    }
    return twiml(
      "You're opted out and won't receive more shift alerts. Reply START to opt back in.",
    );
  }

  // 5. START / restart opt-in (nice to support since STOP is supported).
  if (/^(start|unstop)\b/i.test(bodyText)) {
    if (worker) {
      await supabase.from('workers').update({ is_active: true }).eq('id', worker.id);
    }
    return twiml("You're opted back in for shift alerts. Reply STOP at any time to unsubscribe.");
  }

  // 5a. HELP: required by Twilio toll-free verification. Same response
  // whether or not we recognise the worker — keep it short, factual, and
  // include the STOP keyword.
  if (/^help\b/i.test(bodyText)) {
    return twiml(
      'ShiftAlert (operated by James Karui): shift-pickup alerts for ' +
        'Chipotle crew. Reply YES to claim a shift, STOP to unsubscribe. ' +
        'Msg&data rates may apply. Questions? Contact your manager.',
    );
  }

  // 5b. APPROVE / DENY: an admin deciding an incentive request from the
  //     approval text. Checked before the worker gates because it's an admin
  //     action, not a shift claim (the admin's number is verified against a
  //     manager row with is_admin, not just any worker).
  const decisionMatch = bodyText.match(DECISION_RE);
  if (decisionMatch) {
    const response = await handleIncentiveDecision(
      supabase,
      fromPhone,
      decisionMatch[1].toLowerCase() === 'approve' ? 'approve' : 'decline',
      Number(decisionMatch[2]),
    );
    return twiml(response);
  }

  if (!worker) {
    return twiml(
      "We don't recognise this number. Please register at " +
        (process.env.NEXT_PUBLIC_APP_URL ?? ''),
    );
  }

  if (!worker.is_active) {
    return twiml('You\'re currently opted out. Reply START to receive alerts again.');
  }

  // 6. Only YES (in any case, possibly with extra text or a glued-on code
  //    like "YES42") counts as a claim.
  if (!/\byes\b/i.test(bodyText) && !CODE_RE.test(bodyText)) {
    return twiml('Reply YES to claim a shift, or STOP to unsubscribe.');
  }

  // 7. Identify which shift this is for. A bare YES is never enough — the
  //    reply must carry the shift number from the alert, so nobody gets
  //    booked into a shift they never saw.
  if (!CODE_RE.test(bodyText)) {
    return twiml(
      'Please include the shift number from the alert, e.g. "YES 12" — ' +
        'or just tap the link in the alert message.',
    );
  }

  const shiftId = await resolveShiftId(supabase, bodyText, worker);
  if (!shiftId) {
    return twiml(
      "We couldn't match that shift number to one of your alerts. " +
        'Please double-check the number, e.g. "YES 12".',
    );
  }

  // 8. Atomic claim via claim_shift(): claim-row insert, seat accounting,
  //    duplicate-reply detection, and the one-shift-per-day rule all happen
  //    in a single DB transaction, so a repeat YES can never eat a second seat.
  const { data: shiftForMsg } = await supabase
    .from('shift_requests')
    .select('id, shift_date, start_time, end_time, requesting_store_id')
    .eq('id', shiftId)
    .maybeSingle<{
      id:                  string;
      shift_date:          string;
      start_time:          string;
      end_time:            string;
      requesting_store_id: string;
    }>();

  if (!shiftForMsg) {
    return twiml(
      "We couldn't match your reply to an open shift. The shift may already be filled.",
    );
  }

  // Same-store pickups have extra rules: the worker must have a submitted
  // schedule, be off that day, and stay at or under 40 hours for the week.
  if (shiftForMsg.requesting_store_id === worker.store_id) {
    const check = await checkSameStorePickup(worker.id, worker.schedule_updated_at, shiftForMsg);
    if (!check.eligible) {
      switch (check.reason) {
        case 'no_schedule':
          return twiml(
            'To pick up shifts at your own store, first enter your regular ' +
              `schedule at ${process.env.NEXT_PUBLIC_APP_URL ?? 'the ShiftAlert site'}/worker`,
          );
        case 'scheduled_that_day':
          return twiml(
            `You're already scheduled to work on ${formatDate(shiftForMsg.shift_date)}, ` +
              "so we can't book you for this one.",
          );
        case 'over_40':
          return twiml(
            'Picking up this shift would put you over 40 hours for the week, ' +
              "so we can't book you for it. Thanks for offering!",
          );
      }
    }
  }

  const { data: claimResult, error: claimErr } = await supabase.rpc('claim_shift', {
    p_shift_id:  shiftId,
    p_worker_id: worker.id,
  });

  if (claimErr) {
    console.error('[twilio/reply] claim_shift', claimErr);
    return twiml('Something went wrong on our end. Please try again in a minute.');
  }

  const when =
    `${formatDate(shiftForMsg.shift_date)} ` +
    `${formatTime(shiftForMsg.start_time)}-${formatTime(shiftForMsg.end_time)}`;

  switch (claimResult as string) {
    case 'confirmed': {
      const storeName = await getStoreName(supabase, shiftForMsg.requesting_store_id);
      return twiml(`You're confirmed for ${when} at ${storeName}. Thank you!`);
    }
    case 'already_confirmed': {
      const storeName = await getStoreName(supabase, shiftForMsg.requesting_store_id);
      return twiml(`You're already confirmed for ${when} at ${storeName} — no need to reply again.`);
    }
    case 'day_conflict':
      return twiml(
        `You're already confirmed for another shift on ${formatDate(shiftForMsg.shift_date)}, ` +
          "so we can't book you for this one too. We'll reach out for future shifts.",
      );
    case 'already_waitlisted':
    case 'waitlisted':
      return twiml(
        "Thanks for responding — this shift has been filled. We'll reach out for future shifts.",
      );
    case 'closed':
    case 'not_found':
    default:
      return twiml('This shift is no longer available. We\'ll reach out for future shifts.');
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

// "YES 42", "yes #42", "YES42" — the short code broadcast in every alert.
const CODE_RE = /\byes\s*#?\s*(\d{1,9})\b/i;
// "APPROVE 42" / "DENY 42" — admin decision on an incentive request.
const DECISION_RE = /\b(approve|deny)\s*#?\s*(\d{1,9})\b/i;

// Verify the sender is an admin (via their linked worker's phone), resolve the
// code to a shift, and run the shared decide-and-broadcast path.
async function handleIncentiveDecision(
  supabase: ReturnType<typeof createServiceClient>,
  fromPhone: string,
  action: 'approve' | 'decline',
  code: number,
): Promise<string> {
  const { data: admins } = await supabase
    .from('managers')
    .select('id, worker:workers!inner(phone)')
    .eq('is_admin', true)
    .eq('worker.phone', fromPhone);

  const admin = (admins ?? [])[0];
  if (!admin) {
    // Not an admin — same generic nudge a worker gets for any non-YES text.
    return 'Reply YES to claim a shift, or STOP to unsubscribe.';
  }

  const { data: shift } = await supabase
    .from('shift_requests')
    .select('id')
    .eq('code', code)
    .maybeSingle();

  if (!shift) {
    return `We couldn't find a shift with number ${code}. Double-check the approval text, e.g. "APPROVE 12".`;
  }

  const result = await decideIncentive({ shiftId: shift.id, action, adminId: admin.id });

  if (!result.ok) {
    switch (result.reason) {
      case 'already_decided':
        return `Shift ${code} has already been decided — nothing more to do.`;
      case 'not_open':
        return `Shift ${code} is no longer open, so there's nothing to approve.`;
      case 'date_passed':
        return `Shift ${code}'s date has already passed, so it wasn't sent.`;
      default:
        return 'Something went wrong on our end. Please decide it at the admin page instead.';
    }
  }

  const when =
    `${formatDate(result.shift.shift_date)} ` +
    `${formatTime(result.shift.start_time)}-${formatTime(result.shift.end_time)}`;

  return action === 'approve'
    ? `Approved — workers are being texted about the +$${result.shift.incentive_amount}/hr ` +
        `${ROLE_LABELS[result.shift.role]} shift at ${result.shift.store_name} (${when}).`
    : `Got it — shift ${code} was sent to workers at regular pay (no bonus).`;
}

async function resolveShiftId(
  supabase: ReturnType<typeof createServiceClient>,
  bodyText: string,
  worker: { id: string; store_id: string; roles: Role[] },
): Promise<string | null> {
  // The short shift code from the alert. Scope the lookup to shifts this
  // worker could have been alerted about (matching role; own-store shifts are
  // allowed and get the schedule/40-hour checks in the caller) so a guessed
  // code can't book them somewhere invalid.
  // No status filter — claim_shift decides between confirm/waitlist/closed.
  const codeMatch = bodyText.match(CODE_RE);
  if (!codeMatch) return null; // caller already rejected code-less replies

  const { data } = await supabase
    .from('shift_requests')
    .select('id')
    .eq('code', Number(codeMatch[1]))
    .in('role', worker.roles)
    .maybeSingle();
  return data?.id ?? null;
}

async function getStoreName(
  supabase: ReturnType<typeof createServiceClient>,
  storeId: string,
): Promise<string> {
  const { data } = await supabase
    .from('stores')
    .select('name')
    .eq('id', storeId)
    .maybeSingle();
  return data?.name ?? 'the requesting store';
}

function twiml(message: string): NextResponse {
  // Tiny hand-rolled TwiML — keeps us off the twilio SDK for the response path.
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Response><Message>${escapeXml(message)}</Message></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

