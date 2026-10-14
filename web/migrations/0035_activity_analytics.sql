-- One UTC activity record per authenticated member per day. Account deletion removes it.
create table if not exists daily_member_activity (
  user_id text not null references "user"(id) on delete cascade,
  active_on date not null default (now() at time zone 'UTC')::date,
  primary key (user_id, active_on)
);
create index if not exists daily_member_activity_day_idx on daily_member_activity(active_on);
