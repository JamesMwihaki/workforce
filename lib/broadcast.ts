import { createServiceClient } from '@/lib/supabase/server';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';

type BroadcastInput = {
  shiftId:           string;
  storeName:         string;
  role:              Role;
  shiftDate:         string;
  startTime:         string;
  endTime:           string;
  requestingStoreId: string;
};

// Sends an SMS to every active worker at neighbouring stores who covers the
// requested role. The shift_request_id is embedded in the body so the Twilio
// webhook can match a YES reply back to the right shift.
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

  const message =
    `[ShiftAlert] ${input.storeName} needs a ${ROLE_LABELS[input.role]} on ` +
    `${formatDate(input.shiftDate)} from ${formatTime(input.startTime)} to ${formatTime(input.endTime)}. ` +
    `Reply YES to claim this shift. Reply STOP to unsubscribe. ` +
    `Shift ID: ${input.shiftId}`;

  const client = getTwilioClient();
  const from = getTwilioFromNumber();

  // Send in parallel but cap concurrency loosely by awaiting Promise.allSettled
  // so one bad number doesn't tank the broadcast.
  await Promise.allSettled(
    workers.map((w) =>
      client.messages.create({ to: w.phone, from, body: message }).catch((e) => {
        console.error('[broadcastShift] sms send', w.phone, e?.message ?? e);
      }),
    ),
  );
}
