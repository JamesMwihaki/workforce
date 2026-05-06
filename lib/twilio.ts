import twilio from 'twilio';

let cached: ReturnType<typeof twilio> | null = null;

export function getTwilioClient() {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio credentials missing (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).');
  }
  cached = twilio(sid, token);
  return cached;
}

export function getTwilioFromNumber(): string {
  const num = process.env.TWILIO_PHONE_NUMBER;
  if (!num) throw new Error('TWILIO_PHONE_NUMBER is not set.');
  return num;
}
