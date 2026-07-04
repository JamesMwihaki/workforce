'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';
import type { IncentiveStatus } from '@/lib/incentives';

type ShiftRow = {
  id:                  string;
  role:                Role;
  shift_date:          string;
  start_time:          string;
  end_time:            string;
  headcount_needed:    number;
  headcount_confirmed: number;
  status:              'open' | 'filled' | 'cancelled';
  created_at:          string;
  incentive_amount:    number;
  incentive_status:    IncentiveStatus;
};

type Filter = 'all' | 'waiting' | 'filled' | 'today';

const EMPTY_COPY: Record<Filter, { title: string; hint?: string }> = {
  all:     { title: 'No active requests.', hint: 'Tap New request to send a shift to neighbouring stores.' },
  waiting: { title: 'Nothing waiting on a worker.' },
  filled:  { title: 'No filled shifts yet.' },
  today:   { title: 'Nothing on the schedule for today.' },
};

export default function ShiftList({
  shifts,
  todayIso,
}: {
  shifts: ShiftRow[];
  todayIso: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const counts: Record<Filter, number> = {
    all:     shifts.length,
    waiting: shifts.filter((s) => s.status === 'open').length,
    filled:  shifts.filter((s) => s.status === 'filled').length,
    today:   shifts.filter((s) => s.shift_date === todayIso).length,
  };

  const visible = shifts.filter((s) => {
    if (filter === 'all')     return true;
    if (filter === 'waiting') return s.status === 'open';
    if (filter === 'filled')  return s.status === 'filled';
    if (filter === 'today')   return s.shift_date === todayIso;
    return true;
  });

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Pill label="All"     count={counts.all}     active={filter === 'all'}     onClick={() => setFilter('all')} />
        <Pill label="Waiting" count={counts.waiting} active={filter === 'waiting'} onClick={() => setFilter('waiting')} />
        <Pill label="Filled"  count={counts.filled}  active={filter === 'filled'}  onClick={() => setFilter('filled')} />
        <Pill label="Today"   count={counts.today}   active={filter === 'today'}   onClick={() => setFilter('today')} />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          <p>{EMPTY_COPY[filter].title}</p>
          {EMPTY_COPY[filter].hint && (
            <p className="mt-1 text-xs text-gray-500">{EMPTY_COPY[filter].hint}</p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => (
            <li key={s.id}>
              <Link
                href={`/dashboard/requests/${s.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {ROLE_LABELS[s.role]} · {formatDate(s.shift_date)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatTime(s.start_time)} – {formatTime(s.end_time)}
                      {s.incentive_amount > 0 && s.incentive_status !== 'declined' && (
                        <span className="ml-1.5 font-medium text-amber-700">
                          +${s.incentive_amount}/hr
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {s.incentive_status === 'pending' ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                        needs approval
                      </span>
                    ) : (
                      <StatusBadge status={s.status} />
                    )}
                    <span className="text-xs text-gray-600">
                      {s.headcount_confirmed} / {s.headcount_needed} confirmed
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Pill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-black bg-black text-white'
          : 'border-gray-300 bg-white text-gray-900 hover:border-gray-500'
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 text-xs ${
          active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: ShiftRow['status'] }) {
  const styles: Record<ShiftRow['status'], string> = {
    open:      'bg-blue-50 text-blue-700 ring-blue-200',
    filled:    'bg-green-50 text-green-700 ring-green-200',
    cancelled: 'bg-gray-100 text-gray-600 ring-gray-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {status}
    </span>
  );
}
