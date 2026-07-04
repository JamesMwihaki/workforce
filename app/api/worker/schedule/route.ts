import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getPortalWorker } from '@/lib/workerAuth';

const TIME_RE = /^\d{2}:\d{2}$/;

const Body = z.object({
  entries: z
    .array(
      z.object({
        weekday:    z.number().int().min(0).max(6),
        start_time: z.string().regex(TIME_RE),
        end_time:   z.string().regex(TIME_RE),
      }),
    )
    .max(7),
});

// PUT /api/worker/schedule — replace the logged-in worker's regular weekly
// schedule. Days without an entry are days off.
export async function PUT(req: Request) {
  const worker = await getPortalWorker();
  if (!worker) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the schedule times.' }, { status: 400 });
  }
  const { entries } = parsed.data;

  const weekdays = new Set(entries.map((e) => e.weekday));
  if (weekdays.size !== entries.length) {
    return NextResponse.json({ error: 'One entry per day, please.' }, { status: 400 });
  }
  for (const e of entries) {
    // end '00:00' means a midnight close; otherwise end must be after start.
    if (e.end_time !== '00:00' && e.end_time <= e.start_time) {
      return NextResponse.json(
        { error: 'Each day\'s end time must be after its start time.' },
        { status: 400 },
      );
    }
  }

  const svc = createServiceClient();

  // Replace-all: simplest way to keep "days without an entry are days off".
  const { error: delErr } = await svc
    .from('worker_schedules')
    .delete()
    .eq('worker_id', worker.id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (entries.length > 0) {
    const { error: insErr } = await svc.from('worker_schedules').insert(
      entries.map((e) => ({ ...e, worker_id: worker.id })),
    );
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  const { error: stampErr } = await svc
    .from('workers')
    .update({ schedule_updated_at: new Date().toISOString() })
    .eq('id', worker.id);
  if (stampErr) {
    return NextResponse.json({ error: stampErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
