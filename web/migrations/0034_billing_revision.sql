-- Forward upgrade for local v9 databases initialized before checkout hardening.
alter table billing_orders add column if not exists billing_revision integer not null default 0;
alter table profiles add column if not exists show_supporter_badges boolean not null default false;
create unique index if not exists billing_orders_pending_idx
  on billing_orders(buyer_id,beneficiary_id,offer_id) where status='pending';
