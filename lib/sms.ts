import { createServiceClient } from '@/lib/supabase/server';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio';

export type SmsKind =
  | 'shift_alert'
  | 'shift_cancelled'
  | 'claim_cancelled'
  | 'incentive_approval';

export type SmsRecipient = {
  workerId: string | null;
  phone:    string;
};

// Send one message body to many recipients and record every attempt in
// sms_log — that's what lets the dashboard say "12 workers alerted" and makes
// send failures queryable instead of vanishing into function logs.
export async function sendSms(
  shiftId: string,
  kind: SmsKind,
  body: string,
  recipients: SmsRecipient[],
): Promise<{ sent: number; failed: number }> {
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const client = getTwilioClient();
  const from = getTwilioFromNumber();

  const results = await Promise.allSettled(
    recipients.map((r) => client.messages.create({ to: r.phone, from, body })),
  );

  const rows = recipients.map((r, i) => {
    const res = results[i];
    const base = {
      shift_request_id: shiftId,
      worker_id:        r.workerId,
      phone:            r.phone,
      kind,
    };
    if (res.status === 'fulfilled') {
      return { ...base, twilio_sid: res.value.sid, status: 'sent', error: null };
    }
    const reason =
      res.reason instanceof Error ? res.reason.message : String(res.reason);
    console.error('[sendSms]', kind, r.phone, reason);
    return { ...base, twilio_sid: null, status: 'failed', error: reason.slice(0, 500) };
  });

  const svc = createServiceClient();
  const { error } = await svc.from('sms_log').insert(rows);
  if (error) console.error('[sendSms] log insert', error);

  const sent = rows.filter((r) => r.status === 'sent').length;
  return { sent, failed: rows.length - sent };
}

// How many workers actually received the initial alert for a shift.
export async function countAlerted(shiftId: string): Promise<number> {
  const svc = createServiceClient();
  const { count } = await svc
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .eq('shift_request_id', shiftId)
    .eq('kind', 'shift_alert')
    .eq('status', 'sent');
  return count ?? 0;
}
