'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ROLE_LABELS, type Role } from '@/lib/roles';

export type WorkerRow = {
  id:          string;
  employee_id: string;
  name:        string;
  phone:       string;
  roles:       string[];
  is_active:   boolean;
  store_name:  string;
  is_manager:  boolean;
};

export default function WorkersPanel({ workers }: { workers: WorkerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.employee_id.toLowerCase().includes(q) ||
        w.phone.includes(q) ||
        w.store_name.toLowerCase().includes(q),
    );
  }, [workers, query]);

  async function onToggleActive(w: WorkerRow) {
    setError(null);
    setNotice(null);
    setBusyId(w.id);
    try {
      const res = await fetch(`/api/admin/workers/${w.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: !w.is_active }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Failed to update worker.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function onMakeManager(w: WorkerRow) {
    setError(null);
    setNotice(null);

    const email = window.prompt(
      `Login email for ${w.name} (they'll sign in at /manager-login):`,
    );
    if (!email) return;
    const password = window.prompt(
      `Temporary password for ${w.name} (min 8 characters):`,
    );
    if (!password) return;

    setBusyId(w.id);
    try {
      const res = await fetch(`/api/admin/workers/${w.id}/promote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Failed to make this worker a manager.');
        return;
      }
      setNotice(
        `${w.name} is now a manager at ${w.store_name}. Share the email and temporary password with them.`,
      );
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Workers</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, ID, phone, store…"
          className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/20"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Worker</th>
              <th className="px-4 py-3">Home store</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
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
                    {w.is_manager && (
                      <span className="ml-1.5 rounded bg-black px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                        Manager
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500">
                    #{w.employee_id} · {w.phone}
                  </div>
                </td>
                <td className="px-4 py-3">{w.store_name}</td>
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
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2 whitespace-nowrap">
                    {!w.is_manager && (
                      <button
                        type="button"
                        disabled={busyId === w.id}
                        onClick={() => onMakeManager(w)}
                        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-900 transition hover:bg-gray-50 disabled:opacity-40"
                      >
                        Make manager
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === w.id}
                      onClick={() => onToggleActive(w)}
                      className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-900 transition hover:bg-gray-50 disabled:opacity-40"
                    >
                      {w.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {workers.length === 0 ? 'No workers registered yet.' : 'No matches.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
