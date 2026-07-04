import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalWorker } from '@/lib/workerAuth';
import WorkerLoginForm from './WorkerLoginForm';

export const dynamic = 'force-dynamic';

export default async function WorkerLoginPage() {
  const worker = await getPortalWorker();
  if (worker) redirect('/worker');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Worker sign-in</h1>
        <p className="text-sm text-gray-700">
          Enter the phone number you registered with and we&apos;ll text you a
          sign-in code.
        </p>
      </header>

      <WorkerLoginForm />

      <p className="text-sm text-gray-600">
        Not registered yet?{' '}
        <Link href="/register" className="underline">
          Register here
        </Link>
        .
      </p>
    </main>
  );
}
