'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const inputCls =
  'w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/20';

export default function WorkerLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/worker/otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not send a code.');
        return;
      }
      setStep('code');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/worker/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'That code didn\'t work.');
        return;
      }
      router.push('/worker');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={requestCode} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-gray-900">Phone number</span>
          <input
            type="tel"
            required
            autoComplete="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </label>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Text me a code'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="space-y-4">
      <p className="text-sm text-gray-700">
        We texted a 6-digit code to <span className="font-medium">{phone}</span>.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-semibold text-gray-900">Code</span>
        <input
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className={`${inputCls} tracking-[0.3em]`}
        />
      </label>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || code.length !== 6}
        className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Checking…' : 'Sign in'}
      </button>

      <button
        type="button"
        onClick={() => {
          setStep('phone');
          setCode('');
          setError(null);
        }}
        className="w-full text-sm text-gray-600 hover:underline"
      >
        Use a different number or resend
      </button>
    </form>
  );
}
