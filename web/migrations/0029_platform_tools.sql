-- Discovery, creator operations and scheduled notifications. No payment entitlement is seeded.
create table if not exists discovery_feedback (
 user_id text not null, target_type text not null, target_id text not null,
 preference text not null check (preference in ('more','less','hide')), updated_at timestamptz not null default now(),
 primary key(user_id,target_type,target_id)
);
create table if not exists community_visits (
 user_id text not null, community_id text not null, visited_at timestamptz not null default now(),
 primary key(user_id,community_id)
);
alter table communities add column if not exists local_area text not null default '';
create table if not exists editorial_collections (
 id serial primary key, title text not null, description text not null default '', community_ids text not null default '[]',
 published boolean not null default false, position int not null default 0, updated_at timestamptz not null default now()
);
create table if not exists platform_flags (
 key text primary key, description text not null default '', enabled boolean not null default false,
 rollout_percent int not null default 100 check(rollout_percent between 0 and 100), updated_at timestamptz not null default now()
);
create table if not exists platform_audit (
 id serial primary key, actor_id text not null, action text not null, detail text not null, created_at timestamptz not null default now()
);
create table if not exists support_tickets (
 id serial primary key, user_id text not null, subject text not null, body text not null,
 status text not null default 'open' check(status in ('open','in_progress','resolved')), response text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists creator_offers (
 id serial primary key, owner_id text not null, kind text not null check(kind in ('membership','tip','gift','ticket','marketplace','boost','premium','advertisement')),
 community_id text, title text not null, description text not null default '', price_minor int not null check(price_minor between 50 and 1000000),
 currency text not null default 'usd', published boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists notification_deliveries (
 user_id text not null, delivery_key text not null, status text not null default 'pending',
 claimed_at timestamptz, delivered_at timestamptz, primary key(user_id,delivery_key)
);
create index if not exists notification_pending_idx on notification_deliveries(status,claimed_at);
create table if not exists notification_campaigns (
 id serial primary key, actor_id text not null, title text not null, body text not null, href text not null,
 published_at timestamptz not null default now()
);
create table if not exists post_view_events (
 post_id int not null, viewer_key text not null, viewed_on date not null default current_date,
 primary key(post_id,viewer_key,viewed_on)
);
alter table notifications add column if not exists delivery_key text;
create unique index if not exists notifications_delivery_key_idx on notifications(user_id,delivery_key) where delivery_key is not null;
