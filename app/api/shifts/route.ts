import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ROLES } from '@/lib/roles';
import { broadcastShift } from '@/lib/broadcast';

const Body = z.object({
  role:             z.enum(ROLES),
  shift_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time:         z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  headcount_needed: z.number().int().min(1).max(50),
});

export async function POST(req: Request) {
  // 1. AuthN: must be a logged-in manager.
  const auth = createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  const { data: manager, error: mgrErr } = await auth
    .from('managers')
    .select('id, store_id, store:stores(name)')
    .eq('id', user.id)
    .maybeSingle();

  if (mgrErr || !manager) {
    return NextResponse.json({ error: 'Manager profile missing.' }, { status: 403 });
  }

  // 2. Parse + validate.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please fill out every field correctly.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.start_time >= parsed.data.end_time) {
    return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 });
  }

  // 3. Insert via service role so we keep the workers/shift_claims write surface
  //    behind a single trusted entry point.
  const svc = createServiceClient();
  const { data: shift, error: insErr } = await svc
    .from('shift_requests')
    .insert({
      requesting_store_id: manager.store_id,
      created_by:          manager.id,
      role:                parsed.data.role,
      shift_date:          parsed.data.shift_date,
      start_time:          parsed.data.start_time,
      end_time:            parsed.data.end_time,
      headcount_needed:    parsed.data.headcount_needed,
    })
    .select('id, role, shift_date, start_time, end_time, headcount_needed, requesting_store_id')
    .single();

  if (insErr || !shift) {
    return NextResponse.json({ error: 'Could not create the request.' }, { status: 500 });
  }

  // 4. Fire-and-forget broadcast. Errors are logged but don't fail the request —
  //    the shift exists; the manager can resend if needed.
  const storeName = Array.isArray(manager.store)
    ? manager.store[0]?.name
    : (manager.store as { name?: string } | null)?.name;

  broadcastShift({
    shiftId:          shift.id,
    storeName:        storeName ?? 'a neighbouring store',
    role:             shift.role,
    shiftDate:        shift.shift_date,
    startTime:        shift.start_time,
    endTime:          shift.end_time,
    requestingStoreId: shift.requesting_store_id,
  }).catch((e) => console.error('[broadcastShift]', e));

  return NextResponse.json({ id: shift.id });
}

export async function GET() {
  // List shifts for the current manager's store. RLS handles the filtering.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  const { data, error } = await supabase
    .from('shift_requests')
    .select(
      'id, role, shift_date, start_time, end_time, headcount_needed, headcount_confirmed, status, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shifts: data ?? [] });
}
