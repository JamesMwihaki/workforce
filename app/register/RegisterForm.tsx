'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/roles';

type Store = { id: string; name: string };

const inputCls =
  'w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/20';

export default function RegisterForm({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [consent, setConsent] = useState(false);

  function toggleRole(role: Role) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (selectedRoles.length === 0) {
      setError('Pick at least one role.');
      return;
    }

    if (!consent) {
      setError('You must agree to receive SMS shift alerts to register.');
      return;
    }

    const form = new FormData(e.currentTarget);
    const payload = {
      employee_id: String(form.get('employee_id') ?? '').trim(),
      name:        String(form.get('name') ?? '').trim(),
      phone:       String(form.get('phone') ?? '').trim(),
      store_id:    String(form.get('store_id') ?? ''),
      roles:       selectedRoles,
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/workers/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Registration failed. Please try again.');
        return;
      }

      router.push('/register/success');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Employee ID" hint="Your Chipotle employee number">
        <input
          name="employee_id"
          required
          autoComplete="off"
          className={inputCls}
          placeholder="e.g. 123456"
        />
      </Field>

      <Field label="Full name">
        <input name="name" required autoComplete="name" className={inputCls} />
      </Field>

      <Field label="Phone number" hint="We'll text you when shifts open up">
        <input
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          className={inputCls}
          placeholder="(555) 123-4567"
        />
      </Field>

      <Field label="Home store">
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
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-gray-900">Roles you can work</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((role) => {
            const checked = selectedRoles.includes(role);
            return (
              <label
                key={role}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition ${
                  checked
                    ? 'border-black bg-black text-white'
                    : 'border-gray-400 bg-white text-gray-900 hover:border-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleRole(role)}
                />
                {ROLE_LABELS[role]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-300 bg-gray-50 p-3 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-400 text-black focus:ring-2 focus:ring-black/30"
          aria-describedby="consent-detail"
        />
        <span id="consent-detail">
          I agree to receive SMS shift alerts from ShiftAlert at the phone
          number above. Message frequency varies. Message and data rates may
          apply. Reply <strong>STOP</strong> to unsubscribe at any time, or{' '}
          <strong>HELP</strong> for help. See our{' '}
          <Link
            href="/sms-policy"
            target="_blank"
            className="font-medium underline"
          >
            SMS policy
          </Link>{' '}
          for details.
        </span>
      </label>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || !consent}
        className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Register'}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-gray-900">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-600">{hint}</span>}
    </label>
  );
}
