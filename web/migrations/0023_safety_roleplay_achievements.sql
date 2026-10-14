-- Release 7: automatic safety checks, AI role-play stories, profile wall covers and achievements.

-- Safety review queue. One row per item the checks held or flagged. Moderators (and the site owner for serious
-- cases) restore it, take it down, or dismiss the flag. Nothing here bans or strikes anyone.
create table if not exists safety_flags (
  id serial primary key,
  community_id text,
  target_type text not null,
  target_id text not null,
  author_user_id text not null,
  action text not null,
  reasons text not null default '[]',
  severe boolean not null default false,
  minors boolean not null default false,
  excerpt text not null default '',
  href text not null default '',
  status text not null default 'open',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists safety_flags_community_idx on safety_flags (community_id, status, id desc);
create index if not exists safety_flags_target_idx on safety_flags (target_type, target_id);

-- Held items stay in the database (a moderator may restore them) but nobody else sees them.
alter table comments add column if not exists held boolean not null default false;
alter table messages add column if not exists held boolean not null default false;
alter table wall_posts add column if not exists held boolean not null default false;

-- How many AI storyteller replies were used each day (the free tier has a daily cap).
create table if not exists ai_usage (
  day date primary key,
  calls int not null default 0
);

-- Role-play stories: a scene with a premise and characters, members playing characters, and the AI narrating.
create table if not exists roleplay_scenes (
  id serial primary key,
  community_id text not null,
  creator_id text not null,
  title text not null,
  source text not null default '',
  premise text not null default '',
  characters text not null default '[]',
  status text not null default 'open',
  held boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists roleplay_scenes_community_idx on roleplay_scenes (community_id, updated_at desc);

create table if not exists roleplay_cast (
  scene_id int not null,
  user_id text not null,
  character_name text not null,
  joined_at timestamptz not null default now(),
  primary key (scene_id, user_id)
);

create table if not exists roleplay_turns (
  id serial primary key,
  scene_id int not null,
  author_user_id text,
  character_name text not null default '',
  kind text not null default 'turn',
  body text not null,
  held boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists roleplay_turns_scene_idx on roleplay_turns (scene_id, id);

-- Existing communities get the new "Stories" tab (communities that picked their tabs keep their order, with Stories last).
update communities set modules = replace(modules, ']', ',"roleplay"]')
where modules like '[%]' and modules <> '[]' and modules not like '%roleplay%';
alter table communities alter column modules set default '["chats","wiki","files","events","rank","members","roleplay"]';

-- Your own wall cover picture (like profile photos: kept in its own table so profile queries stay small).
create table if not exists profile_covers (
  user_id text primary key,
  data_url text not null,
  updated_at timestamptz not null default now()
);

-- Achievements unlock once and are remembered (so the "unlocked" note is sent only once).
create table if not exists user_achievements (
  user_id text not null,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
-- Up to three achievements a person shows as banners at the top of their profile (JSON list of ids).
alter table profiles add column if not exists showcase text not null default '[]';
