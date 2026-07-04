-- Admins get an SMS when a manager submits an incentive request; log those
-- sends under their own kind so they don't count as worker alerts.
alter table public.sms_log drop constraint if exists sms_log_kind_check;
alter table public.sms_log
  add constraint sms_log_kind_check
  check (kind in ('shift_alert','shift_cancelled','claim_cancelled','incentive_approval'));
