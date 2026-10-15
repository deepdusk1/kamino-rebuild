-- AI story branch voting and checkpoint rewinds, tied to real role-play stories (roleplay_scenes / roleplay_turns).
-- Replaces the 0049 story tables, which were keyed to client-made scene and option ids and held no real stories.

-- Rewinding a story hides every turn after the chosen checkpoint. The turns are kept (for moderation and so a
-- rewind can be undone by hand) but are left out wherever the story is read.
alter table roleplay_turns add column if not exists rewound_at timestamptz;

-- The storyteller's "what happens next" options. A round is the latest visible turn when the options were made;
-- a new turn (or a rewind) starts a new round.
create table if not exists story_branch_options (
  id serial primary key,
  scene_id int not null references roleplay_scenes(id) on delete cascade,
  after_turn_id int not null,
  label text not null,
  created_at timestamptz not null default now()
);
create index if not exists story_branch_options_round_idx on story_branch_options (scene_id, after_turn_id);

-- One vote per member per round. Changing your vote moves this row to another option.
create table if not exists story_branch_votes (
  scene_id int not null references roleplay_scenes(id) on delete cascade,
  after_turn_id int not null,
  user_id text not null,
  option_id int not null references story_branch_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (scene_id, after_turn_id, user_id)
);
create index if not exists story_branch_votes_option_idx on story_branch_votes (option_id);

drop table if exists story_votes;
drop table if exists story_scenes;
