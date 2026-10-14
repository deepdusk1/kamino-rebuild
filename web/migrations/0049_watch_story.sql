-- Watch-party viewer kicks + AI story room state (story checkpoints, branch votes).
-- Backs the mobile RPCs: kickWatchPartyViewer, rewindAiStoryCheckpoint, voteAiStoryBranch.
-- Playback sync itself (syncWatchPartyPlayback) is ephemeral: the host's state is fanned
-- out over the in-process SSE event bus (see events.server.ts), same as chat/typing events.

-- Viewers removed from a watch party by the host. The client applies the kick
-- optimistically; this table makes it durable and auditable.
create table if not exists watch_kicked_viewers (
  room_id int not null references chat_rooms(id) on delete cascade,
  user_id text not null,
  kicked_by text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists watch_kicked_viewers_user_idx on watch_kicked_viewers (user_id);

-- AI story rooms: which checkpoint each scene is currently rewound to.
-- Checkpoints themselves are authored on the client; the server records the
-- canonical "current" pointer so peers and future sessions can converge.
create table if not exists story_scenes (
  community_slug text not null,
  scene_id int not null,
  current_checkpoint_id text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (community_slug, scene_id)
);

-- AI story branch votes: one row per (scene, option, voter); toggling deletes the row.
create table if not exists story_votes (
  community_slug text not null,
  scene_id int not null,
  option_id text not null,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (community_slug, scene_id, option_id, user_id)
);
create index if not exists story_votes_scene_idx on story_votes (community_slug, scene_id);
