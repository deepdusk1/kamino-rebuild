-- Provider-backed phone login and protected native OAuth handoffs.
alter table "user" add column if not exists "phoneNumber" text;
alter table "user" add column if not exists "phoneNumberVerified" boolean not null default false;
create unique index if not exists identity_phone_unique on "user"("phoneNumber");
create table if not exists identity_oauth_flows (
  id text primary key, verifier_hash text not null, provider text not null,
  session_id text, expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz
);
