-- Identity eligibility is computed by the server from a one-time birthday check.
-- Legacy adult toggles are deliberately not trusted. Birthday itself is never stored.
alter table profiles add column if not exists age_eligible_at_16 date;
alter table profiles add column if not exists age_eligible_at_18 date;
alter table profiles add column if not exists age_checked_at timestamptz;
alter table profiles add column if not exists language text not null default 'en';
alter table profiles add column if not exists social_links text not null default '[]';
alter table profiles add column if not exists profile_hue int not null default 250;
alter table profiles add column if not exists mention_privacy text not null default 'everyone';
alter table profiles add column if not exists invite_privacy text not null default 'everyone';
alter table profiles add column if not exists search_visible boolean not null default true;
alter table profiles add column if not exists hide_followers boolean not null default false;
alter table profiles add column if not exists hide_following boolean not null default false;
alter table profiles add column if not exists restricted_mode boolean not null default false;
alter table profiles add column if not exists sensitive_content text not null default 'blur';
alter table profiles add column if not exists high_contrast boolean not null default false;
alter table profiles add column if not exists text_scale text not null default 'standard';
alter table profiles add column if not exists tutorial_completed_at timestamptz;
create table if not exists identity_relationships (
  user_id text not null, target_user_id text not null, kind text not null,
  created_at timestamptz not null default now(),
  primary key(user_id, target_user_id, kind),
  check(kind in ('restrict','close_friend','favorite'))
);
create table if not exists identity_account_status (
  user_id text primary key, status text not null default 'active', reason text not null default '',
  until timestamptz, actor_id text not null, updated_at timestamptz not null default now(),
  check(status in ('active','suspended','banned'))
);
create table if not exists identity_admin_grants (
  user_id text primary key, granted_by text not null, created_at timestamptz not null default now()
);
create table if not exists identity_audit (
  id serial primary key, actor_id text not null, target_user_id text not null,
  action text not null, detail text not null default '', created_at timestamptz not null default now()
);
alter table "user" add column if not exists "twoFactorEnabled" boolean not null default false;
create table if not exists "twoFactor" (
  id text primary key, secret text not null, "backupCodes" text not null,
  "userId" text not null references "user"(id) on delete cascade,
  verified boolean not null default true, "failedVerificationCount" int not null default 0,
  "lockedUntil" timestamptz
);
create index if not exists identity_two_factor_user on "twoFactor"("userId");
create index if not exists identity_relationship_target on identity_relationships(target_user_id, kind);
create index if not exists identity_account_status_active on identity_account_status(status, until);
