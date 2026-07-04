import { vi } from 'vitest';

// A minimal stand-in for the supabase-js query builder: every filter/modifier
// method chains, and the query resolves (via await, .single(), or
// .maybeSingle()) to the next queued result for that table. Queue results in
// the order the code under test runs its queries.
export type QueuedResult = { data?: unknown; error?: unknown; count?: number };

export function createSupabaseMock(queue: Array<{ table: string; result: QueuedResult }>) {
  const remaining = [...queue];

  function nextResult(table: string): QueuedResult {
    const idx = remaining.findIndex((q) => q.table === table);
    if (idx === -1) {
      throw new Error(
        `supabaseMock: no queued result for table "${table}" (remaining: ${remaining
          .map((q) => q.table)
          .join(', ') || 'none'})`,
      );
    }
    return remaining.splice(idx, 1)[0].result;
  }

  const from = vi.fn((table: string) => {
    const result = () => nextResult(table);
    let resolved: QueuedResult | null = null;
    const resolve = () => (resolved ??= result());

    const builder: Record<string, unknown> = {};
    for (const m of [
      'select', 'insert', 'update', 'delete', 'upsert',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'contains',
      'order', 'limit', 'range',
    ]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => Promise.resolve(resolve()));
    builder.maybeSingle = vi.fn(() => Promise.resolve(resolve()));
    // Awaiting the builder directly (no .single()) also resolves.
    builder.then = (onOk: (v: QueuedResult) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onOk, onErr);
    return builder;
  });

  return {
    from,
    rpc: vi.fn(() =>
      Promise.resolve({ data: null as unknown, error: null as unknown }),
    ),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
      admin: {
        createUser: vi.fn(),
        deleteUser: vi.fn(),
        updateUserById: vi.fn(),
      },
    },
    /** Tables still queued — assert this is empty to prove every query ran. */
    unconsumed: () => remaining.map((q) => q.table),
  };
}
