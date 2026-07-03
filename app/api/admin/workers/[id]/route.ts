import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const Params = z.object({ id: z.uuid() });
const Body = z.object({ is_active: z.boolean() });

// PATCH /api/admin/workers/[id] — activate/deactivate a worker.
// Inactive workers are skipped by shift broadcasts.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  const parsedParams = Params.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid worker id.' }, { status: 400 });
  }

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
  const { data, error } = await svc
    .from('workers')
    .update({ is_active: parsed.data.is_active })
    .eq('id', parsedParams.data.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Couldn't update the worker: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Worker not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
