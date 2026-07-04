import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('profile'),
    name:   z.string().trim().min(1).max(100),
  }),
  z.object({
    action:           z.literal('email'),
    email:            z.email(),
    current_password: z.string().min(1),
  }),
  z.object({
    action:           z.literal('password'),
    new_password:     z.string().min(8).max(72),
    current_password: z.string().min(1),
  }),
]);

// Verify a manager's current password without disturbing their session by
// signing in on a throwaway, non-persistent anon client.
async function passwordOk(email: string, password: string): Promise<boolean> {
  const probe = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await probe.auth.signInWithPassword({ email, password });
  return !error;
}

// PATCH /api/manager/account — the signed-in manager updates their own name,
// email, or password. Email/password changes require the current password.
export async function PATCH(req: Request) {
  const auth = createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const { data: manager } = await auth
    .from('managers')
    .select('id, email')
    .eq('id', user.id)
    .maybeSingle();
  if (!manager) {
    return NextResponse.json({ error: 'Manager profile missing.' }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the form (passwords must be at least 8 characters).' },
      { status: 400 },
    );
  }
  const svc = createServiceClient();

  if (parsed.data.action === 'profile') {
    const { error } = await svc
      .from('managers')
      .update({ name: parsed.data.name })
      .eq('id', manager.id);
    if (error) {
      return NextResponse.json({ error: "Couldn't update your name." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Email and password changes both require the current password.
  if (!(await passwordOk(manager.email, parsed.data.current_password))) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 403 });
  }

  if (parsed.data.action === 'email') {
    const email = parsed.data.email.toLowerCase();
    if (email === manager.email.toLowerCase()) {
      return NextResponse.json({ error: "That's already your email." }, { status: 400 });
    }
    // Change the auth login immediately (email_confirm skips the confirmation
    // round-trip — same model the admin panel uses), then mirror to managers.
    const { error: authErr } = await svc.auth.admin.updateUserById(manager.id, {
      email,
      email_confirm: true,
    });
    if (authErr) {
      const dup = /already|registered|exists/i.test(authErr.message);
      return NextResponse.json(
        { error: dup ? 'That email is already in use.' : "Couldn't update your email." },
        { status: dup ? 409 : 500 },
      );
    }
    const { error: rowErr } = await svc
      .from('managers')
      .update({ email })
      .eq('id', manager.id);
    if (rowErr) {
      return NextResponse.json(
        { error: 'Email changed for login, but the profile record failed to update. Contact an admin.' },
        { status: 500 },
      );
    }
    // Changing the login identity ends the current session; the client sends
    // the manager back to sign in with the new email.
    return NextResponse.json({ ok: true, reauth: true });
  }

  // action === 'password'. Use the session-scoped client (not the admin API)
  // so the manager's own session is rotated rather than revoked — they stay
  // logged in after changing their password.
  const { error } = await auth.auth.updateUser({ password: parsed.data.new_password });
  if (error) {
    return NextResponse.json({ error: "Couldn't update your password." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
