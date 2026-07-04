'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const inputCls =
  'w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/20';

type Status = { kind: 'ok' | 'err'; msg: string } | null;

export default function AccountForm({
  initialName,
  initialEmail,
}: {
  initialName:  string;
  initialEmail: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);

  async function submit(
    body: Record<string, unknown>,
    setStatus: (s: Status) => void,
    setBusy: (b: boolean) => void,
    onSuccess?: () => void,
  ) {
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch('/api/manager/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: 'err', msg: data.error ?? 'Something went wrong.' });
        return;
      }
      onSuccess?.();
      if (data.reauth) {
        // Login identity changed — the session is gone. Send them to sign in.
        setStatus({ kind: 'ok', msg: 'Email updated. Please sign in again…' });
        setTimeout(() => {
          window.location.href = '/manager-login';
        }, 1200);
        return;
      }
      setStatus({ kind: 'ok', msg: 'Saved.' });
      router.refresh();
    } catch {
      setStatus({ kind: 'err', msg: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ProfileCard initialName={initialName} submit={submit} />
      <EmailCard
        email={email}
        setEmail={setEmail}
        initialEmail={initialEmail}
        submit={submit}
      />
      <PasswordCard submit={submit} />
    </div>
  );
}

type Submit = (
  body: Record<string, unknown>,
  setStatus: (s: Status) => void,
  setBusy: (b: boolean) => void,
  onSuccess?: () => void,
) => Promise<void>;

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <form className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </form>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      className={`rounded-md px-3 py-2 text-sm ${
        status.kind === 'ok'
          ? 'bg-green-50 text-green-700'
          : 'bg-red-50 text-red-700'
      }`}
    >
      {status.msg}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-gray-900">{label}</span>
      {children}
    </label>
  );
}

function ProfileCard({
  initialName,
  submit,
}: {
  initialName: string;
  submit: Submit;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  return (
    <Card title="Name">
      <Field label="Display name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </Field>
      <StatusLine status={status} />
      <button
        type="button"
        disabled={busy || name.trim() === '' || name === initialName}
        onClick={() => submit({ action: 'profile', name: name.trim() }, setStatus, setBusy)}
        className="rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save name'}
      </button>
    </Card>
  );
}

function EmailCard({
  email,
  setEmail,
  initialEmail,
  submit,
}: {
  email: string;
  setEmail: (v: string) => void;
  initialEmail: string;
  submit: Submit;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  return (
    <Card title="Email">
      <p className="text-xs text-gray-500">
        This is the email you sign in with. Changing it takes effect immediately.
      </p>
      <Field label="Email address">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          autoComplete="email"
        />
      </Field>
      <Field label="Current password">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          autoComplete="current-password"
        />
      </Field>
      <StatusLine status={status} />
      <button
        type="button"
        disabled={busy || email.trim() === '' || email === initialEmail || password === ''}
        onClick={() =>
          submit(
            { action: 'email', email: email.trim(), current_password: password },
            setStatus,
            setBusy,
            () => setPassword(''),
          )
        }
        className="rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Update email'}
      </button>
    </Card>
  );
}

function PasswordCard({ submit }: { submit: Submit }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const mismatch = confirm !== '' && next !== confirm;
  const canSubmit =
    !busy && current !== '' && next.length >= 8 && next === confirm;

  return (
    <Card title="Password">
      <Field label="Current password">
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputCls}
          autoComplete="current-password"
        />
      </Field>
      <Field label="New password">
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputCls}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </Field>
      <Field label="Confirm new password">
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
          autoComplete="new-password"
        />
      </Field>
      {mismatch && (
        <p className="text-xs font-medium text-red-700">Passwords don&apos;t match.</p>
      )}
      <StatusLine status={status} />
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() =>
          submit(
            { action: 'password', new_password: next, current_password: current },
            setStatus,
            setBusy,
            () => {
              setCurrent('');
              setNext('');
              setConfirm('');
            },
          )
        }
        className="rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </Card>
  );
}
