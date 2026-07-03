'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ManagerRow = {
  id:         string;
  name:       string;
  email:      string;
  store_id:   string;
  is_admin:   boolean;
  store_name: string;
};

export type StoreOption = { id: string; name: string };

const inputCls =
  'w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/20';

export default function ManagersPanel({
  managers,
  stores,
  selfId,
}: {
  managers: ManagerRow[];
  stores: StoreOption[];
  selfId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Add form state ────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function callApi(path: string, init: RequestInit): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        headers: { 'content-type': 'application/json' },
        ...init,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Something went wrong.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Network error. Please try again.');
      return false;
    }
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setSubmitting(true);
    const ok = await callApi('/api/admin/managers', {
      method: 'POST',
      body: JSON.stringify({
        name:     String(form.get('name') ?? '').trim(),
        email:    String(form.get('email') ?? '').trim(),
        password: String(form.get('password') ?? ''),
        store_id: String(form.get('store_id') ?? ''),
        is_admin: form.get('is_admin') === 'on',
      }),
    });
    setSubmitting(false);
    if (ok) {
      formEl.reset();
      setShowForm(false);
      setNotice('Manager added. Share the email and temporary password with them.');
    }
  }

  async function onToggleAdmin(m: ManagerRow) {
    setBusyId(m.id);
    await callApi(`/api/admin/managers/${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_admin: !m.is_admin }),
    });
    setBusyId(null);
  }

  async function onChangeStore(m: ManagerRow, store_id: string) {
    if (store_id === m.store_id) return;
    setBusyId(m.id);
    await callApi(`/api/admin/managers/${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ store_id }),
    });
    setBusyId(null);
  }

  async function onResetPassword(m: ManagerRow) {
    const password = window.prompt(
      `New temporary password for ${m.name} (min 8 characters):`,
    );
    if (!password) return;
    setBusyId(m.id);
    const ok = await callApi(`/api/admin/managers/${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    });
    setBusyId(null);
    if (ok) setNotice(`Password updated for ${m.name}.`);
  }

  async function onDelete(m: ManagerRow) {
    if (!window.confirm(`Remove ${m.name} (${m.email})? They will no longer be able to sign in.`)) {
      return;
    }
    setBusyId(m.id);
    await callApi(`/api/admin/managers/${m.id}`, { method: 'DELETE' });
    setBusyId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Managers</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {showForm ? 'Cancel' : 'Add manager'}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      )}

      {showForm && (
        <form
          onSubmit={onAdd}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-gray-900">Name</span>
              <input name="name" required className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-gray-900">Email</span>
              <input name="email" type="email" required className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-gray-900">
                Temporary password
              </span>
              <input
                name="password"
                type="text"
                required
                minLength={8}
                placeholder="Min 8 characters"
                autoComplete="off"
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-gray-900">Home store</span>
              <select name="store_id" required defaultValue="" className={inputCls}>
                <option value="" disabled>
                  Choose a store…
                </option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input type="checkbox" name="is_admin" className="h-4 w-4 accent-black" />
            Also grant admin access
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {submitting ? 'Adding…' : 'Add manager'}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((m) => {
              const isSelf = m.id === selfId;
              const busy = busyId === m.id;
              return (
                <tr key={m.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {m.name}
                      {isSelf && <span className="ml-1.5 text-xs text-gray-500">(you)</span>}
                    </div>
                    <div className="text-gray-500">{m.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={m.store_id}
                      disabled={busy}
                      onChange={(e) => onChangeStore(m, e.target.value)}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {m.is_admin ? (
                      <span className="rounded bg-black px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                        Admin
                      </span>
                    ) : (
                      <span className="text-gray-500">Manager</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <RowAction
                        onClick={() => onToggleAdmin(m)}
                        disabled={busy || isSelf}
                        title={isSelf ? "You can't change your own admin access." : undefined}
                      >
                        {m.is_admin ? 'Revoke admin' : 'Make admin'}
                      </RowAction>
                      <RowAction onClick={() => onResetPassword(m)} disabled={busy}>
                        Reset password
                      </RowAction>
                      <RowAction
                        onClick={() => onDelete(m)}
                        disabled={busy || isSelf}
                        title={isSelf ? "You can't remove yourself." : undefined}
                        danger
                      >
                        Remove
                      </RowAction>
                    </div>
                  </td>
                </tr>
              );
            })}
            {managers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No managers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowAction({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-red-200 text-red-700 hover:bg-red-50'
          : 'border-gray-300 text-gray-900 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}
