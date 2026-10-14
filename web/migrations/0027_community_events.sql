-- Community spaces, earned rewards, event management and authoritative live-room roles.
alter table communities add column if not exists join_policy text not null default 'open';
alter table communities add column if not exists post_policy text not null default 'members';
alter table communities add column if not exists live_policy text not null default 'members';
alter table communities add column if not exists event_policy text not null default 'moderators';
alter table communities add column if not exists keyword_filters text not null default '[]';
alter table communities add column if not exists member_limit int check(member_limit is null or member_limit between 10 and 50);
alter table communities add column if not exists verification_requested_at timestamptz;
create table if not exists verification_requests (
  id bigserial primary key, target_type text not null, target_id text not null, requested_by text not null,
  reason text not null, status text not null default 'pending', decided_by text,
  decision_note text not null default '', created_at timestamptz not null default now(), decided_at timestamptz
);
create unique index if not exists verification_requests_pending_idx on verification_requests(target_type,target_id) where status='pending';

create table if not exists community_role_definitions (
  id bigserial primary key, community_id text not null references communities(id) on delete cascade,
  label text not null, color text not null default '#8b5cf6', permissions text not null default '[]',
  created_at timestamptz not null default now(), unique(community_id, label)
);
create table if not exists community_role_assignments (
  community_id text not null references communities(id) on delete cascade,
  user_id text not null, role_id bigint not null references community_role_definitions(id) on delete cascade,
  granted_by text not null, created_at timestamptz not null default now(), primary key(community_id,user_id,role_id)
);
create table if not exists community_faqs (
  id bigserial primary key, community_id text not null references communities(id) on delete cascade,
  question text not null, answer text not null, sort_order int not null default 0,
  updated_by text not null, updated_at timestamptz not null default now()
);
create table if not exists community_boards (
  id bigserial primary key, community_id text not null references communities(id) on delete cascade,
  name text not null, description text not null default '', created_by text not null,
  created_at timestamptz not null default now(), unique(community_id,name)
);
create table if not exists community_board_threads (
  board_id bigint not null references community_boards(id) on delete cascade,
  post_id bigint not null references posts(id) on delete cascade, primary key(board_id,post_id)
);
create table if not exists community_quests (
  id bigserial primary key, community_id text not null references communities(id) on delete cascade,
  title text not null, description text not null default '', kind text not null default 'quest',
  metric text not null check(metric in ('posts','comments','likes_received','checkins')),
  target int not null check(target between 1 and 1000), badge text not null default '',
  reward_cosmetic text not null default '', starts_at timestamptz not null default now(), ends_at timestamptz,
  created_by text not null, created_at timestamptz not null default now()
);
create table if not exists community_quest_claims (
  quest_id bigint not null references community_quests(id) on delete cascade, user_id text not null,
  progress int not null, claimed_at timestamptz not null default now(), primary key(quest_id,user_id)
);
create table if not exists community_badge_grants (
  id bigserial primary key, community_id text not null references communities(id) on delete cascade,
  user_id text not null, badge text not null, note text not null default '', granted_by text not null,
  created_at timestamptz not null default now(), unique(community_id,user_id,badge)
);
create table if not exists earned_cosmetics (
  user_id text not null, cosmetic text not null, source text not null,
  earned_at timestamptz not null default now(), primary key(user_id,cosmetic)
);
create table if not exists community_checkin_days (
  user_id text not null, community_id text not null, day date not null default current_date,
  primary key(user_id,community_id,day)
);

alter table events add column if not exists image_url text not null default '';
alter table events add column if not exists venue_kind text not null default 'online';
alter table events add column if not exists online_url text not null default '';
alter table events add column if not exists location text not null default '';
alter table events add column if not exists status text not null default 'scheduled';
alter table events add column if not exists recurrence text not null default 'none';
alter table events add column if not exists series_id text;
alter table events add column if not exists chat_room_id int references chat_rooms(id) on delete set null;
alter table events add column if not exists live_room_id int references chat_rooms(id) on delete set null;
alter table events add column if not exists updated_at timestamptz not null default now();
alter table event_rsvps add column if not exists response text not null default 'going';
create index if not exists community_quests_window_idx on community_quests(community_id,starts_at,ends_at);

alter table chat_rooms add column if not exists stage_enabled boolean not null default false;
alter table chat_rooms add column if not exists locked boolean not null default false;
alter table chat_rooms add column if not exists scheduled_at timestamptz;
alter table chat_members add column if not exists stage_role text not null default 'listener';
alter table chat_members add column if not exists hand_raised boolean not null default false;
alter table chat_members add column if not exists host_muted boolean not null default false;
alter table chat_members add column if not exists room_removed boolean not null default false;
create table if not exists live_room_reactions (
  id bigserial primary key, room_id int not null references chat_rooms(id) on delete cascade,
  user_id text not null, emoji text not null, created_at timestamptz not null default now()
);
