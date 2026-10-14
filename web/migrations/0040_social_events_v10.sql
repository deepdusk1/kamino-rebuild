create table if not exists friend_requests (
  id bigserial primary key,
  sender_id text not null references "user"(id) on delete cascade,
  recipient_id text not null references "user"(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(), decided_at timestamptz,
  check(sender_id<>recipient_id)
);
create unique index if not exists friend_request_pair_idx on friend_requests(least(sender_id,recipient_id),greatest(sender_id,recipient_id)) where state in ('pending','accepted');
create table if not exists group_invitations (
  id bigserial primary key, room_id int not null references chat_rooms(id) on delete cascade,
  invited_by text not null references "user"(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','accepted','declined','cancelled')),
  expires_at timestamptz not null default now()+interval '7 days',
  created_at timestamptz not null default now(), decided_at timestamptz
);
create unique index if not exists group_invitation_pending_idx on group_invitations(room_id,user_id) where state='pending';
alter table chat_members add column if not exists group_role text not null default 'member' check(group_role in ('member','moderator','coadmin'));
alter table events add column if not exists timezone text not null default 'UTC';
alter table events add column if not exists dst_disambiguation text not null default 'reject';
create table if not exists event_timeline (
  id bigserial primary key,event_id int not null references events(id) on delete cascade,
  author_id text not null references "user"(id) on delete cascade,
  body text not null,created_at timestamptz not null default now(),deleted boolean not null default false
);
create table if not exists event_passes (
  id bigserial primary key,event_id int not null references events(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  code text not null unique,state text not null default 'issued' check(state in ('issued','checked_in','cancelled')),
  issued_at timestamptz not null default now(),checked_in_at timestamptz,
  checked_in_by text references "user"(id) on delete set null,
  unique(event_id,user_id)
);
create index if not exists event_timeline_event_idx on event_timeline(event_id,id);
