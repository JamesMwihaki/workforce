import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireManager } from '@/lib/auth';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';
import RequestLive from './RequestLive';

export const dynamic = 'force-dynamic';

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

export default async function RequestDetail({
  params,
}: {
  params: { id: string };
}) {
  await requireManager();
  const supabase = createClient();

  const { data: shift } = await supabase
    .from('shift_requests')
    .select(
      'id, role, shift_date, start_time, end_time, headcount_needed, headcount_confirmed, status',
    )
    .eq('id', params.id)
    .maybeSingle<Shift>();

  if (!shift) notFound();

  const { data: claims } = await supabase
    .from('shift_claims')
    .select('id, status, claimed_at, worker:workers(id, name, store:stores(name))')
    .eq('shift_request_id', params.id)
    .order('claimed_at');

  const initialClaims = normalizeClaims((claims ?? []) as unknown as Claim[]);

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
        ← All requests
      </Link>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {ROLE_LABELS[shift.role]}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {formatDate(shift.shift_date)} ·{' '}
              {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
            </p>
          </div>
          <RequestLive
            shiftId={shift.id}
            initialShift={shift}
            initialClaims={initialClaims}
          />
        </div>
      </div>
    </div>
  );
}

function normalizeClaims(rows: Claim[]): Claim[] {
  // Supabase nested selects sometimes hand back arrays for to-one joins;
  // collapse them so the client component sees a stable shape.
  return rows.map((r) => {
    const worker = Array.isArray(r.worker) ? r.worker[0] : r.worker;
    if (!worker) return { ...r, worker: null };
    const store = Array.isArray(worker.store) ? worker.store[0] : worker.store;
    return { ...r, worker: { ...worker, store: store ?? null } };
  });
}
