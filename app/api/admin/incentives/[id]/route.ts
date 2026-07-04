import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdmin } from '@/lib/auth';
import { decideIncentive } from '@/lib/incentive-decision';

const Params = z.object({ id: z.uuid() });
const Body = z.object({ action: z.enum(['approve', 'decline']) });

const REASON_MESSAGES: Record<string, { message: string; status: number }> = {
  not_found:       { message: 'Shift not found.', status: 404 },
  already_decided: { message: 'This request has already been decided.', status: 409 },
  not_open:        { message: 'This shift is no longer open.', status: 409 },
  date_passed:     { message: 'This shift date has already passed.', status: 409 },
  db_error:        { message: "Couldn't save the decision. Please try again.", status: 500 },
};

// POST /api/admin/incentives/[id] — decide a pending incentive request.
// approve: broadcast the shift with the bonus. decline: broadcast at regular
// pay (the shift itself is still wanted — only the extra money was declined).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  const parsedParams = Params.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid shift id.' }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const result = await decideIncentive({
    shiftId: parsedParams.data.id,
    action:  parsed.data.action,
    adminId: admin.id,
  });

  if (!result.ok) {
    const { message, status } = REASON_MESSAGES[result.reason];
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
