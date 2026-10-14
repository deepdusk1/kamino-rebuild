-- Production money & infrastructure: explicit live billing mode, creator earnings and payouts,
-- independent age verification, media background jobs (transcription/transcoding), live-room
-- recordings, and client-side message de-duplication for the offline queue.
--
-- Every feature that reads these tables stays dormant until its provider is configured
-- (see BILLING.md, IDENTITY_SECURITY.md and the media job config in jobs.server.ts).

-- Billing rows may now record whether they were created in test or live mode.
alter table billing_orders drop constraint if exists billing_orders_test_mode_check;
alter table billing_orders alter column test_mode drop default;
alter table billing_orders alter column test_mode set default true;
alter table billing_orders add constraint billing_orders_test_mode_check check (test_mode in (true, false));

alter table billing_entitlements drop constraint if exists billing_entitlements_test_mode_check;
alter table billing_entitlements alter column test_mode drop default;
alter table billing_entitlements alter column test_mode set default true;
alter table billing_entitlements add constraint billing_entitlements_test_mode_check check (test_mode in (true, false));

-- Creator earnings: one row per completed order, credited from the webhook handler.
create table if not exists creator_earnings (
  id bigserial primary key,
  creator_id text not null references "user"(id) on delete cascade,
  order_id text not null unique references billing_orders(id) on delete cascade,
  gross_minor int not null check(gross_minor >= 0),
  fee_minor int not null check(fee_minor >= 0),
  net_minor int not null check(net_minor >= 0),
  currency text not null,
  state text not null default 'available' check(state in ('available','paid')),
  created_at timestamptz not null default now()
);
create index if not exists creator_earnings_creator_idx on creator_earnings(creator_id, created_at desc);

-- One connected account per creator (Stripe Connect Express).
create table if not exists creator_payout_accounts (
  user_id text primary key references "user"(id) on delete cascade,
  stripe_account_id text not null,
  live_mode boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists creator_payouts (
  id bigserial primary key,
  creator_id text not null references "user"(id) on delete cascade,
  amount_minor int not null check(amount_minor > 0),
  currency text not null,
  state text not null default 'processing' check(state in ('processing','paid','failed')),
  stripe_account_id text not null default '',
  stripe_transfer_id text not null default '',
  error text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists creator_payouts_creator_idx on creator_payouts(creator_id, created_at desc);

-- Independent age verification (Stripe Identity; document check). The verified stamp also
-- lands on profiles so any surface can honour it.
alter table profiles add column if not exists age_verified_at timestamptz;

-- Independent age verification (Stripe Identity; document check).
create table if not exists age_verifications (
  id bigserial primary key,
  user_id text not null unique references "user"(id) on delete cascade,
  provider text not null default 'stripe_identity',
  session_id text not null default '',
  status text not null default 'pending' check(status in ('pending','verified','failed')),
  verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Background media jobs (transcription, transcoding), one per media item and kind.
create table if not exists media_jobs (
  id bigserial primary key,
  media_id integer not null references content_media(id) on delete cascade,
  kind text not null check(kind in ('transcribe','transcode')),
  state text not null default 'pending' check(state in ('pending','processing','done','failed','skipped')),
  attempts int not null default 0 check(attempts >= 0),
  error text not null default '',
  result text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(media_id, kind)
);
create index if not exists media_jobs_state_idx on media_jobs(state, updated_at);

-- Live-room recordings (LiveKit room-composite egress; file lands in object storage).
create table if not exists room_recordings (
  id bigserial primary key,
  room_id int not null references chat_rooms(id) on delete cascade,
  started_by text not null references "user"(id) on delete set null,
  egress_id text not null default '',
  storage_ref text not null default '',
  state text not null default 'recording' check(state in ('recording','ready','failed')),
  created_at timestamptz not null default now(), ended_at timestamptz
);
create index if not exists room_recordings_room_idx on room_recordings(room_id, created_at desc);

-- Client-generated de-duplication tag so the phone app's offline queue can replay safely.
alter table messages add column if not exists client_tag text;
create unique index if not exists messages_client_tag_idx on messages(client_tag) where client_tag is not null;
