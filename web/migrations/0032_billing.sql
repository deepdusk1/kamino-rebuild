-- Payment setup is disabled by default. No order or entitlement is seeded.
create table if not exists billing_orders (
 id text primary key, buyer_id text not null, beneficiary_id text not null,
 offer_id int not null references creator_offers(id), seller_id text not null,
 kind text not null, title text not null, price_minor int not null, currency text not null,
 checkout_mode text not null check(checkout_mode in ('payment','subscription')),
 status text not null default 'pending', test_mode boolean not null default true check(test_mode=true),
 stripe_session_id text unique, stripe_customer_id text, stripe_subscription_id text unique, stripe_payment_intent_id text unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists billing_orders_buyer_idx on billing_orders(buyer_id,created_at desc);
create unique index if not exists billing_orders_pending_idx on billing_orders(buyer_id,beneficiary_id,offer_id) where status='pending';
create table if not exists billing_entitlements (
 order_id text primary key references billing_orders(id), beneficiary_id text not null,
 offer_id int not null references creator_offers(id), state text not null check(state in ('active','revoked')),
 expires_at timestamptz, test_mode boolean not null default true check(test_mode=true),
 updated_at timestamptz not null default now()
);
create index if not exists billing_entitlements_access_idx on billing_entitlements(beneficiary_id,offer_id,state,expires_at);
create table if not exists billing_resource_requirements (
 resource_kind text not null check(resource_kind in ('community','post','chat','event')),
 resource_id text not null, offer_id int not null references creator_offers(id),
 owner_id text not null, community_id text, created_at timestamptz not null default now(),
 primary key(resource_kind,resource_id)
);
create table if not exists billing_webhook_events (
 event_id text primary key, event_type text not null, payload_hash text not null,
 status text not null check(status in ('processing','processed','failed')),
 claim_token text not null, started_at timestamptz not null default now(), processed_at timestamptz,
 error_code text not null default ''
);
