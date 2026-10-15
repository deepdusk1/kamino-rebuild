-- KAMINO token tipping (Oct 2026). Non-custodial: Kamino stores public wallet addresses and tip records only.
-- Private keys never reach Kamino; people approve every transfer in their own Solana wallet.

-- One verified receiving wallet per person (proven by approving a memo transaction from it).
create table if not exists kamino_wallets (
  user_id text primary key references "user"(id) on delete cascade,
  address text not null unique,
  verified_at timestamptz not null default now()
);

-- A wallet link in progress: the code goes into the memo the wallet signs.
create table if not exists kamino_wallet_links (
  code text primary key,
  user_id text not null references "user"(id) on delete cascade,
  address text,
  status text not null default 'pending' check (status in ('pending', 'linked', 'expired', 'failed')),
  failure text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create index if not exists kamino_wallet_links_user on kamino_wallet_links (user_id, created_at desc);

-- Tips. `reference` is the Solana Pay reference key that finds the transaction on chain; amounts are in base
-- units (KAMINO has 6 decimals). A tip only counts once its transaction is found and checked (`confirmed`).
create table if not exists kamino_tips (
  id bigserial primary key,
  reference text not null unique,
  sender_user_id text not null references "user"(id) on delete cascade,
  recipient_user_id text not null references "user"(id) on delete cascade,
  recipient_address text not null,
  amount_base numeric(30, 0) not null check (amount_base > 0),
  target_type text not null check (target_type in ('profile', 'post')),
  target_id text not null default '',
  sender_address text,
  signature text unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed', 'expired')),
  failure text not null default '',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create index if not exists kamino_tips_recipient on kamino_tips (recipient_user_id, created_at desc);
create index if not exists kamino_tips_sender on kamino_tips (sender_user_id, created_at desc);
create index if not exists kamino_tips_pending on kamino_tips (created_at) where status = 'pending';
