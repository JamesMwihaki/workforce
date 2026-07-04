'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';
import { formatMoney, shiftHours } from '@/lib/incentives';

export type PendingShift = {
  id:               string;
  role:             string;
  shift_date:       string;
  start_time:       string;
  end_time:         string;
  headcount_needed: number;
  incentive_amount: number;
  store_name:       string;
  creator_name:     string;
  expired:          boolean;
};

export type LedgerRow = {
  claim_id:    string;
  worker_name: string;
  employee_id: string;
  store_name:  string;
  role:        string;
  shift_date:  string;
  start_time:  string;
  end_time:    string;
  rate:        number;
  owed:        number;
  done:        boolean;
  paid_at:     string | null;
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

export default function IncentivesPanel({
  pending,
  ledger,
}: {
  pending: PendingShift[];
  ledger: LedgerRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const owedRows      = ledger.filter((r) => r.done && !r.paid_at);
  const upcomingRows  = ledger.filter((r) => !r.done);
  const paidRows      = ledger.filter((r) => r.done && r.paid_at);
  const owedTotal     = owedRows.reduce((sum, r) => sum + r.owed, 0);
  const upcomingTotal = upcomingRows.reduce((sum, r) => sum + r.owed, 0);
  const paidTotal     = paidRows.reduce((sum, r) => sum + r.owed, 0);

  async function callApi(path: string, init: RequestInit): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        headers: { 'content-type': 'application/json' },
        ...init,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Something went wrong.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Network error. Please try again.');
      return false;
    }
  }

  async function onDecide(s: PendingShift, action: 'approve' | 'decline') {
    setBusyId(s.id);
    const ok = await callApi(`/api/admin/incentives/${s.id}`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (ok) {
      setNotice(
        action === 'approve'
          ? `Approved — workers are being texted with the +${formatMoney(s.incentive_amount)}/hr bonus.`
          : 'Declined — the shift was sent out at regular pay.',
      );
    }
  }

  async function onTogglePaid(r: LedgerRow) {
    setBusyId(r.claim_id);
    const ok = await callApi(`/api/admin/incentives/claims/${r.claim_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ paid: !r.paid_at }),
    });
    setBusyId(null);
    if (ok && !r.paid_at) {
      setNotice(`Marked ${formatMoney(r.owed)} to ${r.worker_name} as paid.`);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Incentives</h1>
        <div className="flex gap-4 text-sm">
          <Stat label="Owed" value={formatMoney(owedTotal)} highlight={owedTotal > 0} />
          <Stat label="Upcoming" value={formatMoney(upcomingTotal)} />
          <Stat label="Paid out" value={formatMoney(paidTotal)} />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      )}

      {/* ── Pending approvals ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Waiting for your approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            No incentive requests waiting.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {roleLabel(s.role)} · {formatDate(s.shift_date)} ·{' '}
                    {formatTime(s.start_time)} – {formatTime(s.end_time)}
                    <span className="ml-1.5 font-semibold text-amber-700">
                      +{formatMoney(s.incentive_amount)}/hr
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    {s.store_name} · requested by {s.creator_name} ·{' '}
                    {s.headcount_needed} worker{s.headcount_needed === 1 ? '' : 's'} · up to{' '}
                    <span className="font-medium">
                      {formatMoney(
                        Math.round(
                          s.incentive_amount *
                            shiftHours(s.start_time, s.end_time) *
                            s.headcount_needed * 100,
                        ) / 100,
                      )}
                    </span>{' '}
                    if fully claimed
                  </p>
                  {s.expired && (
                    <p className="text-sm font-medium text-red-700">
                      Shift date has passed — approving will fail; the manager should
                      cancel it.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === s.id || s.expired}
                    onClick={() => onDecide(s, 'approve')}
                    className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                  >
                    Approve &amp; send
                  </button>
                  <button
                    type="button"
                    disabled={busyId === s.id || s.expired}
                    onClick={() => onDecide(s, 'decline')}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Send without bonus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Owed (work done, unpaid) ──────────────────────────────────────── */}
      <LedgerSection
        title={`Owed — work done (${owedRows.length})`}
        empty="Nothing owed right now."
        rows={owedRows}
        busyId={busyId}
        onTogglePaid={onTogglePaid}
        action="Mark paid"
      />

      {/* ── Committed (upcoming approved shifts) ──────────────────────────── */}
      <LedgerSection
        title={`Committed — shift not worked yet (${upcomingRows.length})`}
        empty="No upcoming incentivised shifts with confirmed workers."
        rows={upcomingRows}
        busyId={busyId}
      />

      {/* ── Paid history ──────────────────────────────────────────────────── */}
      <LedgerSection
        title={`Paid (${paidRows.length})`}
        empty="No payouts yet."
        rows={paidRows}
        busyId={busyId}
        onTogglePaid={onTogglePaid}
        action="Undo"
      />
    </div>
  );
}

function LedgerSection({
  title,
  empty,
  rows,
  busyId,
  onTogglePaid,
  action,
}: {
  title: string;
  empty: string;
  rows: LedgerRow[];
  busyId: string | null;
  onTogglePaid?: (r: LedgerRow) => void;
  action?: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Worker</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Bonus</th>
                <th className="px-4 py-3 text-right">Amount</th>
                {onTogglePaid && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.claim_id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{r.worker_name}</div>
                    <div className="text-gray-500">#{r.employee_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900">
                      {roleLabel(r.role)} · {formatDate(r.shift_date)}
                    </div>
                    <div className="text-gray-500">
                      {r.store_name} · {formatTime(r.start_time)} – {formatTime(r.end_time)}{' '}
                      ({shiftHours(r.start_time, r.end_time)}h)
                    </div>
                  </td>
                  <td className="px-4 py-3">+{formatMoney(r.rate)}/hr</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(r.owed)}
                  </td>
                  {onTogglePaid && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === r.claim_id}
                        onClick={() => onTogglePaid(r)}
                        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-900 transition hover:bg-gray-50 disabled:opacity-40"
                      >
                        {action}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="text-right">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? 'text-amber-700' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}
