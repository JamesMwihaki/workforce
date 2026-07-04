import { createServiceClient } from '@/lib/supabase/server';

// Weekly-hours math for the same-store pickup rules. The work week runs
// Monday–Sunday; a shift's hours count against the week containing its date.

export type ScheduleEntry = {
  weekday:    number; // 0 = Sunday (JS getDay())
  start_time: string;
  end_time:   string;
};

// Duration in hours of a shift. end '00:00' means a midnight close.
export function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh === 0 && em === 0 ? 24 * 60 : eh * 60 + em;
  return Math.max(0, (endMin - startMin) / 60);
}

export function weeklyScheduleHours(entries: ScheduleEntry[]): number {
  return entries.reduce((sum, e) => sum + shiftHours(e.start_time, e.end_time), 0);
}

// Monday–Sunday bounds (ISO dates) of the week containing dateIso.
export function weekBounds(dateIso: string): { monday: string; sunday: string } {
  const [y, m, d] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - sinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  return { monday: iso(monday), sunday: iso(sunday) };
}

export function weekdayOf(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const WEEKLY_CAP_HOURS = 40;

export type SameStoreCheck =
  | { eligible: true }
  | { eligible: false; reason: 'no_schedule' | 'scheduled_that_day' | 'over_40' };

// Can this worker pick up a shift at their own store?
//  - they must have submitted a regular schedule (otherwise we can't verify),
//  - the shift must fall on a day they're regularly off,
//  - regular hours + already-claimed hours that week + this shift must stay ≤ 40.
export async function checkSameStorePickup(
  workerId: string,
  scheduleUpdatedAt: string | null,
  shift: { id: string; shift_date: string; start_time: string; end_time: string },
): Promise<SameStoreCheck> {
  if (!scheduleUpdatedAt) return { eligible: false, reason: 'no_schedule' };

  const svc = createServiceClient();

  const { data: entries } = await svc
    .from('worker_schedules')
    .select('weekday, start_time, end_time')
    .eq('worker_id', workerId);

  const schedule = (entries ?? []) as ScheduleEntry[];
  if (schedule.some((e) => e.weekday === weekdayOf(shift.shift_date))) {
    return { eligible: false, reason: 'scheduled_that_day' };
  }

  const claimed = await claimedHoursForWeek(svc, [workerId], shift.shift_date, shift.id);
  const total =
    weeklyScheduleHours(schedule) +
    (claimed.get(workerId) ?? 0) +
    shiftHours(shift.start_time, shift.end_time);

  if (total > WEEKLY_CAP_HOURS) return { eligible: false, reason: 'over_40' };
  return { eligible: true };
}

// Confirmed pickup hours per worker for the Mon–Sun week containing dateIso,
// excluding excludeShiftId (the shift being claimed/broadcast).
export async function claimedHoursForWeek(
  svc: ReturnType<typeof createServiceClient>,
  workerIds: string[],
  dateIso: string,
  excludeShiftId?: string,
): Promise<Map<string, number>> {
  const hours = new Map<string, number>();
  if (workerIds.length === 0) return hours;

  const { monday, sunday } = weekBounds(dateIso);
  const { data, error } = await svc
    .from('shift_claims')
    .select('worker_id, shift_requests!inner(id, shift_date, start_time, end_time, status)')
    .eq('status', 'confirmed')
    .in('worker_id', workerIds)
    .gte('shift_requests.shift_date', monday)
    .lte('shift_requests.shift_date', sunday)
    .neq('shift_requests.status', 'cancelled');

  if (error) {
    console.error('[claimedHoursForWeek]', error);
    return hours;
  }

  for (const row of data ?? []) {
    const shift = Array.isArray(row.shift_requests) ? row.shift_requests[0] : row.shift_requests;
    if (!shift || shift.id === excludeShiftId) continue;
    hours.set(
      row.worker_id,
      (hours.get(row.worker_id) ?? 0) + shiftHours(shift.start_time, shift.end_time),
    );
  }
  return hours;
}

// Workers at the requesting store who may be texted about this shift:
// active, matching role, schedule submitted, off that day, and the pickup
// keeps their Mon–Sun week at or under 40 hours.
export async function eligibleSameStoreWorkers(input: {
  requestingStoreId: string;
  role:              string;
  shiftId:           string;
  shiftDate:         string;
  startTime:         string;
  endTime:           string;
}): Promise<{ id: string; phone: string }[]> {
  const svc = createServiceClient();

  const { data: candidates, error } = await svc
    .from('workers')
    .select('id, phone, schedule_updated_at')
    .eq('store_id', input.requestingStoreId)
    .eq('is_active', true)
    .contains('roles', [input.role])
    .not('schedule_updated_at', 'is', null);

  if (error || !candidates || candidates.length === 0) {
    if (error) console.error('[eligibleSameStoreWorkers] worker lookup', error);
    return [];
  }

  const ids = candidates.map((w) => w.id);
  const { data: schedules } = await svc
    .from('worker_schedules')
    .select('worker_id, weekday, start_time, end_time')
    .in('worker_id', ids);

  const byWorker = new Map<string, ScheduleEntry[]>();
  for (const s of schedules ?? []) {
    const list = byWorker.get(s.worker_id) ?? [];
    list.push(s);
    byWorker.set(s.worker_id, list);
  }

  const weekday = weekdayOf(input.shiftDate);
  const pickupHours = shiftHours(input.startTime, input.endTime);
  const claimed = await claimedHoursForWeek(svc, ids, input.shiftDate, input.shiftId);

  return candidates.filter((w) => {
    const entries = byWorker.get(w.id) ?? [];
    if (entries.some((e) => e.weekday === weekday)) return false;
    const total =
      weeklyScheduleHours(entries) + (claimed.get(w.id) ?? 0) + pickupHours;
    return total <= WEEKLY_CAP_HOURS;
  });
}
