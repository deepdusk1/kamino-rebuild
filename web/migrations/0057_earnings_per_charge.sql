-- Creator earnings (Module 12): one credit per charge instead of one per order, so each monthly
-- renewal of a subscription pays the creator. Existing credits take the order's current payment,
-- which keeps the reconciliation pass from crediting an already-credited charge twice.
alter table creator_earnings add column if not exists payment_ref text not null default '';
update creator_earnings ce set payment_ref = coalesce(o.stripe_payment_intent_id, '')
  from billing_orders o
  where o.id = ce.order_id and ce.payment_ref = '';
drop index if exists creator_earnings_order_credit_idx;
create unique index if not exists creator_earnings_payment_credit_idx
  on creator_earnings(order_id, payment_ref) where net_minor >= 0;
