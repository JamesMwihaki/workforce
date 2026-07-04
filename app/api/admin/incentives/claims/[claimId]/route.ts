import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { one } from '@/lib/db';

const Params = z.object({ claimId: z.uuid() });
const Body = z.object({ paid: z.boolean() });

// PATCH /api/admin/incentives/claims/[claimId] — settle (or un-settle) the
// incentive owed for one worker's confirmed claim.
export async function PATCH(req: Request, { params }: { params: { claimId: string } }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  const parsedParams = Params.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid claim id.' }, { status: 400 });
  }
  const { claimId } = parsedParams.data;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid update.' }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: claim } = await svc
    .from('shift_claims')
    .select('id, status, shift:shift_requests!inner(incentive_status)')
    .eq('id', claimId)
    .maybeSingle();

  if (!claim) {
    return NextResponse.json({ error: 'Claim not found.' }, { status: 404 });
  }
  const shift = one(claim.shift);
  if (shift?.incentive_status !== 'approved') {
    return NextResponse.json(
      { error: 'This claim has no approved incentive to settle.' },
      { status: 409 },
    );
  }

  const { error } = await svc
    .from('shift_claims')
    .update({ incentive_paid_at: parsed.data.paid ? new Date().toISOString() : null })
    .eq('id', claimId);

  if (error) {
    return NextResponse.json(
      { error: `Couldn't update the payout: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
