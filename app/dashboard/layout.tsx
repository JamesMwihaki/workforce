import Link from 'next/link';
import { requireManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const manager = await requireManager();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="shrink-0 font-semibold tracking-tight"
          >
            ShiftAlert
          </Link>

          <span className="hidden min-w-0 flex-1 truncate text-sm text-gray-600 sm:block">
            {manager.store?.name ?? '—'} · {manager.name}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-4 text-sm sm:ml-0">
            {manager.is_admin && (
              <Link
                href="/admin"
                className="text-gray-600 hover:text-gray-900 hover:underline"
              >
                Admin
              </Link>
            )}
            <Link
              href="/dashboard/account"
              className="text-gray-600 hover:text-gray-900 hover:underline"
            >
              Account
            </Link>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
