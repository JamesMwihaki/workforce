import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const Body = z.object({
  name:     z.string().trim().min(1).max(100),
  email:    z.email(),
  password: z.string().min(8).max(72),
  store_id: z.uuid(),
  is_admin: z.boolean().optional().default(false),
});

// POST /api/admin/managers — create an auth user + manager row.
export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please fill out every field correctly (password min 8 characters).' },
      { status: 400 },
    );
  }
  const { name, email, password, store_id, is_admin } = parsed.data;

  const svc = createServiceClient();

  // Make sure the store exists before creating an auth user we might orphan.
  const { data: store } = await svc
    .from('stores')
    .select('id')
    .eq('id', store_id)
    .maybeSingle();
  if (!store) {
    return NextResponse.json({ error: 'That store no longer exists.' }, { status: 400 });
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
    id: created.user.id,
    name,
    email,
    store_id,
    is_admin,
  });

  if (insertErr) {
    // Roll back the auth user so the email isn't stuck half-created.
    await svc.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: `Couldn't save the manager: ${insertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: created.user.id }, { status: 201 });
}
