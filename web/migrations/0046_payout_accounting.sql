-- Payout accounting fixes: earnings can be reserved while a transfer is in flight, reversed on
-- refunds/disputes, and released only after a hold period. Financial records survive account
-- deletion instead of cascading away, and room recordings keep working when their starter is
-- deleted (started_by becomes nullable).

-- The plain unique(order_id) becomes a partial one: the original credit rows stay unique per
-- order, while negative adjustment rows (refund offsets) may share the order id.
alter table creator_earnings drop constraint if exists creator_earnings_order_id_key;
create unique index if not exists creator_earnings_order_credit_idx
  on creator_earnings(order_id) where net_minor >= 0;

-- Earnings gain reserved/reversed states, a hold-period release time, and the order linkage used
-- for reversals. Adjustments (negative rows that offset already-paid earnings after a refund or
-- chargeback) are stored as state 'available' with a signed net, so the constraint must allow it.
alter table creator_earnings drop constraint if exists creator_earnings_state_check;
alter table creator_earnings add constraint creator_earnings_state_check
  check(state in ('available','reserved','paid','reversed'));
alter table creator_earnings add column if not exists released_at timestamptz not null default now();
alter table creator_earnings add column if not exists payout_id bigint references creator_payouts(id) on delete set null;
alter table creator_earnings drop constraint if exists creator_earnings_net_check;
alter table creator_earnings drop constraint if exists creator_earnings_net_minor_check;
alter table creator_earnings add constraint creator_earnings_net_check check(net_minor > -1000000000);
create index if not exists creator_earnings_release_idx on creator_earnings(state, released_at);

alter table creator_payouts drop constraint if exists creator_payouts_state_check;
alter table creator_payouts add constraint creator_payouts_state_check
  check(state in ('reserved','processing','paid','failed','reversed'));

-- Financial records must survive the account: creator_id becomes nullable and the foreign keys
-- stop cascading, mirroring how billing_orders retains pseudonymised accounting rows.
alter table creator_earnings alter column creator_id drop not null;
alter table creator_earnings drop constraint if exists creator_earnings_creator_id_fkey;
alter table creator_earnings add constraint creator_earnings_creator_id_fkey
  foreign key (creator_id) references "user"(id) on delete set null;

alter table creator_payouts alter column creator_id drop not null;
alter table creator_payouts drop constraint if exists creator_payouts_creator_id_fkey;
alter table creator_payouts add constraint creator_payouts_creator_id_fkey
  foreign key (creator_id) references "user"(id) on delete set null;

-- creator_payout_accounts keeps its cascade: it is only a provider link, not a financial record.

-- Deleting someone who started a recording must not fail: the column is nullable and the foreign
-- key already sets it null.
alter table room_recordings alter column started_by drop not null;

-- Earnings credited for orders that were later refunded or disputed (already-paid rows) are
-- offset by a negative adjustment row, so the available balance can go negative until recovered.
-- Net sign constraint above allows that; payouts refuse while the balance is not positive.
