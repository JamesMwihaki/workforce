'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/roles';

const DATE_WINDOW_DAYS = 14;

const SHIFT_PRESETS = [
  { id: 'open',  label: 'Open',  sub: '7a – 3p',  start: '07:00', end: '15:00' },
  { id: 'mid',   label: 'Mid',   sub: '10a – 5p', start: '10:00', end: '17:00' },
  { id: 'close', label: 'Close', sub: '4p – 12a', start: '16:00', end: '00:00' },
] as const;

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 15, 30, 45];

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

function parseTime(t: string): { h12: number; m: number; pm: boolean } | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, m, pm };
}

function buildTime(h12: number, m: number, pm: boolean): string {
  let h24 = h12 % 12;
  if (pm) h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime(t: string): string {
  const p = parseTime(t);
  if (!p) return 'Choose…';
  return `${p.h12}:${String(p.m).padStart(2, '0')} ${p.pm ? 'PM' : 'AM'}`;
}

function isValidEnd(start: string, end: string): boolean {
  if (!start || !end) return true; // not yet a conflict
  if (end === '00:00') return start !== '00:00'; // midnight close
  return start < end;
}

// Given a Start time and a partial End choice (any of h12/m/pm), is there
// at least one completion that yields a valid end time? Used to dim chips
// in the End picker that can't lead anywhere useful.
function endChoiceReachable(
  start: string,
  fix: Partial<{ h12: number; m: number; pm: boolean }>,
): boolean {
  if (!start) return true;
  const hours = fix.h12 != null ? [fix.h12] : HOURS_12;
  const mins  = fix.m   != null ? [fix.m]   : MINUTES;
  const pms   = fix.pm  != null ? [fix.pm]  : [false, true];
  for (const h of hours) {
    for (const m of mins) {
      for (const pm of pms) {
        if (isValidEnd(start, buildTime(h, m, pm))) return true;
      }
    }
  }
  return false;
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
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    function onClick(e: MouseEvent) {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setEditing(null);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [editing]);

  const editingValue = editing === 'start' ? startTime : editing === 'end' ? endTime : '';
  const editingParts = parseTime(editingValue) ?? { h12: 12, m: 0, pm: false };

  function patchEditing(patch: Partial<{ h12: number; m: number; pm: boolean }>) {
    const next = { ...editingParts, ...patch };
    const t = buildTime(next.h12, next.m, next.pm);
    if (editing === 'start') setStartTime(t);
    else if (editing === 'end') setEndTime(t);
  }

  function applyPreset(p: (typeof SHIFT_PRESETS)[number]) {
    setStartTime(p.start);
    setEndTime(p.end);
    setEditing(null);
  }

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
        <div className="space-y-3" ref={pickerRef}>
          <div className="grid grid-cols-3 gap-2">
            {SHIFT_PRESETS.map((p) => {
              const active = startTime === p.start && endTime === p.end;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`flex flex-col items-center rounded-md border px-2 py-2 transition ${
                    active
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 bg-white text-gray-900 hover:border-gray-500'
                  }`}
                >
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span
                    className={`text-[11px] ${active ? 'text-white/80' : 'text-gray-500'}`}
                  >
                    {p.sub}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TimeButton
              label="Start"
              value={startTime}
              active={editing === 'start'}
              onClick={() => setEditing(editing === 'start' ? null : 'start')}
            />
            <TimeButton
              label="End"
              value={endTime}
              active={editing === 'end'}
              onClick={() => setEditing(editing === 'end' ? null : 'end')}
            />
          </div>

          {editing && (
            <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="grid grid-cols-6 gap-1.5">
                {HOURS_12.map((h) => {
                  const selected = editingValue !== '' && editingParts.h12 === h;
                  const dim =
                    editing === 'end' && !endChoiceReachable(startTime, { h12: h });
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={dim}
                      onClick={() => patchEditing({ h12: h })}
                      className={`rounded-md border py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${
                        selected
                          ? 'border-black bg-black text-white'
                          : 'border-gray-300 bg-white text-gray-900 hover:border-gray-500'
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {MINUTES.map((m) => {
                  const selected = editingValue !== '' && editingParts.m === m;
                  const dim =
                    editing === 'end' && !endChoiceReachable(startTime, { m });
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={dim}
                      onClick={() => patchEditing({ m })}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${
                        selected
                          ? 'border-black bg-black text-white'
                          : 'border-gray-300 bg-white text-gray-900 hover:border-gray-500'
                      }`}
                    >
                      :{String(m).padStart(2, '0')}
                    </button>
                  );
                })}

                <div className="ml-auto inline-flex overflow-hidden rounded-md border border-gray-300">
                  {(['AM', 'PM'] as const).map((p) => {
                    const isPm = p === 'PM';
                    const selected = editingValue !== '' && editingParts.pm === isPm;
                    const dim =
                      editing === 'end' && !endChoiceReachable(startTime, { pm: isPm });
                    return (
                      <button
                        key={p}
                        type="button"
                        disabled={dim}
                        onClick={() => patchEditing({ pm: isPm })}
                        className={`px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${
                          selected
                            ? 'bg-black text-white'
                            : 'bg-white text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {startTime && endTime && !isValidEnd(startTime, endTime) && (
            <p className="text-xs font-medium text-red-700">
              End time must be after start time.
            </p>
          )}
        </div>
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

function TimeButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  const filled = value !== '';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`flex flex-col items-start rounded-md border px-3 py-2 text-left transition ${
        active
          ? 'border-black ring-2 ring-black/10'
          : 'border-gray-300 hover:border-gray-500'
      }`}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span
        className={`text-base font-semibold ${
          filled ? 'text-gray-900' : 'text-gray-400'
        }`}
      >
        {formatTime(value)}
      </span>
    </button>
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
