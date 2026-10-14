create table if not exists coin_wallets (
  user_id text primary key references profiles(user_id) on delete cascade,
  balance integer not null default 0 check (balance >= 0)
);

create table if not exists coin_ledger (
  id serial primary key,
  from_user_id text references profiles(user_id) on delete set null,
  to_user_id text not null references profiles(user_id) on delete cascade,
  kind text not null check (kind in ('checkin', 'tip')),
  amount integer not null check (amount > 0),
  reward_day date,
  created_at timestamptz not null default now(),
  unique (to_user_id, kind, reward_day)
);
create index if not exists coin_ledger_from_idx on coin_ledger (from_user_id, id desc);
create index if not exists coin_ledger_to_idx on coin_ledger (to_user_id, id desc);
