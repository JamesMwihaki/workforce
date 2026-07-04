import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '../helpers/supabaseMock';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  broadcastShift: vi.fn(() => Promise.resolve()),
  sendSms: vi.fn(() => Promise.resolve({ sent: 1, failed: 0 })),
  getTwilioFromNumber: vi.fn(() => '+18449263672'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  createServiceClient: mocks.createServiceClient,
}));
vi.mock('@/lib/broadcast', () => ({ broadcastShift: mocks.broadcastShift }));
vi.mock('@/lib/sms', () => ({ sendSms: mocks.sendSms }));
vi.mock('@/lib/twilio', () => ({ getTwilioFromNumber: mocks.getTwilioFromNumber }));

import { POST } from '@/app/api/shifts/route';

const todayIso = () => new Date().toISOString().slice(0, 10);

function shiftRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/shifts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    role: 'kitchen',
    shift_date: todayIso(),
    start_time: '16:00',
    end_time: '22:00',
    headcount_needed: 1,
    ...overrides,
  };
}

function manager(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mgr-1',
    name: 'Jimena Banuelos',
    store_id: 'store-A',
    is_admin: false,
    store: { name: 'Chipotle — Test' },
    ...overrides,
  };
}

const INSERTED_SHIFT = {
  id: 'shift-1',
  code: 42,
  role: 'kitchen',
  shift_date: todayIso(),
  start_time: '16:00',
  end_time: '22:00',
  headcount_needed: 1,
  requesting_store_id: 'store-A',
};

function authClientFor(mgr: Record<string, unknown> | null) {
  const client = createSupabaseMock(
    mgr ? [{ table: 'managers', result: { data: mgr } }] : [],
  );
  client.auth.getUser = vi.fn(() =>
    Promise.resolve({ data: { user: mgr ? { id: 'mgr-1' } : null } }),
  );
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/shifts', () => {
  it('rejects anonymous callers', async () => {
    mocks.createClient.mockReturnValue(authClientFor(null));

    const res = await POST(shiftRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it('rejects an end time before the start time', async () => {
    mocks.createClient.mockReturnValue(authClientFor(manager()));

    const res = await POST(shiftRequest(validBody({ start_time: '17:00', end_time: '09:00' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('End time');
  });

  it('rejects dates outside the two-week window', async () => {
    mocks.createClient.mockReturnValue(authClientFor(manager()));

    const res = await POST(shiftRequest(validBody({ shift_date: '2030-01-01' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('two weeks');
  });

  it('a plain shift broadcasts immediately with no bonus', async () => {
    mocks.createClient.mockReturnValue(authClientFor(manager()));
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([{ table: 'shift_requests', result: { data: INSERTED_SHIFT } }]),
    );

    const res = await POST(shiftRequest(validBody()));
    const body = await res.json();

    expect(body).toEqual({ id: 'shift-1' });
    expect(mocks.broadcastShift).toHaveBeenCalledWith(
      expect.objectContaining({ shiftId: 'shift-1', incentiveAmount: 0 }),
    );
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("a manager's incentive shift is held for approval: no broadcast, admins texted", async () => {
    mocks.createClient.mockReturnValue(authClientFor(manager({ is_admin: false })));
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'shift_requests', result: { data: INSERTED_SHIFT } },
        {
          table: 'managers', // admins-with-phones lookup
          result: { data: [{ worker: { id: 'w-adm', phone: '+19130000001' } }] },
        },
      ]),
    );

    const res = await POST(shiftRequest(validBody({ incentive_amount: 2 })));
    const body = await res.json();

    expect(body).toEqual({ id: 'shift-1', pending_approval: true });
    expect(mocks.broadcastShift).not.toHaveBeenCalled();

    expect(mocks.sendSms).toHaveBeenCalledOnce();
    const [shiftId, kind, message, recipients] = mocks.sendSms.mock.calls[0] as unknown[];
    expect(shiftId).toBe('shift-1');
    expect(kind).toBe('incentive_approval');
    expect(message).toContain('+$2/hr');
    expect(message).toContain('APPROVE%2042'); // tap-to-reply link with the shift code
    expect(message).toContain('DENY%2042');
    expect(recipients).toEqual([{ workerId: 'w-adm', phone: '+19130000001' }]);
  });

  it("an admin's incentive shift auto-approves and broadcasts with the bonus", async () => {
    mocks.createClient.mockReturnValue(authClientFor(manager({ is_admin: true })));
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([{ table: 'shift_requests', result: { data: INSERTED_SHIFT } }]),
    );

    const res = await POST(shiftRequest(validBody({ incentive_amount: 3 })));
    const body = await res.json();

    expect(body).toEqual({ id: 'shift-1' });
    expect(mocks.broadcastShift).toHaveBeenCalledWith(
      expect.objectContaining({ incentiveAmount: 3 }),
    );
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });
});
