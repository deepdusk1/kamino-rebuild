-- Remaining Amino-parity: profile mood/frames, post tools, chat edit, wall likes,
-- favorites, join questions, invites, strikes, events, broadcasts.

alter table profiles add column if not exists mood text not null default '';
alter table profiles add column if not exists status text not null default '';
alter table profiles add column if not exists frame text not null default 'ring';
alter table profiles add column if not exists last_seen_at timestamptz;
alter table profiles add column if not exists bubble_hue int not null default 270;
alter table profiles add column if not exists notify_likes boolean not null default true;
alter table profiles add column if not exists notify_comments boolean not null default true;
alter table profiles add column if not exists notify_follows boolean not null default true;
alter table profiles add column if not exists notify_chat boolean not null default true;
alter table profiles add column if not exists notify_wall boolean not null default true;

alter table posts add column if not exists comments_disabled boolean not null default false;
alter table posts add column if not exists pinned boolean not null default false;
alter table posts add column if not exists hidden boolean not null default false;
alter table posts add column if not exists announcement boolean not null default false;
alter table posts add column if not exists edited_at timestamptz;
alter table posts add column if not exists hashtags text not null default '[]';
alter table posts add column if not exists original_post_id int;

alter table messages add column if not exists edited_at timestamptz;
alter table messages add column if not exists deleted boolean not null default false;

create table if not exists wall_likes (
  user_id text not null,
  wall_post_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, wall_post_id)
);

create table if not exists favorites (
  user_id text not null,
  post_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists favorites_user_idx on favorites (user_id, created_at desc);

create table if not exists join_questions (
  id serial primary key,
  community_id text not null,
  prompt text not null,
  sort_order int not null default 0
);
create index if not exists join_questions_community_idx on join_questions (community_id, sort_order);

create table if not exists join_answers (
  user_id text not null,
  community_id text not null,
  answers text not null default '[]',
  created_at timestamptz not null default now(),
  primary key (user_id, community_id)
);

create table if not exists invite_codes (
  code text primary key,
  community_id text not null,
  created_by text not null,
  max_uses int not null default 0,
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invite_codes_community_idx on invite_codes (community_id);

create table if not exists strikes (
  id serial primary key,
  community_id text not null,
  user_id text not null,
  issued_by text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists strikes_community_idx on strikes (community_id, user_id);

create table if not exists events (
  id serial primary key,
  community_id text not null,
  title text not null,
  body text not null default '',
  kind text not null default 'event',
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists events_community_idx on events (community_id, starts_at);

create table if not exists event_rsvps (
  event_id int not null,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists broadcasts (
  id serial primary key,
  community_id text not null,
  author_user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists broadcasts_community_idx on broadcasts (community_id, id desc);
