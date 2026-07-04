import { createHmac, createHash, randomInt, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { one } from '@/lib/db';

// Worker portal auth: SMS one-time codes + an HMAC-signed session cookie.
// Workers have no Supabase Auth accounts — their verified phone number is
// their identity, so login is "text me a code".

const COOKIE_NAME = 'worker_session';
const SESSION_DAYS = 30;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_WINDOW = 3; // per phone per 15 minutes
const OTP_WINDOW_MINUTES = 15;

function secret(): string {
  const s = process.env.WORKER_SESSION_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('WORKER_SESSION_SECRET (or NEXTAUTH_SECRET) is not set.');
  return s;
}

function hashCode(code: string, phone: string): string {
  return createHash('sha256').update(`${code}:${phone}:${secret()}`).digest('hex');
}

// ─── OTP issue / verify ─────────────────────────────────────────────────────

export type OtpRequestResult =
  | { ok: true; code: string }
  | { ok: false; error: string; status: number };

// Creates a login code for a phone (rate-limited). The caller sends the SMS —
// keeping Twilio out of this module makes the verify path testable.
export async function createLoginCode(phone: string): Promise<OtpRequestResult> {
  const svc = createServiceClient();

  const windowStart = new Date(Date.now() - OTP_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await svc
    .from('worker_otps')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= OTP_MAX_PER_WINDOW) {
    return {
      ok: false,
      status: 429,
      error: 'Too many codes requested. Please wait a few minutes and try again.',
    };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error } = await svc.from('worker_otps').insert({
    phone,
    code_hash:  hashCode(code, phone),
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  });

  if (error) {
    console.error('[workerAuth] otp insert', error);
    return { ok: false, status: 500, error: 'Could not create a login code.' };
  }

  return { ok: true, code };
}

// Verifies a code for a phone. Consumes all codes for the phone on success.
export async function verifyLoginCode(phone: string, code: string): Promise<boolean> {
  const svc = createServiceClient();

  const { data: rows } = await svc
    .from('worker_otps')
    .select('id, code_hash, attempts, expires_at')
    .eq('phone', phone)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  const row = rows?.[0];
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return false;

  const expected = Buffer.from(row.code_hash);
  const actual = Buffer.from(hashCode(code.trim(), phone));
  const match = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!match) {
    await svc
      .from('worker_otps')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);
    return false;
  }

  await svc.from('worker_otps').delete().eq('phone', phone);
  return true;
}

// ─── Session cookie ─────────────────────────────────────────────────────────

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionValue(workerId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ w: workerId, exp: Date.now() + SESSION_DAYS * 86_400_000 }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function sessionCookieOptions() {
  return {
    name:     COOKIE_NAME,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   SESSION_DAYS * 86_400,
  };
}

function parseSessionValue(value: string): string | null {
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = value.slice(0, dot);
  const sig = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof parsed.w !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Date.now()) return null;
    return parsed.w;
  } catch {
    return null;
  }
}

export type PortalWorker = {
  id:          string;
  name:        string;
  phone:       string;
  employee_id: string;
  store_id:    string;
  roles:       string[];
  is_active:   boolean;
  schedule_updated_at: string | null;
  store: { id: string; name: string } | null;
};

// Resolve the logged-in worker from the session cookie, or null.
export async function getPortalWorker(): Promise<PortalWorker | null> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const workerId = parseSessionValue(raw);
  if (!workerId) return null;

  const svc = createServiceClient();
  const { data } = await svc
    .from('workers')
    .select(
      'id, name, phone, employee_id, store_id, roles, is_active, schedule_updated_at, store:stores(id, name)',
    )
    .eq('id', workerId)
    .maybeSingle();

  if (!data) return null;
  return { ...data, store: one(data.store) } as PortalWorker;
}
