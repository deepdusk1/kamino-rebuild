-- Profile cover, global follows, leader titles, wall
alter table profiles add column if not exists cover text not null default '';

create table if not exists profile_follows (
  follower_id text not null,
  followee_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
create index if not exists profile_follows_followee_idx on profile_follows (followee_id);

create table if not exists title_defs (
  id serial primary key,
  community_id text not null,
  label text not null,
  color text not null default '#8b6cff',
  featured boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists title_defs_community_idx on title_defs (community_id);

create table if not exists member_titles (
  id serial primary key,
  user_id text not null,
  title_id int not null,
  community_id text not null,
  granted_by text not null,
  pinned boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, title_id)
);
create index if not exists member_titles_user_idx on member_titles (user_id);

create table if not exists wall_posts (
  id serial primary key,
  profile_user_id text not null,
  author_user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists wall_posts_profile_idx on wall_posts (profile_user_id, id desc);
