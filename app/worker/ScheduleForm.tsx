'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ScheduleEntry } from '@/lib/schedule';
import TimeRangeEditor, { formatTime, isValidEnd } from '@/app/components/TimeRangeEditor';

// Monday-first display to match the Mon–Sun work week; weekday numbers stay
// in JS getDay() convention (0 = Sunday).
const DAYS: { weekday: number; label: string; short: string }[] = [
  { weekday: 1, label: 'Monday',    short: 'Mon' },
  { weekday: 2, label: 'Tuesday',   short: 'Tue' },
  { weekday: 3, label: 'Wednesday', short: 'Wed' },
  { weekday: 4, label: 'Thursday',  short: 'Thu' },
  { weekday: 5, label: 'Friday',    short: 'Fri' },
  { weekday: 6, label: 'Saturday',  short: 'Sat' },
  { weekday: 0, label: 'Sunday',    short: 'Sun' },
];

type DayState = { working: boolean; start: string; end: string };

function hoursOf(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const endMin = eh === 0 && em === 0 ? 24 * 60 : eh * 60 + em;
  return Math.max(0, (endMin - (sh * 60 + sm)) / 60);
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
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
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const totalHours = DAYS.reduce(
    (sum, { weekday }) =>
      days[weekday].working ? sum + hoursOf(days[weekday].start, days[weekday].end) : sum,
    0,
  );
  const hasInvalid = DAYS.some(
    ({ weekday }) =>
      days[weekday].working && !isValidEnd(days[weekday].start, days[weekday].end),
  );

  function toggleDay(weekday: number) {
    setSaved(false);
    const turningOn = !days[weekday].working;
    setDays((d) => ({ ...d, [weekday]: { ...d[weekday], working: turningOn } }));
    setExpanded(turningOn ? weekday : expanded === weekday ? null : expanded);
  }

  function setTimes(weekday: number, start: string, end: string) {
    setSaved(false);
    setDays((d) => ({ ...d, [weekday]: { ...d[weekday], start, end } }));
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
      setExpanded(null);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-900">My regular schedule</h2>
        <span className="text-xs text-gray-500">
          {formatHours(totalHours)} hrs/week
        </span>
      </div>
      <p className="text-xs text-gray-500">
        Tap the days you normally work and set your hours. On your days off we
        can text you when your own store needs help — as long as picking it up
        keeps you at or under 40 hours for the week (Mon–Sun).
      </p>
      {!hasSubmitted && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You haven&apos;t saved a schedule yet — save one (even all days off) to
          start getting own-store alerts.
        </p>
      )}

      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
        <div
          className="grid grid-cols-7 gap-1.5"
          role="group"
          aria-label="Days you regularly work"
        >
          {DAYS.map(({ weekday, short }) => {
            const day = days[weekday];
            return (
              <button
                key={weekday}
                type="button"
                aria-pressed={day.working}
                onClick={() => toggleDay(weekday)}
                className={`flex flex-col items-center rounded-md border px-1 py-2 transition ${
                  day.working
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 bg-white text-gray-900 hover:border-gray-500'
                }`}
              >
                <span className="text-xs font-semibold">{short}</span>
                <span
                  className={`mt-0.5 text-[10px] ${
                    day.working ? 'text-white/80' : 'text-gray-400'
                  }`}
                >
                  {day.working ? formatHours(hoursOf(day.start, day.end)) + 'h' : 'Off'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="divide-y divide-gray-100">
          {DAYS.filter(({ weekday }) => days[weekday].working).map(
            ({ weekday, label }) => {
              const day = days[weekday];
              const open = expanded === weekday;
              return (
                <div key={weekday} className="py-2">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : weekday)}
                    className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span className="text-sm font-medium text-gray-900">{label}</span>
                    <span className="flex items-center gap-2 text-sm text-gray-600">
                      {formatTime(day.start)} – {formatTime(day.end)}
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden
                        className={`h-4 w-4 text-gray-400 transition-transform ${
                          open ? 'rotate-180' : ''
                        }`}
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </button>
                  {open && (
                    <div className="mt-2">
                      <TimeRangeEditor
                        start={day.start}
                        end={day.end}
                        onChange={(s, e) => setTimes(weekday, s, e)}
                      />
                    </div>
                  )}
                </div>
              );
            },
          )}
          {DAYS.every(({ weekday }) => !days[weekday].working) && (
            <p className="py-3 text-center text-sm text-gray-500">
              All days off — tap a day above to add your regular hours.
            </p>
          )}
        </div>
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
        disabled={saving || hasInvalid}
        className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save schedule'}
      </button>
    </section>
  );
}
