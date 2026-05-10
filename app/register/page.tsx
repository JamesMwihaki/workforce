import { createClient } from '@/lib/supabase/server';
import RegisterForm from './RegisterForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const supabase = createClient();
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, address')
    .order('name');

  if (error) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-semibold">Registration unavailable</h1>
        <p className="mt-2 text-sm text-gray-600">
          We couldn&apos;t load the store list. Please try again in a few minutes.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Worker registration
        </h1>
        <p className="mt-1 text-sm text-gray-700">
          Sign up to receive shift alerts from neighbouring stores.
        </p>
      </header>
      <RegisterForm stores={stores ?? []} />
    </main>
  );
}
