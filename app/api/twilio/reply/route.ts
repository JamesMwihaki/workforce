import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { createServiceClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';

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
    .select('id, name, store_id, roles, is_active')
    .eq('phone', fromPhone)
    .maybeSingle<{
      id:        string;
      name:      string;
      store_id:  string;
      roles:     Role[];
      is_active: boolean;
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

  // 7. Identify which shift this is for. Prefer the embedded Shift ID; fall
  //    back to the worker's most recent eligible open shift.
  const shiftId = await resolveShiftId(supabase, bodyText, worker);
  if (!shiftId) {
    return twiml(
      "We couldn't match your reply to an open shift. The shift may already be filled.",
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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// "YES 42", "yes #42", "YES42" — the short code broadcast in every alert.
const CODE_RE = /\byes\s*#?\s*(\d{1,9})\b/i;

async function resolveShiftId(
  supabase: ReturnType<typeof createServiceClient>,
  bodyText: string,
  worker: { id: string; store_id: string; roles: Role[] },
): Promise<string | null> {
  // Preferred: the short shift code from the alert. Scope the lookup to
  // shifts this worker could have been alerted about (matching role, not
  // their own store) so a guessed code can't book them somewhere invalid.
  // No status filter — claim_shift decides between confirm/waitlist/closed.
  const codeMatch = bodyText.match(CODE_RE);
  if (codeMatch) {
    const { data } = await supabase
      .from('shift_requests')
      .select('id')
      .eq('code', Number(codeMatch[1]))
      .neq('requesting_store_id', worker.store_id)
      .in('role', worker.roles)
      .maybeSingle();
    // A code was given; if it doesn't resolve, don't fall through and guess
    // a different shift.
    return data?.id ?? null;
  }

  // Legacy: alerts sent before shift codes embedded the raw UUID.
  const idMatch = bodyText.match(UUID_RE);
  if (idMatch) return idMatch[0];

  // Fallback: most recent open shift in the last 24h that this worker
  // would have been broadcast to (different store, matching role).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('shift_requests')
    .select('id, role, requesting_store_id')
    .eq('status', 'open')
    .neq('requesting_store_id', worker.store_id)
    .in('role', worker.roles)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);

  return data?.[0]?.id ?? null;
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

