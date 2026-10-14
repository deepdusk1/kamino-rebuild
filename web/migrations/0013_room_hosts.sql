alter table chat_rooms add column if not exists invite_rule text not null default 'hosts';

create table if not exists room_cohosts (
  room_id integer not null references chat_rooms(id) on delete cascade,
  user_id text not null,
  primary key (room_id, user_id)
);
