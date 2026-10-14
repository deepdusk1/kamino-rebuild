-- When a person opened a quiz. The server keeps the clock, so a time limit can be enforced and
-- the leaderboard time can not be made up by the app.
create table if not exists quiz_starts (
  user_id text not null,
  post_id int not null,
  started_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
