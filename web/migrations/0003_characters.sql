create table if not exists characters (
  id serial primary key,
  user_id text not null,
  name text not null,
  fandom text not null default '',
  bio text not null default '',
  appearance text not null default '',
  hue int not null default 200,
  created_at timestamptz not null default now()
);
create index if not exists characters_user_idx on characters (user_id);

create unique index if not exists reports_open_unique
  on reports (reporter_id, target_type, target_id)
  where status = 'open';
