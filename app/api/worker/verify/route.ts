import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import {
  verifyLoginCode,
  createSessionValue,
  sessionCookieOptions,
} from '@/lib/workerAuth';
import { toE164US } from '@/lib/phone';

const Body = z.object({
  phone: z.string().trim().min(7).max(32),
  code:  z.string().trim().regex(/^\d{6}$/),
});

// POST /api/worker/verify — exchange phone + code for a worker session cookie.
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  const phone = parsed.success ? toE164US(parsed.data.phone) : null;
  if (!parsed.success || !phone) {
    return NextResponse.json({ error: 'Enter the 6-digit code from the text.' }, { status: 400 });
  }

  const ok = await verifyLoginCode(phone, parsed.data.code);
  if (!ok) {
    return NextResponse.json(
      { error: "That code didn't match (or expired). Request a new one." },
      { status: 401 },
    );
  }

  const svc = createServiceClient();
  const { data: worker } = await svc
    .from('workers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (!worker) {
    return NextResponse.json({ error: 'This number isn\'t registered.' }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true });
  const { name, ...options } = sessionCookieOptions();
  res.cookies.set(name, createSessionValue(worker.id), options);
  return res;
}
