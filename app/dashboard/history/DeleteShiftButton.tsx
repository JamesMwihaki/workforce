'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteShiftButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setConfirming(false);
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

  function stop(e: React.MouseEvent, fn: () => void) {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] text-red-700">Delete forever?</span>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Yes, delete
          </button>
          <button
            type="button"
            onClick={(e) => stop(e, () => setConfirming(false))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={(e) => stop(e, () => setConfirming(true))}
          disabled={busy}
          className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      )}
      {err && <span className="text-[11px] text-red-700">{err}</span>}
    </div>
  );
}
