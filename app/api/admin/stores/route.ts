import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const Body = z.object({
  name:    z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional().default(''),
});

// POST /api/admin/stores — add a store to the cluster.
export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorised.' }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please enter a store name.' }, { status: 400 });
  }
  const { name, address } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('stores')
    .insert({ name, address: address || null })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Couldn't add the store: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
