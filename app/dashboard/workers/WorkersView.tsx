'use client';

import { useMemo, useState } from 'react';
import { ROLE_LABELS, type Role } from '@/lib/roles';

export type WorkerRow = {
  id:          string;
  employee_id: string;
  name:        string;
  phone:       string;
  roles:       string[];
  is_active:   boolean;
};

// Read-only roster of the manager's store. Activation and edits are
// admin-only (/admin/workers).
export default function WorkersView({
  workers,
  storeName,
}: {
  workers: WorkerRow[];
  storeName: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.employee_id.toLowerCase().includes(q) ||
        w.phone.includes(q),
    );
  }, [workers, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workers</h1>
          <p className="text-sm text-gray-500">Registered at {storeName}</p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, ID, phone…"
          className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/20"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Worker</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => (
              <tr
                key={w.id}
                className={`border-b border-gray-100 last:border-0 ${
                  w.is_active ? '' : 'bg-gray-50 text-gray-400'
                }`}
              >
                <td className="px-4 py-3">
                  <div className={`font-medium ${w.is_active ? 'text-gray-900' : ''}`}>
                    {w.name}
                  </div>
                  <div className="text-gray-500">
                    #{w.employee_id} · {w.phone}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {w.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                      >
                        {ROLE_LABELS[r as Role] ?? r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {w.is_active ? (
                    <span className="font-medium text-green-700">Active</span>
                  ) : (
                    <span>Inactive</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  {workers.length === 0
                    ? 'No workers registered at this store yet.'
                    : 'No matches.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
