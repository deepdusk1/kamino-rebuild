-- Per-community check-ins, challenge entries with judging.
-- No coins and no paid items: everything here is earned by taking part.

-- A daily check-in and streak inside each community (the account-wide check-in still exists).
alter table memberships add column if not exists streak int not null default 0;
alter table memberships add column if not exists best_streak int not null default 0;
alter table memberships add column if not exists last_checkin_on date;

-- Challenges (events of kind 'challenge') take entries: one post per member.
create table if not exists challenge_entries (
  event_id int not null,
  user_id text not null,
  post_id int not null,
  placement int,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists challenge_entries_post on challenge_entries (post_id);
-- Set once, when leaders pick the winners. A judged challenge cannot be judged again (no double rewards).
alter table events add column if not exists judged_at timestamptz;
