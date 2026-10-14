-- Release 8.1: a personal "mute" for people. Softer than a block:
--   - their posts and comments are left out of your feeds and lists,
--   - they create no notifications or phone pushes for you,
--   - but they can still see you and message you (their messages wait in your Requests).
-- Nobody is ever told that they were muted. Every statement is safe to run twice.

-- One row per (you, the person you muted).
create table if not exists muted_people (
  user_id text not null,
  muted_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id)
);
create index if not exists muted_people_muted_idx on muted_people (muted_user_id);

-- A message request created only because of a mute. The sender is not shown "waiting for them to accept"
-- for these (that would give the mute away), and unmuting puts the conversation back into your normal chats.
alter table message_requests add column if not exists via_mute boolean not null default false;
