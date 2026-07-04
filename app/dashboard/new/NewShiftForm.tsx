'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/roles';
import TimeRangeEditor, { isValidEnd } from '@/app/components/TimeRangeEditor';

const DATE_WINDOW_DAYS = 14;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDateOptions(): { iso: string; label: string; sub: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return Array.from({ length: DATE_WINDOW_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dow[d.getDay()];
    const sub = `${months[d.getMonth()]} ${d.getDate()}`;
    return { iso: isoDate(d), label, sub };
  });
}

export default function NewShiftForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateOptions = useMemo(buildDateOptions, []);
  const [shiftDate, setShiftDate] = useState<string>(dateOptions[0].iso);
  const [role, setRole] = useState<Role | ''>('');
  const [headcount, setHeadcount] = useState(1);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!role) return setError('Pick a role.');
    if (!startTime || !endTime) return setError('Pick a start and end time.');
    if (!isValidEnd(startTime, endTime)) {
      return setError('End time must be after start time.');
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role,
          shift_date:       shiftDate,
          start_time:       startTime,
          end_time:         endTime,
          headcount_needed: headcount,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? 'Failed to create shift request.');
        return;
      }

      router.push(`/dashboard/requests/${body.id}`);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-lg border border-gray-200 bg-white p-5"
    >
      <Field label="Role">
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => {
            const selected = role === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-md border px-3 py-2.5 text-sm font-medium transition ${
                  selected
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 bg-white text-gray-900 hover:border-gray-500'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Date" hint="Next two weeks">
        <div
          className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
          role="radiogroup"
          aria-label="Shift date"
        >
          {dateOptions.map((opt) => {
            const selected = opt.iso === shiftDate;
            return (
              <button
                key={opt.iso}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setShiftDate(opt.iso)}
                className={`flex min-w-[68px] shrink-0 snap-start flex-col items-center rounded-md border px-2 py-2 text-center transition ${
                  selected
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 bg-white text-gray-900 hover:border-gray-500'
                }`}
              >
                <span
                  className={`text-[11px] font-medium uppercase tracking-wide ${
                    selected ? 'text-white/80' : 'text-gray-500'
                  }`}
                >
                  {opt.label}
                </span>
                <span className="text-sm font-semibold">{opt.sub}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Hours" hint="Tap a preset or set your own">
        <TimeRangeEditor
          start={startTime}
          end={endTime}
          onChange={(s, e) => {
            setStartTime(s);
            setEndTime(e);
          }}
        />
      </Field>

      <Field label="Workers needed">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHeadcount((n) => Math.max(1, n - 1))}
            aria-label="Decrease workers needed"
            className="h-10 w-10 rounded-md border border-gray-300 bg-white text-lg font-medium text-gray-900 hover:border-gray-500 disabled:opacity-40"
            disabled={headcount <= 1}
          >
            −
          </button>
          <div className="flex h-10 min-w-[3.5rem] flex-1 items-center justify-center rounded-md border border-gray-300 bg-white text-base font-semibold">
            {headcount}
          </div>
          <button
            type="button"
            onClick={() => setHeadcount((n) => Math.min(50, n + 1))}
            aria-label="Increase workers needed"
            className="h-10 w-10 rounded-md border border-gray-300 bg-white text-lg font-medium text-gray-900 hover:border-gray-500 disabled:opacity-40"
            disabled={headcount >= 50}
          >
            +
          </button>
        </div>
      </Field>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || !isValidEnd(startTime, endTime)}
        className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Send to neighbouring stores'}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
