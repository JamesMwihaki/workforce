import Link from 'next/link';

export default function RegisterSuccess() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <h1 className="text-xl font-semibold text-green-900">You&apos;re registered.</h1>
        <p className="mt-2 text-sm text-green-800">
          We&apos;ll text you when a nearby store needs help with one of your roles.
          Reply <strong>YES</strong> to claim a shift, or <strong>STOP</strong> to opt out at any time.
        </p>
      </div>
      <Link href="/" className="text-center text-sm text-gray-600 underline">
        Back to home
      </Link>
    </main>
  );
}
