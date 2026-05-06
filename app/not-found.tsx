import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-gray-600">
        The link you followed may be broken, or the page may have been removed.
      </p>
      <Link href="/" className="text-sm text-gray-700 underline">
        Back to home
      </Link>
    </main>
  );
}
