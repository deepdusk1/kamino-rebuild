-- Local account deletion closes webhook reconciliation without deleting another recipient's completed gift.
alter table billing_orders add column if not exists privacy_closed boolean not null default false;
