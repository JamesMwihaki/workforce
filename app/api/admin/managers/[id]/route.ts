import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const Params = z.object({ id: z.uuid() });

const PatchBody = z
  .object({
    name:     z.string().trim().min(1).max(100).optional(),
    store_id: z.uuid().optional(),
    is_admin: z.boolean().optional(),
    password: z.string().min(8).max(72).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update.' });

// PATCH /api/admin/managers/[id] — update store/admin flag/name, or set a new password.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  const parsedParams = Params.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid manager id.' }, { status: 400 });
  }
  const { id } = parsedParams.data;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid update (password min 8 characters).' },
      { status: 400 },
    );
  }
  const { name, store_id, is_admin, password } = parsed.data;

  // Don't let an admin revoke their own access — avoids locking everyone out.
  if (id === admin.id && is_admin === false) {
    return NextResponse.json(
      { error: "You can't remove your own admin access." },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  const { data: target } = await svc
    .from('managers')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: 'Manager not found.' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (store_id !== undefined) updates.store_id = store_id;
  if (is_admin !== undefined) updates.is_admin = is_admin;

  if (Object.keys(updates).length > 0) {
    const { error } = await svc.from('managers').update(updates).eq('id', id);
    if (error) {
      return NextResponse.json(
        { error: `Couldn't update the manager: ${error.message}` },
        { status: 500 },
      );
    }
  }

  if (password !== undefined) {
    const { error } = await svc.auth.admin.updateUserById(id, { password });
    if (error) {
      return NextResponse.json(
        { error: `Couldn't update the password: ${error.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/managers/[id] — remove the manager and their auth user.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  const parsedParams = Params.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid manager id.' }, { status: 400 });
  }
  const { id } = parsedParams.data;

  if (id === admin.id) {
    return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  }

  const svc = createServiceClient();

  // shift_requests.created_by restricts deletes; check up front so we can
  // return a friendly message instead of an FK violation.
  const { count } = await svc
    .from('shift_requests')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          'This manager has created shift requests, so their account can\'t be deleted (history must be kept). You can reset their password to lock them out, or reassign their store.',
      },
      { status: 409 },
    );
  }

  // Deleting the auth user cascades to the managers row.
  const { error } = await svc.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json(
      { error: `Couldn't remove the manager: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
