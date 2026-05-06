'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLES, ROLE_LABELS } from '@/lib/roles';

const inputCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black';

export default function NewShiftForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      role:             String(form.get('role') ?? ''),
      shift_date:       String(form.get('shift_date') ?? ''),
      start_time:       String(form.get('start_time') ?? ''),
      end_time:         String(form.get('end_time') ?? ''),
      headcount_needed: Number(form.get('headcount_needed') ?? 0),
    };

    if (payload.start_time >= payload.end_time) {
      setError('End time must be after start time.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? 'Failed to create shift request.');
        return;
      }

      router.push(`/dashboard/requests/${body.id}`);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
      <Field label="Role">
        <select name="role" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            Choose a role…
          </option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date">
        <input
          name="shift_date"
          type="date"
          required
          min={new Date().toISOString().slice(0, 10)}
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time">
          <input name="start_time" type="time" required className={inputCls} />
        </Field>
        <Field label="End time">
          <input name="end_time" type="time" required className={inputCls} />
        </Field>
      </div>

      <Field label="Workers needed">
        <input
          name="headcount_needed"
          type="number"
          min={1}
          max={50}
          defaultValue={1}
          required
          className={inputCls}
        />
      </Field>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Send to neighbouring stores'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
