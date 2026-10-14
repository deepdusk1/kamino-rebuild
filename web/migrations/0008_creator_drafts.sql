create table if not exists creator_drafts (
  id text primary key,
  user_id text not null,
  community_id text not null,
  content text not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists creator_drafts_owner_idx on creator_drafts(user_id, community_id, updated_at desc);
