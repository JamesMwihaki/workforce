import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '../helpers/supabaseMock';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  broadcastShift: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock('@/lib/broadcast', () => ({
  broadcastShift: mocks.broadcastShift,
}));

import { decideIncentive } from '@/lib/incentive-decision';

const tomorrow = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

function pendingShift(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shift-1',
    code: 22,
    role: 'kitchen',
    shift_date: tomorrow(),
    start_time: '16:00:00',
    end_time: '00:00:00',
    status: 'open',
    incentive_status: 'pending',
    incentive_amount: 2,
    requesting_store_id: 'store-1',
    store: { name: 'Chipotle — Test' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('decideIncentive', () => {
  it('rejects an unknown shift', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([{ table: 'shift_requests', result: { data: null } }]),
    );
    const res = await decideIncentive({ shiftId: 'nope', action: 'approve', adminId: 'a' });
    expect(res).toEqual({ ok: false, reason: 'not_found' });
    expect(mocks.broadcastShift).not.toHaveBeenCalled();
  });

  it('rejects a request that was already decided', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'shift_requests', result: { data: pendingShift({ incentive_status: 'approved' }) } },
      ]),
    );
    const res = await decideIncentive({ shiftId: 'shift-1', action: 'approve', adminId: 'a' });
    expect(res).toEqual({ ok: false, reason: 'already_decided' });
    expect(mocks.broadcastShift).not.toHaveBeenCalled();
  });

  it('rejects a shift that is no longer open', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'shift_requests', result: { data: pendingShift({ status: 'cancelled' }) } },
      ]),
    );
    const res = await decideIncentive({ shiftId: 'shift-1', action: 'approve', adminId: 'a' });
    expect(res).toEqual({ ok: false, reason: 'not_open' });
  });

  it('rejects a shift whose date has passed', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'shift_requests', result: { data: pendingShift({ shift_date: '2020-01-01' }) } },
      ]),
    );
    const res = await decideIncentive({ shiftId: 'shift-1', action: 'approve', adminId: 'a' });
    expect(res).toEqual({ ok: false, reason: 'date_passed' });
  });

  it('approve: saves the decision and broadcasts WITH the bonus', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'shift_requests', result: { data: pendingShift() } },
        { table: 'shift_requests', result: { error: null } }, // the update
      ]),
    );

    const res = await decideIncentive({ shiftId: 'shift-1', action: 'approve', adminId: 'adm' });

    expect(res.ok).toBe(true);
    expect(mocks.broadcastShift).toHaveBeenCalledOnce();
    expect(mocks.broadcastShift).toHaveBeenCalledWith(
      expect.objectContaining({ shiftId: 'shift-1', incentiveAmount: 2 }),
    );
  });

  it('decline: still broadcasts, but at regular pay', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'shift_requests', result: { data: pendingShift() } },
        { table: 'shift_requests', result: { error: null } },
      ]),
    );

    const res = await decideIncentive({ shiftId: 'shift-1', action: 'decline', adminId: 'adm' });

    expect(res.ok).toBe(true);
    expect(mocks.broadcastShift).toHaveBeenCalledWith(
      expect.objectContaining({ incentiveAmount: 0 }),
    );
  });

  it('a failed decision save never broadcasts', async () => {
    mocks.createServiceClient.mockReturnValue(
      createSupabaseMock([
        { table: 'shift_requests', result: { data: pendingShift() } },
        { table: 'shift_requests', result: { error: { message: 'boom' } } },
      ]),
    );

    const res = await decideIncentive({ shiftId: 'shift-1', action: 'approve', adminId: 'adm' });

    expect(res).toEqual({ ok: false, reason: 'db_error' });
    expect(mocks.broadcastShift).not.toHaveBeenCalled();
  });
});
