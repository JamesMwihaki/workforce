import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  // RLS scopes both queries to the manager's own store.
  const { data: shift, error: shiftErr } = await supabase
    .from('shift_requests')
    .select(
      'id, role, shift_date, start_time, end_time, headcount_needed, headcount_confirmed, status, created_at',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 });
  if (!shift)   return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const { data: claims, error: claimsErr } = await supabase
    .from('shift_claims')
    .select('id, status, claimed_at, worker:workers(id, name, store:stores(name))')
    .eq('shift_request_id', params.id)
    .order('claimed_at');

  if (claimsErr) return NextResponse.json({ error: claimsErr.message }, { status: 500 });

  return NextResponse.json({ shift, claims: claims ?? [] });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  // Confirm the shift belongs to the caller's store before mutating.
  const { data: shift, error: lookupErr } = await supabase
    .from('shift_requests')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!shift)    return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.action !== 'cancel') {
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  }

  if (shift.status === 'cancelled') {
    return NextResponse.json({ ok: true });
  }

  const svc = createServiceClient();
  const { error: updErr } = await svc
    .from('shift_requests')
    .update({ status: 'cancelled' })
    .eq('id', params.id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  // RLS-scoped lookup confirms the shift belongs to the caller's store.
  const { data: shift, error: lookupErr } = await supabase
    .from('shift_requests')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!shift)    return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Only cancelled shifts are hard-deletable. Completed/filled shifts stay
  // in history as a record. shift_claims has on-delete-cascade, so claims
  // tied to this shift go with it.
  if (shift.status !== 'cancelled') {
    return NextResponse.json(
      { error: 'Only cancelled shifts can be deleted. Cancel it first.' },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const { error: delErr } = await svc
    .from('shift_requests')
    .delete()
    .eq('id', params.id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
