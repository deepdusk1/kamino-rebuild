-- Watch party upgrades: a shared play queue with voting, and ready checks.
-- Both tables hang off screening rooms (chat_rooms kind='screening') and clean
-- themselves up with the room.

create table if not exists watch_queue (
  id bigserial primary key,
  room_id int not null references chat_rooms(id) on delete cascade,
  url text not null,
  title text not null,
  kind text not null,
  added_by text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists watch_queue_room_idx on watch_queue(room_id, id);

create table if not exists watch_queue_votes (
  item_id bigint not null references watch_queue(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists watch_queue_votes_item_idx on watch_queue_votes(item_id);

-- Ready checks: a room-level round counter, and one answer row per member.
-- Starting a check bumps the room's round; members answer the current round;
-- the host reads answers for the current round. Late answers to old rounds are ignored.
create table if not exists watch_ready_rounds (
  room_id int primary key references chat_rooms(id) on delete cascade,
  round int not null default 0,
  started_by text not null,
  started_at timestamptz not null default now()
);

create table if not exists watch_ready (
  room_id int not null references chat_rooms(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  round int not null default 0,
  ready boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
