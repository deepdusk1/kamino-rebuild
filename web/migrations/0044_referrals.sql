-- Referral program: a personal invite code per member, and a record of who was referred by whom.
-- Rewards: the referrer earns +150 reputation per join, the invited member +50 — once per member,
-- never for your own code, and reputation can never be bought, only earned.

create table if not exists referral_codes (
  code varchar(12) primary key,
  user_id text not null unique references "user"(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  id bigserial primary key,
  referrer_id text not null references "user"(id) on delete cascade,
  invited_user_id text not null unique references "user"(id) on delete cascade,
  code varchar(12) not null,
  created_at timestamptz not null default now(),
  check(referrer_id <> invited_user_id)
);

create index if not exists referrals_referrer_idx on referrals(referrer_id, created_at);
