import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">ShiftAlert</h1>
        <p className="text-sm text-gray-700">
          Same-day shift coverage across the Chipotle store cluster.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Link
          href="/register"
          className="rounded-md bg-black px-4 py-3 text-center text-sm font-medium text-white hover:bg-gray-800"
        >
          I&apos;m a worker — register
        </Link>
        <Link
          href="/manager-login"
          className="rounded-md border border-gray-400 bg-white px-4 py-3 text-center text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          I&apos;m a manager — log in
        </Link>
      </div>

      <footer className="border-t border-gray-200 pt-4 text-xs text-gray-600">
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
