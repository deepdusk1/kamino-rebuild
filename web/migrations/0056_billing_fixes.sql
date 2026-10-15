-- Billing fixes (Module 12).

-- 1. Orders were always saved with the sandbox default (test_mode=true), even when the server ran in
--    live mode. Every live order has a live checkout session (cs_live_...) or a live entitlement,
--    so repair those rows. Access rules now require the purchase to match the server's mode.
update billing_orders set test_mode = false
  where test_mode = true and stripe_session_id like 'cs\_live\_%';
update billing_orders o set test_mode = false
  from billing_entitlements e
  where e.order_id = o.id and e.test_mode = false and o.test_mode = true;

-- 2. Whether a subscription will bill again (null = not a subscription / not known yet).
--    false means the member cancelled and keeps access until the paid period ends.
alter table billing_orders add column if not exists renews boolean;

-- 3. "My purchases" and the mode-aware premium check look orders up by buyer and beneficiary.
create index if not exists billing_orders_buyer_idx on billing_orders(buyer_id, created_at desc);
create index if not exists billing_entitlements_beneficiary_idx on billing_entitlements(beneficiary_id, state);

