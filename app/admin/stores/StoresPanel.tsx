'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type StoreRow = {
  id:            string;
  name:          string;
  address:       string;
  worker_count:  number;
  manager_count: number;
};

const inputCls =
  'w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/20';

export default function StoresPanel({ stores }: { stores: StoreRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name:    String(form.get('name') ?? '').trim(),
          address: String(form.get('address') ?? '').trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Failed to add store.');
        return;
      }
      formEl.reset();
      setShowForm(false);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Stores</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {showForm ? 'Cancel' : 'Add store'}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {showForm && (
        <form
          onSubmit={onAdd}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-gray-900">Store name</span>
              <input
                name="name"
                required
                placeholder="Chipotle — Downtown"
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-gray-900">Address</span>
              <input name="address" placeholder="123 Main St" className={inputCls} />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {submitting ? 'Adding…' : 'Add store'}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3 text-right">Managers</th>
              <th className="px-4 py-3 text-right">Active workers</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.address || '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.manager_count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.worker_count}</td>
              </tr>
            ))}
            {stores.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No stores yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
