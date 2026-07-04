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
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          {/* Row 1: brand + navigation */}
          <div className="flex items-center justify-between py-3">
            <Link
              href="/dashboard"
              className="shrink-0 font-semibold tracking-tight"
            >
              ShiftAlert
            </Link>

            <div className="flex items-center gap-4 text-sm">
              {manager.is_admin && (
                <Link
                  href="/admin"
                  className="text-gray-600 hover:text-gray-900 hover:underline"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/dashboard/workers"
                className="text-gray-600 hover:text-gray-900 hover:underline"
              >
                Workers
              </Link>
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

          {/* Row 2: store + signed-in context, full width on its own line */}
          <div className="border-t border-gray-100 py-2 text-sm text-gray-600">
            <span className="font-medium text-gray-900">
              {manager.store?.name ?? 'No store assigned'}
            </span>
            <span className="text-gray-400"> · </span>
            <span>{manager.name}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
