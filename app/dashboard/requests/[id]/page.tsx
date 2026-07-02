import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireManager } from '@/lib/auth';
import { fetchClaimDetails } from '@/lib/claims';
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

export default async function RequestDetail({
  params,
}: {
  params: { id: string };
}) {
  await requireManager();
  const supabase = createClient();

  // RLS scopes this lookup to the manager's own store — it doubles as the
  // authorization check for the service-role claim fetch below.
  const { data: shift } = await supabase
    .from('shift_requests')
    .select(
      'id, role, shift_date, start_time, end_time, headcount_needed, headcount_confirmed, status',
    )
    .eq('id', params.id)
    .maybeSingle<Shift>();

  if (!shift) notFound();

  const initialClaims = await fetchClaimDetails(shift.id);

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
