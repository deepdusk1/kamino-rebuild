-- Bot API tokens: long-lived bearer tokens that let a bot account read and post
-- messages through the Kamino API without a user session.
create table if not exists bot_tokens (
  id serial primary key,
  user_id text not null references "user"(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists bot_tokens_user_id_idx on bot_tokens (user_id);
create index if not exists bot_tokens_hash_idx on bot_tokens (token_hash) where revoked_at is null;
