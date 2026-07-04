import { createServiceClient } from '@/lib/supabase/server';
import { one } from '@/lib/db';

// Shape shared by the request-detail page, the /api/shifts/[id] route, and
// the RequestLive client component.
export type ClaimDetail = {
  id:         string;
  status:     'confirmed' | 'waitlisted' | 'cancelled';
  claimed_at: string;
  worker: {
    id:          string;
    name:        string;
    phone:       string;
    employee_id: string;
    store:       { id: string; name: string } | null;
    // Manager(s) of the worker's home store, so the requesting manager knows
    // who to coordinate with. A store can have more than one manager.
    managers:    { name: string; email: string }[];
  } | null;
};

// Fetch a shift's claims with full worker details. Uses the service role
// because workers/managers have no client-side RLS read policies — callers
// MUST have already verified the requesting manager may see this shift.
export async function fetchClaimDetails(shiftId: string): Promise<ClaimDetail[]> {
  const svc = createServiceClient();

  const { data, error } = await svc
    .from('shift_claims')
    .select(
      'id, status, claimed_at, worker:workers(id, name, phone, employee_id, store:stores(id, name))',
    )
    .eq('shift_request_id', shiftId)
    .order('claimed_at');

  if (error) throw new Error(error.message);

  const claims = (data ?? []).map((r) => {
    const rawWorker = one(r.worker);
    if (!rawWorker) return { ...r, worker: null };
    return { ...r, worker: { ...rawWorker, store: one(rawWorker.store), managers: [] } };
  }) as ClaimDetail[];

  const storeIds = Array.from(
    new Set(
      claims
        .map((c) => c.worker?.store?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (storeIds.length === 0) return claims;

  const { data: managers, error: mgrErr } = await svc
    .from('managers')
    .select('name, email, store_id')
    .in('store_id', storeIds);

  if (mgrErr) throw new Error(mgrErr.message);

  const byStore = new Map<string, { name: string; email: string }[]>();
  for (const m of managers ?? []) {
    const list = byStore.get(m.store_id) ?? [];
    list.push({ name: m.name, email: m.email });
    byStore.set(m.store_id, list);
  }

  for (const c of claims) {
    if (c.worker?.store) {
      c.worker.managers = byStore.get(c.worker.store.id) ?? [];
    }
  }

  return claims;
}
