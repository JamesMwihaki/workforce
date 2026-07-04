import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import AccountForm from './AccountForm';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const manager = await requireManager();

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
        ← Back to dashboard
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          {manager.store?.name ?? 'No store'} · Signed in as {manager.email}
        </p>
      </div>

      <AccountForm
        initialName={manager.name}
        initialEmail={manager.email}
      />
    </div>
  );
}
