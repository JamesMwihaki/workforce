'use client';

import { useEffect, useRef, useState } from 'react';

// Shared tap-first time-range picker: preset chips (Open/Mid/Close) plus a
// Start/End editor with hour, minute and AM/PM chips. Used by the manager's
// new-shift form and the worker's schedule editor.

export const SHIFT_PRESETS = [
  { id: 'open',  label: 'Open',  sub: '7a – 3p',  start: '07:00', end: '15:00' },
  { id: 'mid',   label: 'Mid',   sub: '10a – 5p', start: '10:00', end: '17:00' },
  { id: 'close', label: 'Close', sub: '4p – 12a', start: '16:00', end: '00:00' },
] as const;

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 15, 30, 45];

export function parseTime(t: string): { h12: number; m: number; pm: boolean } | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, m, pm };
}

export function buildTime(h12: number, m: number, pm: boolean): string {
  let h24 = h12 % 12;
  if (pm) h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime(t: string): string {
  const p = parseTime(t);
  if (!p) return 'Choose…';
  return `${p.h12}:${String(p.m).padStart(2, '0')} ${p.pm ? 'PM' : 'AM'}`;
}

export function isValidEnd(start: string, end: string): boolean {
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

export default function TimeRangeEditor({
  start,
  end,
  onChange,
}: {
  start: string;
  end:   string;
  onChange: (start: string, end: string) => void;
}) {
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

  const editingValue = editing === 'start' ? start : editing === 'end' ? end : '';
  const editingParts = parseTime(editingValue) ?? { h12: 12, m: 0, pm: false };

  function patchEditing(patch: Partial<{ h12: number; m: number; pm: boolean }>) {
    const next = { ...editingParts, ...patch };
    const t = buildTime(next.h12, next.m, next.pm);
    if (editing === 'start') onChange(t, end);
    else if (editing === 'end') onChange(start, t);
  }

  function applyPreset(p: (typeof SHIFT_PRESETS)[number]) {
    onChange(p.start, p.end);
    setEditing(null);
  }

  return (
    <div className="space-y-3" ref={pickerRef}>
      <div className="grid grid-cols-3 gap-2">
        {SHIFT_PRESETS.map((p) => {
          const active = start === p.start && end === p.end;
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
          value={start}
          active={editing === 'start'}
          onClick={() => setEditing(editing === 'start' ? null : 'start')}
        />
        <TimeButton
          label="End"
          value={end}
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
                editing === 'end' && !endChoiceReachable(start, { h12: h });
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
                editing === 'end' && !endChoiceReachable(start, { m });
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
                  editing === 'end' && !endChoiceReachable(start, { pm: isPm });
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

      {start && end && !isValidEnd(start, end) && (
        <p className="text-xs font-medium text-red-700">
          End time must be after start time.
        </p>
      )}
    </div>
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
