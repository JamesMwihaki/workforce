import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '../helpers/supabaseMock';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  decideIncentive: vi.fn(),
  checkSameStorePickup: vi.fn(() => Promise.resolve({ eligible: true })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock('@/lib/incentive-decision', () => ({
  decideIncentive: mocks.decideIncentive,
}));
vi.mock('@/lib/schedule', () => ({
  checkSameStorePickup: mocks.checkSameStorePickup,
}));

import { POST } from '@/app/api/twilio/reply/route';

// NODE_ENV !== 'production' in vitest, so Twilio signature validation is
// skipped and we can post plain form bodies.
function smsRequest(from: string, body: string): Request {
  return new Request('http://localhost/api/twilio/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, Body: body }).toString(),
  });
}

const WORKER = {
  id: 'w-1',
  name: 'Test Worker',
  store_id: 'store-A',
  roles: ['kitchen'],
  is_active: true,
  schedule_updated_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/twilio/reply', () => {
  it('STOP opts a worker out even before any other handling', async () => {
    const supabase = createSupabaseMock([
      { table: 'workers', result: { data: WORKER } },  // phone lookup
      { table: 'workers', result: { error: null } },   // is_active=false update
    ]);
    mocks.createServiceClient.mockReturnValue(supabase);

    const res = await POST(smsRequest('+19130000001', 'STOP'));
    const xml = await res.text();

    expect(xml).toContain('opted out');
    expect(supabase.unconsumed()).toEqual([]);
  });

  it('HELP returns the compliance blurb', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([{ table: 'workers', result: { data: WORKER } }]),
    );

    const res = await POST(smsRequest('+19130000001', 'HELP'));
    expect(await res.text()).toContain('ShiftAlert');
  });

  it('unknown numbers are told to register', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([{ table: 'workers', result: { data: null } }]),
    );

    const res = await POST(smsRequest('+19999999999', 'YES 12'));
    expect(await res.text()).toContain('don&apos;t recognise this number');
  });

  it('a bare YES without a shift number is rejected', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([{ table: 'workers', result: { data: WORKER } }]),
    );

    const res = await POST(smsRequest('+19130000001', 'YES'));
    expect(await res.text()).toContain('include the shift number');
  });

  it('YES <code> books a cross-store worker and confirms', async () => {
    const supabase = createSupabaseMock([
      { table: 'workers', result: { data: WORKER } },
      { table: 'shift_requests', result: { data: { id: 'shift-9' } } }, // code lookup
      {
        table: 'shift_requests',
        result: {
          data: {
            id: 'shift-9',
            shift_date: '2026-07-08',
            start_time: '16:00:00',
            end_time: '22:00:00',
            requesting_store_id: 'store-B', // different store — no schedule gate
          },
        },
      },
      { table: 'stores', result: { data: { name: 'Chipotle — Elsewhere' } } },
    ]);
    supabase.rpc = vi.fn(() => Promise.resolve({ data: 'confirmed', error: null }));
    mocks.createServiceClient.mockReturnValue(supabase);

    const res = await POST(smsRequest('+19130000001', 'YES 9'));
    const xml = await res.text();

    expect(supabase.rpc).toHaveBeenCalledWith('claim_shift', {
      p_shift_id: 'shift-9',
      p_worker_id: 'w-1',
    });
    expect(xml).toContain('You&apos;re confirmed'); // TwiML XML-escapes apostrophes
    expect(xml).toContain('Chipotle — Elsewhere');
  });

  it('APPROVE <code> from an admin phone approves and reports back', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'workers', result: { data: WORKER } },      // phone lookup
        { table: 'managers', result: { data: [{ id: 'adm-1', worker: { phone: '+19130000001' } }] } },
        { table: 'shift_requests', result: { data: { id: 'shift-7' } } }, // code lookup
      ]),
    );
    mocks.decideIncentive.mockResolvedValue({
      ok: true,
      shift: {
        id: 'shift-7',
        role: 'kitchen',
        shift_date: '2026-07-08',
        start_time: '16:00:00',
        end_time: '00:00:00',
        incentive_amount: 2,
        store_name: 'Chipotle — Test',
      },
    });

    const res = await POST(smsRequest('+19130000001', 'APPROVE 7'));
    const xml = await res.text();

    expect(mocks.decideIncentive).toHaveBeenCalledWith({
      shiftId: 'shift-7',
      action: 'approve',
      adminId: 'adm-1',
    });
    expect(xml).toContain('Approved');
    expect(xml).toContain('$2/hr');
  });

  it('DENY <code> declines at regular pay', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'workers', result: { data: WORKER } },
        { table: 'managers', result: { data: [{ id: 'adm-1', worker: { phone: '+19130000001' } }] } },
        { table: 'shift_requests', result: { data: { id: 'shift-7' } } },
      ]),
    );
    mocks.decideIncentive.mockResolvedValue({
      ok: true,
      shift: {
        id: 'shift-7',
        role: 'kitchen',
        shift_date: '2026-07-08',
        start_time: '16:00:00',
        end_time: '00:00:00',
        incentive_amount: 2,
        store_name: 'Chipotle — Test',
      },
    });

    const res = await POST(smsRequest('+19130000001', 'DENY 7'));
    const xml = await res.text();

    expect(mocks.decideIncentive).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'decline' }),
    );
    expect(xml).toContain('regular pay');
  });

  it('APPROVE from a non-admin is refused without leaking anything', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'workers', result: { data: WORKER } },
        { table: 'managers', result: { data: [] } }, // phone matches no admin
      ]),
    );

    const res = await POST(smsRequest('+19130000001', 'APPROVE 7'));
    const xml = await res.text();

    expect(mocks.decideIncentive).not.toHaveBeenCalled();
    expect(xml).toContain('Reply YES to claim a shift');
  });

  it('an already-decided incentive tells the admin instead of re-running', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'workers', result: { data: WORKER } },
        { table: 'managers', result: { data: [{ id: 'adm-1', worker: { phone: '+19130000001' } }] } },
        { table: 'shift_requests', result: { data: { id: 'shift-7' } } },
      ]),
    );
    mocks.decideIncentive.mockResolvedValue({ ok: false, reason: 'already_decided' });

    const res = await POST(smsRequest('+19130000001', 'APPROVE 7'));
    expect(await res.text()).toContain('already been decided');
  });
});
