import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import AdminNav from './AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2">
            <Link href="/admin" className="font-semibold tracking-tight">
              ShiftAlert
            </Link>
            <span className="rounded bg-black px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-gray-600 sm:inline">{admin.name}</span>
            <Link
              href="/dashboard"
              className="text-gray-600 hover:text-gray-900 hover:underline"
            >
              Dashboard
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

      <AdminNav />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
