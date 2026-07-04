'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ScheduleEntry } from '@/lib/schedule';

// Monday-first display to match the Mon–Sun work week; weekday numbers stay
// in JS getDay() convention (0 = Sunday).
const DAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: 'Monday' },
  { weekday: 2, label: 'Tuesday' },
  { weekday: 3, label: 'Wednesday' },
  { weekday: 4, label: 'Thursday' },
  { weekday: 5, label: 'Friday' },
  { weekday: 6, label: 'Saturday' },
  { weekday: 0, label: 'Sunday' },
];

type DayState = { working: boolean; start: string; end: string };

function hoursOf(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const endMin = eh === 0 && em === 0 ? 24 * 60 : eh * 60 + em;
  return Math.max(0, (endMin - (sh * 60 + sm)) / 60);
}

export default function ScheduleForm({
  initialEntries,
  hasSubmitted,
}: {
  initialEntries: ScheduleEntry[];
  hasSubmitted:   boolean;
}) {
  const router = useRouter();
  const [days, setDays] = useState<Record<number, DayState>>(() => {
    const state: Record<number, DayState> = {};
    for (const { weekday } of DAYS) {
      const entry = initialEntries.find((e) => e.weekday === weekday);
      state[weekday] = entry
        ? {
            working: true,
            start: entry.start_time.slice(0, 5),
            end:   entry.end_time.slice(0, 5),
          }
        : { working: false, start: '09:00', end: '17:00' };
    }
    return state;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const totalHours = DAYS.reduce(
    (sum, { weekday }) =>
      days[weekday].working ? sum + hoursOf(days[weekday].start, days[weekday].end) : sum,
    0,
  );

  function patch(weekday: number, p: Partial<DayState>) {
    setSaved(false);
    setDays((d) => ({ ...d, [weekday]: { ...d[weekday], ...p } }));
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      const entries = DAYS.filter(({ weekday }) => days[weekday].working).map(
        ({ weekday }) => ({
          weekday,
          start_time: days[weekday].start,
          end_time:   days[weekday].end,
        }),
      );
      const res = await fetch('/api/worker/schedule', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not save your schedule.');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-900">My regular schedule</h2>
        <span className="text-xs text-gray-500">{totalHours} hrs/week</span>
      </div>
      <p className="text-xs text-gray-500">
        Your regular hours at your home store. On your days off we can text
        you when your own store needs help — as long as picking it up keeps you
        at or under 40 hours for the week (Mon–Sun).
      </p>
      {!hasSubmitted && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You haven&apos;t saved a schedule yet — save one (even all days off) to
          start getting own-store alerts.
        </p>
      )}

      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {DAYS.map(({ weekday, label }) => {
          const day = days[weekday];
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <label className="flex w-28 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={day.working}
                  onChange={(e) => patch(weekday, { working: e.target.checked })}
                  className="h-4 w-4 accent-black"
                />
                <span className={day.working ? 'font-medium text-gray-900' : 'text-gray-500'}>
                  {label}
                </span>
              </label>
              {day.working ? (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    value={day.start}
                    onChange={(e) => patch(weekday, { start: e.target.value })}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="time"
                    value={day.end}
                    onChange={(e) => patch(weekday, { end: e.target.value })}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Off</span>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Schedule saved.
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save schedule'}
      </button>
    </section>
  );
}
