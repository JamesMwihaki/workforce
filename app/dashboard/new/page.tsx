import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import NewShiftForm from './NewShiftForm';

export const dynamic = 'force-dynamic';

export default async function NewShiftPage() {
  await requireManager();
  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
        ← All requests
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">New shift request</h1>
      <NewShiftForm />
    </div>
  );
}
