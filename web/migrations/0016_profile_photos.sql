-- Profile photos. The picture itself lives in its own table so the many queries that
-- read a whole profile row never drag image data along. `avatar_version` on the
-- profile is 0 when there is no photo, otherwise a number that changes with every
-- upload (apps add it to the image address so a new photo shows up immediately).
alter table profiles add column if not exists avatar_version integer not null default 0;

create table if not exists profile_avatars (
  user_id text primary key,
  data_url text not null,
  updated_at timestamptz not null default now()
);
