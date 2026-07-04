import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { createLoginCode } from '@/lib/workerAuth';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio';
import { toE164US } from '@/lib/phone';

const Body = z.object({ phone: z.string().trim().min(7).max(32) });

// POST /api/worker/otp — text a login code to a registered worker's phone.
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  const phone = parsed.success ? toE164US(parsed.data.phone) : null;
  if (!phone) {
    return NextResponse.json(
      { error: "That phone number doesn't look right." },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const { data: worker } = await svc
    .from('workers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (!worker) {
    return NextResponse.json(
      { error: 'This number isn\'t registered. Ask your manager, or register first.' },
      { status: 404 },
    );
  }

  const result = await createLoginCode(phone);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  try {
    const client = getTwilioClient();
    await client.messages.create({
      to:   phone,
      from: getTwilioFromNumber(),
      body: `[ShiftAlert] Your login code is ${result.code}. It expires in 10 minutes.`,
    });
  } catch (e) {
    console.error('[worker/otp] sms send', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "We couldn't text you right now. Please try again in a minute." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
