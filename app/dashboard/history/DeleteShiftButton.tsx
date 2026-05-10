'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteShiftButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!confirm('Delete this cancelled shift permanently? This cannot be undone.')) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/shifts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? 'Could not delete.');
        return;
      }
      router.refresh();
    } catch {
      setErr('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {err && <span className="text-[11px] text-red-700">{err}</span>}
    </div>
  );
}
