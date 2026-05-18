import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { toE164US } from '@/lib/phone';
import { ROLES, ROLE_LABELS } from '@/lib/roles';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio';

// UUID-shape check (8-4-4-4-12 hex). We don't use Zod's strict .uuid() because
// it enforces RFC 4122 variant bits that Postgres's uuid type doesn't require —
// values like '55555555-5555-5555-5555-555555555555' are valid in the DB but
// fail the strict check.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  employee_id:  z.string().trim().min(1).max(64),
  name:         z.string().trim().min(1).max(120),
  phone:        z.string().trim().min(7).max(32),
  store_id:     z.string().regex(UUID_SHAPE, 'Invalid store id'),
  roles:        z.array(z.enum(ROLES)).min(1),
  sms_opted_in: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;
    const FIELD_LABELS: Record<string, string> = {
      employee_id: 'Employee ID',
      name:        'Full name',
      phone:       'Phone number',
      store_id:    'Home store',
      roles:       'Roles',
    };

    // Build a single human-readable error from the first failing field.
    const firstField = Object.keys(fieldErrors).find(
      (k) => (fieldErrors[k]?.length ?? 0) > 0,
    );
    const message = firstField
      ? `${FIELD_LABELS[firstField] ?? firstField}: ${fieldErrors[firstField]![0]}`
      : 'Please fill out every field.';

    return NextResponse.json(
      { error: message, fieldErrors },
      { status: 400 },
    );
  }

  const phoneE164 = toE164US(parsed.data.phone);
  if (!phoneE164) {
    return NextResponse.json(
      { error: 'That phone number doesn\'t look right. Please use a US/CA number.' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Pre-check on employee_id so we can return a nicer message than the
  // generic Postgres unique-violation error.
  const { data: existing, error: lookupErr } = await supabase
    .from('workers')
    .select('id')
    .eq('employee_id', parsed.data.employee_id)
    .maybeSingle();

  if (lookupErr) {
    console.error('[workers/register] employee_id lookup failed:', lookupErr);
    return NextResponse.json(
      {
        error: 'Server error. Please try again.',
        debug:
          process.env.NODE_ENV === 'development'
            ? { stage: 'lookup', code: lookupErr.code, message: lookupErr.message, hint: lookupErr.hint }
            : undefined,
      },
      { status: 500 },
    );
  }
  if (existing) {
    return NextResponse.json(
      { error: 'That employee ID is already registered.' },
      { status: 409 },
    );
  }

  // SMS consent is optional per Twilio toll-free policy. Workers who didn't
  // opt in are saved with is_active=false so broadcastShift() skips them and
  // we don't send a welcome SMS below.
  const { error: insertErr } = await supabase.from('workers').insert({
    employee_id: parsed.data.employee_id,
    name:        parsed.data.name,
    phone:       phoneE164,
    store_id:    parsed.data.store_id,
    roles:       parsed.data.roles,
    is_active:   parsed.data.sms_opted_in,
  });

  if (insertErr) {
    // Most common race: the phone number is already on file under a different
    // employee_id. Surface a useful message.
    if (insertErr.code === '23505') {
      return NextResponse.json(
        { error: 'That phone number is already registered.' },
        { status: 409 },
      );
    }
    console.error('[workers/register] insert failed:', insertErr);
    return NextResponse.json(
      {
        error: 'Server error. Please try again.',
        debug:
          process.env.NODE_ENV === 'development'
            ? { stage: 'insert', code: insertErr.code, message: insertErr.message, hint: insertErr.hint }
            : undefined,
      },
      { status: 500 },
    );
  }

  // Confirmation SMS — only when the worker explicitly opted in. Failure
  // here must not roll back the registration; the worker is in the database
  // and can receive future broadcasts even if this single send fails (e.g.
  // Twilio outage, landline number).
  if (!parsed.data.sms_opted_in) {
    return NextResponse.json({ ok: true, sms_opted_in: false });
  }

  try {
    const { data: store } = await supabase
      .from('stores')
      .select('name')
      .eq('id', parsed.data.store_id)
      .single();

    const storeName = store?.name ?? 'your store';
    const roleLabels = parsed.data.roles.map((r) => ROLE_LABELS[r]).join(', ');
    const body =
      `ShiftAlert (operated by James Karui): you're signed up at ${storeName} ` +
      `for ${roleLabels}. We'll text when nearby stores need help. Msg&data ` +
      `rates may apply. Reply HELP for help, STOP to unsubscribe.`;

    await getTwilioClient().messages.create({
      to: phoneE164,
      from: getTwilioFromNumber(),
      body,
    });
  } catch (e) {
    console.error('[workers/register] welcome sms failed:', e);
  }

  return NextResponse.json({ ok: true });
}
