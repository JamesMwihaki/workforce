import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import RegisterForm from './register/RegisterForm';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createClient();
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, address')
    .order('name');

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          ShiftAlert
        </h1>
        <p className="mt-1 text-sm text-gray-700">
          Same-day shift coverage across the Chipotle store cluster. Sign up
          below to receive SMS shift alerts from neighbouring stores.
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

      <footer className="mt-10 border-t border-gray-200 pt-4 text-xs text-gray-600">
        <p>
          ShiftAlert is a shift-coverage notification service operated by{' '}
          <span className="font-medium text-gray-800">James Karui</span>, a
          sole proprietor based in Overland Park, Kansas. We help restaurant
          teams fill open shifts by sending SMS alerts to employees who have
          opted in.
        </p>
        <p className="mt-2">
          Questions? Email{' '}
          <a href="mailto:jmsmwhk@gmail.com" className="underline">
            jmsmwhk@gmail.com
          </a>{' '}
          or call{' '}
          <a href="tel:+19133250030" className="underline">
            (913) 325-0030
          </a>
          .
        </p>
        <p className="mt-2 text-center">
          <Link href="/sms-policy" className="underline">
            SMS Policy &amp; Consent
          </Link>
        </p>
      </footer>
    </main>
  );
}
