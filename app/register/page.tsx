import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import RegisterForm from './RegisterForm';

export const dynamic = 'force-dynamic';

export default async function Register() {
  const supabase = createClient();
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, address')
    .order('name');

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <Link href="/" className="text-sm text-gray-600 hover:underline">
        ← Back
      </Link>

      <header className="mb-6 mt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Worker registration
        </h1>
        <p className="mt-1 text-sm text-gray-700">
          Sign up below to receive SMS shift alerts from neighbouring stores.
        </p>
      </header>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          We couldn&apos;t load the store list. Please try again in a few
          minutes.
        </p>
      ) : (
        <RegisterForm stores={stores ?? []} />
      )}

      <footer className="mt-10 border-t border-gray-200 pt-4 text-center text-xs text-gray-600">
        <Link href="/sms-policy" className="underline">
          SMS Policy &amp; Consent
        </Link>
      </footer>
    </main>
  );
}
