create table if not exists wiki_revisions (
  id bigserial primary key,
  post_id bigint not null references posts(id) on delete cascade,
  editor_user_id text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists wiki_revisions_post_idx on wiki_revisions(post_id, id desc);

create table if not exists wiki_profile_pins (
  user_id text not null,
  post_id bigint not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, post_id)
);
create index if not exists wiki_profile_pins_user_idx on wiki_profile_pins(user_id, created_at desc);
