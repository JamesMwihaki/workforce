'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Role } from '@/lib/roles';

type Shift = {
  id:                  string;
  role:                Role;
  shift_date:          string;
  start_time:          string;
  end_time:            string;
  headcount_needed:    number;
  headcount_confirmed: number;
  status:              'open' | 'filled' | 'cancelled';
};

type Claim = {
  id:         string;
  status:     'confirmed' | 'waitlisted';
  claimed_at: string;
  worker: {
    id:    string;
    name:  string;
    store: { name: string } | null;
  } | null;
};

export default function RequestLive({
  shiftId,
  initialShift,
  initialClaims,
}: {
  shiftId:        string;
  initialShift:   Shift;
  initialClaims:  Claim[];
}) {
  const [shift, setShift] = useState<Shift>(initialShift);
  const [claims, setClaims] = useState<Claim[]>(initialClaims);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to Realtime updates on this shift and any new claims for it.
  // Whenever something fires, we re-fetch the canonical view from /api/shifts/[id]
  // — simpler than reconciling individual events and only one round-trip.
  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      try {
        const res = await fetch(`/api/shifts/${shiftId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json();
        if (body.shift) setShift(body.shift);
        if (Array.isArray(body.claims)) setClaims(body.claims);
      } catch {
        // network blip — next event will retry
      }
    }

    const channel = supabase
      .channel(`shift:${shiftId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_requests', filter: `id=eq.${shiftId}` },
        () => void refetch(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shift_claims',
          filter: `shift_request_id=eq.${shiftId}`,
        },
        () => void refetch(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shiftId]);

  async function onCancel() {
    if (!confirm('Cancel this shift request?')) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not cancel.');
        return;
      }
      setShift((s) => ({ ...s, status: 'cancelled' }));
    } catch {
      setError('Network error.');
    } finally {
      setCancelling(false);
    }
  }

  const confirmed = claims.filter((c) => c.status === 'confirmed');
  const waitlist  = claims.filter((c) => c.status === 'waitlisted');

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex items-center gap-2">
        <StatusBadge status={shift.status} />
        <span className="text-sm text-gray-600">
          {shift.headcount_confirmed} / {shift.headcount_needed}
        </span>
      </div>

      {shift.status === 'open' && (
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel request'}
        </button>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
      )}

      <div className="mt-4 w-full">
        <ClaimsList title="Confirmed" rows={confirmed} emptyHint="No confirmations yet." />
        {waitlist.length > 0 && (
          <ClaimsList title="Waitlisted" rows={waitlist} emptyHint="" />
        )}
      </div>
    </div>
  );
}

function ClaimsList({
  title,
  rows,
  emptyHint,
}: {
  title:     string;
  rows:      Claim[];
  emptyHint: string;
}) {
  return (
    <div className="mt-3 w-full text-left">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        emptyHint && <p className="mt-1 text-xs text-gray-500">{emptyHint}</p>
      ) : (
        <ul className="mt-1 divide-y divide-gray-100 rounded-md border border-gray-100">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{c.worker?.name ?? 'Unknown worker'}</span>
              <span className="text-xs text-gray-500">
                {c.worker?.store?.name ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Shift['status'] }) {
  const styles: Record<Shift['status'], string> = {
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
