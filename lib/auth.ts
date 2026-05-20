import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Manager = {
  id:       string;
  name:     string;
  email:    string;
  store_id: string;
  store: { id: string; name: string } | null;
};

// Resolve the current manager by joining auth.uid() against public.managers.
// Redirects to /manager-login if there's no session, and with an error if the
// session exists but no manager row is wired up.
export async function requireManager(): Promise<Manager> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/manager-login');

  const { data, error } = await supabase
    .from('managers')
    .select('id, name, email, store_id, store:stores(id, name)')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) {
    // Auth user exists but has no manager row — treat as unauthorised.
    redirect('/manager-login?error=no_manager');
  }

  // Supabase typings return `store` as an array for nested selects on some
  // versions; normalise to a single object.
  const store = Array.isArray(data.store) ? (data.store[0] ?? null) : data.store;

  return {
    id:       data.id,
    name:     data.name,
    email:    data.email,
    store_id: data.store_id,
    store,
  };
}
