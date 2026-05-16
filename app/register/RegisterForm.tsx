'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/roles';

type Store = { id: string; name: string; address: string | null };

const inputCls =
  'w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/20';

const MAX_RESULTS = 25;

export default function RegisterForm({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [consent, setConsent] = useState(false);
  const [storeQuery, setStoreQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const storeBoxRef = useRef<HTMLDivElement | null>(null);

  const filteredStores = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return stores.slice(0, MAX_RESULTS);
    return stores
      .filter((s) => {
        const hay = `${s.name} ${s.address ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, MAX_RESULTS);
  }, [storeQuery, stores]);

  useEffect(() => {
    function onPointer(e: MouseEvent | TouchEvent) {
      if (!storeBoxRef.current) return;
      if (!storeBoxRef.current.contains(e.target as Node)) setStoreOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, []);

  function pickStore(s: Store) {
    setSelectedStore(s);
    setStoreQuery('');
    setStoreOpen(false);
  }

  function clearStore() {
    setSelectedStore(null);
    setStoreQuery('');
    setStoreOpen(true);
  }

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

    if (!selectedStore) {
      setError('Pick your home store.');
      return;
    }

    const form = new FormData(e.currentTarget);
    const payload = {
      employee_id: String(form.get('employee_id') ?? '').trim(),
      name:        String(form.get('name') ?? '').trim(),
      phone:       String(form.get('phone') ?? '').trim(),
      store_id:    selectedStore.id,
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

      {/* Not wrapped in a <label> — mobile Safari redirects taps inside a
          label to the first form control (the search input), so dropdown
          buttons never fire their onClick. */}
      <div className="space-y-1.5">
        <span className="block text-sm font-semibold text-gray-900">Home store</span>
        <div ref={storeBoxRef} className="relative">
          {selectedStore ? (
            <div className="flex items-start justify-between gap-3 rounded-md border border-black bg-white px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-base font-medium text-gray-900">
                  {selectedStore.name}
                </div>
                {selectedStore.address && (
                  <div className="truncate text-xs text-gray-600">
                    {selectedStore.address}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={clearStore}
                className="shrink-0 text-sm font-medium text-gray-700 underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={storeQuery}
                onChange={(e) => {
                  setStoreQuery(e.target.value);
                  setStoreOpen(true);
                }}
                onFocus={() => setStoreOpen(true)}
                autoComplete="off"
                className={inputCls}
                placeholder="e.g. Overland Park, 135th, 66223"
              />
              {storeOpen && (
                <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-300 bg-white shadow-lg">
                  {filteredStores.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-600">
                      No stores match &ldquo;{storeQuery}&rdquo;.
                    </div>
                  ) : (
                    <ul>
                      {filteredStores.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => pickStore(s)}
                            className="block w-full px-3 py-2 text-left hover:bg-gray-100"
                          >
                            <div className="text-sm font-medium text-gray-900">
                              {s.name}
                            </div>
                            {s.address && (
                              <div className="truncate text-xs text-gray-600">
                                {s.address}
                              </div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <span className="block text-xs text-gray-600">
          Search by city, street, or ZIP
        </span>
      </div>

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
          apply. Reply <strong>HELP</strong> for help or{' '}
          <strong>STOP</strong> to unsubscribe at any time. See our{' '}
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
