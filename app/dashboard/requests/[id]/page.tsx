import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireManager } from '@/lib/auth';
import { fetchClaimDetails } from '@/lib/claims';
import { countAlerted } from '@/lib/sms';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { formatDate, formatTime } from '@/lib/format';
import RequestLive from './RequestLive';

export const dynamic = 'force-dynamic';

type Shift = {
  id:                  string;
  code:                number;
  role:                Role;
  shift_date:          string;
  start_time:          string;
  end_time:            string;
  headcount_needed:    number;
  headcount_confirmed: number;
  status:              'open' | 'filled' | 'cancelled';
  incentive_amount:    number;
  incentive_status:    'none' | 'pending' | 'approved' | 'declined';
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
      'id, code, role, shift_date, start_time, end_time, headcount_needed, headcount_confirmed, status, incentive_amount, incentive_status',
    )
    .eq('id', params.id)
    .maybeSingle<Shift>();

  if (!shift) notFound();

  const [initialClaims, initialNotified] = await Promise.all([
    fetchClaimDetails(shift.id),
    countAlerted(shift.id),
  ]);

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
        ← All requests
      </Link>

      {shift.incentive_status === 'pending' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Waiting for the owner to approve the +${shift.incentive_amount}/hr extra
          pay — workers haven&apos;t been texted yet.
        </p>
      )}
      {shift.incentive_status === 'declined' && (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
          The +${shift.incentive_amount}/hr extra pay wasn&apos;t approved, so this
          shift was sent at regular pay.
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {ROLE_LABELS[shift.role]}{' '}
              <span className="text-sm font-normal text-gray-500">
                · workers reply YES {shift.code}
              </span>
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {formatDate(shift.shift_date)} ·{' '}
              {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
              {shift.incentive_amount > 0 && shift.incentive_status === 'approved' && (
                <span className="ml-1.5 font-medium text-amber-700">
                  +${shift.incentive_amount}/hr
                </span>
              )}
            </p>
          </div>
          <RequestLive
            shiftId={shift.id}
            initialShift={shift}
            initialClaims={initialClaims}
            initialNotified={initialNotified}
          />
        </div>
      </div>
    </div>
  );
}
