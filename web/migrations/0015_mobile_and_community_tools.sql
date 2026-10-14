-- Native app support and the remaining community tools.

-- Push notification devices (Expo push tokens), one row per installed app.
create table if not exists push_tokens (
  token text primary key,
  user_id text not null,
  platform text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on push_tokens (user_id);

-- Timed mutes: a softer step than a strike or ban.
create table if not exists member_mutes (
  id bigserial primary key,
  community_id text not null,
  user_id text not null,
  issued_by text not null,
  reason text not null default '',
  until timestamptz not null,
  cleared boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists member_mutes_lookup_idx on member_mutes (community_id, user_id, until desc);

-- Appeals against a strike, mute or removal. Leaders decide; nothing is automatic.
create table if not exists appeals (
  id bigserial primary key,
  community_id text not null,
  user_id text not null,
  kind text not null check (kind in ('strike', 'mute', 'ban')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'upheld', 'overturned')),
  decided_by text,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists appeals_community_idx on appeals (community_id, status, id desc);

-- Wiki: leader-managed category list (a path such as "Characters/Heroes" nests).
create table if not exists wiki_categories (
  community_id text not null,
  path text not null,
  primary key (community_id, path)
);

-- Wiki: edits proposed by people other than the author, and contributor credit.
create table if not exists wiki_proposals (
  id bigserial primary key,
  post_id bigint not null references posts(id) on delete cascade,
  proposer_user_id text not null,
  title text not null,
  body text not null,
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists wiki_proposals_post_idx on wiki_proposals (post_id, status, id desc);

create table if not exists wiki_contributors (
  post_id bigint not null references posts(id) on delete cascade,
  user_id text not null,
  accepted_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- External feeds (RSS/Atom) that a leader can attach to a community.
create table if not exists community_feeds (
  id bigserial primary key,
  community_id text not null,
  url text not null,
  title text not null default '',
  added_by text not null,
  created_at timestamptz not null default now(),
  unique (community_id, url)
);
