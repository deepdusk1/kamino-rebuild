-- Amino-parity: comment likes, shared folder
create table if not exists comment_likes (
  user_id text not null,
  comment_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create table if not exists shared_items (
  id serial primary key,
  community_id text not null,
  author_user_id text not null,
  title text not null,
  url text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists shared_items_community_idx on shared_items (community_id, id desc);
