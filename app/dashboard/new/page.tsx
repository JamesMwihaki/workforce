import { requireManager } from '@/lib/auth';
import NewShiftForm from './NewShiftForm';

export const dynamic = 'force-dynamic';

export default async function NewShiftPage() {
  await requireManager();
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">New shift request</h1>
      <NewShiftForm />
    </div>
  );
}
