import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { ROLES } from '@/lib/roles';

const Params = z.object({ id: z.uuid() });

const Body = z.object({
  email:    z.email(),
  password: z.string().min(8).max(72),
});

// POST /api/admin/workers/[id]/promote — make an existing worker a manager.
// Creates an auth user + manager row at the worker's home store, linked back
// via managers.worker_id. Managers can fill any role, so the worker record is
// upgraded to every role too.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  const parsedParams = Params.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid worker id.' }, { status: 400 });
  }
  const { id } = parsedParams.data;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please provide a valid email and a password of at least 8 characters.' },
      { status: 400 },
    );
  }
  const { email, password } = parsed.data;

  const svc = createServiceClient();

  const { data: worker } = await svc
    .from('workers')
    .select('id, name, store_id')
    .eq('id', id)
    .maybeSingle();
  if (!worker) {
    return NextResponse.json({ error: 'Worker not found.' }, { status: 404 });
  }

  const { data: alreadyManager } = await svc
    .from('managers')
    .select('id')
    .eq('worker_id', id)
    .maybeSingle();
  if (alreadyManager) {
    return NextResponse.json(
      { error: 'This worker is already a manager.' },
      { status: 409 },
    );
  }

  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr || !created?.user) {
    const msg = authErr?.message ?? '';
    const duplicate = /already|registered|exists/i.test(msg);
    return NextResponse.json(
      {
        error: duplicate
          ? 'An account with that email already exists.'
          : `Couldn't create the account: ${msg || 'unknown error.'}`,
      },
      { status: duplicate ? 409 : 500 },
    );
  }

  const { error: insertErr } = await svc.from('managers').insert({
    id:        created.user.id,
    name:      worker.name,
    email,
    store_id:  worker.store_id,
    worker_id: worker.id,
  });

  if (insertErr) {
    // Roll back the auth user so the email isn't stuck half-created.
    await svc.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: `Couldn't save the manager: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // Managers can fill any and all positions.
  await svc.from('workers').update({ roles: [...ROLES] }).eq('id', worker.id);

  return NextResponse.json({ id: created.user.id }, { status: 201 });
}
