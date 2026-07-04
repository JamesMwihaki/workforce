import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { one } from '@/lib/db';

export type Manager = {
  id:       string;
  name:     string;
  email:    string;
  store_id: string;
  is_admin: boolean;
  store: { id: string; name: string } | null;
};

// Resolve the current manager by joining auth.uid() against public.managers.
// Returns 'no_session' / 'no_manager' sentinels instead of redirecting so both
// pages and API routes can share it.
async function resolveManager(): Promise<Manager | 'no_session' | 'no_manager'> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return 'no_session';

  const { data, error } = await supabase
    .from('managers')
    .select('id, name, email, store_id, is_admin, store:stores(id, name)')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) return 'no_manager';

  const store = one(data.store);

  return {
    id:       data.id,
    name:     data.name,
    email:    data.email,
    store_id: data.store_id,
    is_admin: Boolean(data.is_admin),
    store,
  };
}

// Redirects to /manager-login if there's no session, and with an error if the
// session exists but no manager row is wired up.
export async function requireManager(): Promise<Manager> {
  const result = await resolveManager();
  if (result === 'no_session') redirect('/manager-login');
  if (result === 'no_manager') redirect('/manager-login?error=no_manager');
  return result;
}

// Like requireManager, but also requires the admin flag. Non-admin managers
// are bounced back to their dashboard.
export async function requireAdmin(): Promise<Manager> {
  const manager = await requireManager();
  if (!manager.is_admin) redirect('/dashboard');
  return manager;
}

// For API routes: returns the calling admin, or null. Callers decide the
// HTTP status; no redirects here.
export async function getAdmin(): Promise<Manager | null> {
  const result = await resolveManager();
  return typeof result !== 'string' && result.is_admin ? result : null;
}
