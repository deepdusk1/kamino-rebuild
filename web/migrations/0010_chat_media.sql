create table if not exists message_media (
  message_id int primary key,
  room_id int not null,
  kind text not null,
  data_url text not null,
  created_at timestamptz not null default now()
);
create index if not exists message_media_room_idx on message_media(room_id, message_id);

create table if not exists message_reactions (
  room_id int not null,
  message_id int not null,
  user_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_room_idx on message_reactions(room_id, message_id);

alter table chat_members add column if not exists pinned boolean not null default false;
alter table chat_members add column if not exists muted boolean not null default false;
