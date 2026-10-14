-- Kamino community platform
create table if not exists app_meta (
  key text primary key,
  value text not null
);

create table if not exists profiles (
  user_id text primary key,
  handle text not null unique,
  display_name text not null,
  bio text not null default '',
  avatar_hue int not null default 220,
  age_confirmed boolean not null default false,
  dm_privacy text not null default 'members',
  hide_joined boolean not null default false,
  show_online boolean not null default true,
  rep int not null default 0,
  streak int not null default 0,
  last_checkin_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists communities (
  id text primary key,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  category text not null,
  cover text not null default '',
  hue int not null default 220,
  visibility text not null default 'public',
  age_gate int not null default 13,
  content_warnings text not null default '[]',
  rules text not null default '',
  created_by text not null,
  member_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  user_id text not null,
  community_id text not null,
  role text not null default 'member',
  status text not null default 'active',
  nickname text not null,
  persona_bio text not null default '',
  persona_hue int not null default 220,
  rep int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (user_id, community_id)
);
create index if not exists memberships_community_idx on memberships (community_id);
create index if not exists memberships_user_idx on memberships (user_id);

create table if not exists posts (
  id serial primary key,
  community_id text not null,
  author_user_id text not null,
  type text not null,
  title text not null,
  body text not null default '',
  cover text not null default '',
  payload text not null default '{}',
  featured boolean not null default false,
  content_warning text not null default '',
  like_count int not null default 0,
  comment_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists posts_community_idx on posts (community_id, created_at desc);

create table if not exists comments (
  id serial primary key,
  post_id int not null,
  author_user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on comments (post_id);

create table if not exists likes (
  user_id text not null,
  post_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists poll_votes (
  user_id text not null,
  post_id int not null,
  option_index int not null,
  primary key (user_id, post_id)
);

create table if not exists quiz_attempts (
  user_id text not null,
  post_id int not null,
  score int not null,
  total int not null,
  time_ms int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists chat_rooms (
  id serial primary key,
  community_id text,
  name text not null,
  kind text not null default 'public',
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_rooms_community_idx on chat_rooms (community_id);

create table if not exists chat_members (
  room_id int not null,
  user_id text not null,
  last_read_at timestamptz,
  in_voice boolean not null default false,
  primary key (room_id, user_id)
);

create table if not exists messages (
  id serial primary key,
  room_id int not null,
  author_user_id text not null,
  body text not null,
  reply_to int,
  created_at timestamptz not null default now()
);
create index if not exists messages_room_idx on messages (room_id, id);

create table if not exists follows (
  follower_id text not null,
  followee_id text not null,
  community_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id, community_id)
);

create table if not exists blocks (
  blocker_id text not null,
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists reports (
  id serial primary key,
  reporter_id text not null,
  community_id text,
  target_type text not null,
  target_id text not null,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create index if not exists reports_community_idx on reports (community_id, status);

create table if not exists notifications (
  id serial primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  body text not null default '',
  href text not null default '/',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists audit_log (
  id serial primary key,
  community_id text not null,
  actor_id text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
