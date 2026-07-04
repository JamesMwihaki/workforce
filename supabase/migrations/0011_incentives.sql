-- Incentives program: a manager can offer extra pay per hour (covered by the
-- owner) on a shift request. Incentivised requests need admin approval before
-- they're broadcast; approved ones feed a payout ledger (owed = bonus rate ×
-- shift hours per confirmed worker), settled per claim via incentive_paid_at.

alter table public.shift_requests
  add column if not exists incentive_amount numeric(4,2) not null default 0
    check (incentive_amount >= 0 and incentive_amount <= 20),
  add column if not exists incentive_status text not null default 'none'
    check (incentive_status in ('none','pending','approved','declined')),
  add column if not exists incentive_decided_by uuid references public.managers(id) on delete set null,
  add column if not exists incentive_decided_at timestamptz;

create index if not exists shift_requests_incentive_pending_idx
  on public.shift_requests(incentive_status)
  where incentive_status = 'pending';

alter table public.shift_claims
  add column if not exists incentive_paid_at timestamptz;
