import { createServiceClient } from '@/lib/supabase/server';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';

type BroadcastInput = {
  shiftId:           string;
  shiftCode:         number;
  storeName:         string;
  role:              Role;
  shiftDate:         string;
  startTime:         string;
  endTime:           string;
  requestingStoreId: string;
};

// Sends an SMS to every active worker at neighbouring stores who covers the
// requested role. The short shift code is embedded in the body (and in a
// tap-to-reply sms: link) so the Twilio webhook can match a "YES 42" reply
// back to the right shift.
export async function broadcastShift(input: BroadcastInput): Promise<void> {
  const supabase = createServiceClient();

  const { data: workers, error } = await supabase
    .from('workers')
    .select('id, phone, roles, store_id, is_active')
    .neq('store_id', input.requestingStoreId)
    .eq('is_active', true)
    .contains('roles', [input.role]);

  if (error) {
    console.error('[broadcastShift] worker lookup', error);
    return;
  }

  if (!workers || workers.length === 0) return;

  // Skip workers already confirmed for a shift on this date — they're booked
  // and shouldn't be asked to cover another shift the same day.
  const { data: dayClaims, error: claimsErr } = await supabase
    .from('shift_claims')
    .select('worker_id, shift_requests!inner(shift_date, status)')
    .eq('status', 'confirmed')
    .eq('shift_requests.shift_date', input.shiftDate)
    .neq('shift_requests.status', 'cancelled')
    .in('worker_id', workers.map((w) => w.id));

  if (claimsErr) {
    console.error('[broadcastShift] day-claims lookup', claimsErr);
    return;
  }

  const bookedWorkerIds = new Set((dayClaims ?? []).map((c) => c.worker_id));
  const recipients = workers.filter((w) => !bookedWorkerIds.has(w.id));
  if (recipients.length === 0) return;

  const client = getTwilioClient();
  const from = getTwilioFromNumber();

  // The sms: link opens the worker's messaging app with the reply pre-typed —
  // one tap plus send, no typing. The ?&body= form works on both iOS and Android.
  const message =
    `[ShiftAlert] ${input.storeName} needs a ${ROLE_LABELS[input.role]} on ` +
    `${formatDate(input.shiftDate)} from ${formatTime(input.startTime)} to ${formatTime(input.endTime)}. ` +
    `Reply "YES ${input.shiftCode}" to claim, or tap: ` +
    `sms:${from}?&body=YES%20${input.shiftCode} ` +
    `Reply HELP for help, STOP to unsubscribe.`;

  // Send in parallel but cap concurrency loosely by awaiting Promise.allSettled
  // so one bad number doesn't tank the broadcast.
  await Promise.allSettled(
    recipients.map((w) =>
      client.messages.create({ to: w.phone, from, body: message }).catch((e) => {
        console.error('[broadcastShift] sms send', w.phone, e?.message ?? e);
      }),
    ),
  );
}
