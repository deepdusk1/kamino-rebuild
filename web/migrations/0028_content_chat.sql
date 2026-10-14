-- Content and conversation tools. Relations retain the existing access-controlled post/room.
alter table comments add column if not exists parent_comment_id integer references comments(id) on delete set null;
create index if not exists comments_parent_idx on comments(parent_comment_id);
create table if not exists post_best_answers (
  post_id integer primary key references posts(id) on delete cascade,
  comment_id integer not null references comments(id) on delete cascade,
  chosen_by text not null, chosen_at timestamptz not null default now()
);
create table if not exists post_emoji_reactions (
  post_id integer not null references posts(id) on delete cascade, user_id text not null,
  emoji text not null, created_at timestamptz not null default now(), primary key(post_id,user_id,emoji)
);
create table if not exists post_personal_settings (
  post_id integer not null references posts(id) on delete cascade, user_id text not null,
  hidden boolean not null default false, muted boolean not null default false,
  following boolean not null default false, primary key(post_id,user_id)
);
create table if not exists post_content_settings (
  post_id integer primary key references posts(id) on delete cascade,
  sharing_allowed boolean not null default true,
  comment_rule text not null default 'members' check(comment_rule in ('members','followers','none')),
  minimum_age integer not null default 13 check(minimum_age in (13,16,18))
);
create table if not exists post_views (
  post_id integer not null references posts(id) on delete cascade,user_id text not null,
  first_at timestamptz not null default now(), last_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create table if not exists post_edit_history (
  id serial primary key, post_id integer not null references posts(id) on delete cascade,
  title text not null,body text not null,payload text not null,edited_at timestamptz not null default now()
);
create or replace function kamino_capture_post_edit() returns trigger language plpgsql as $$
begin
  if old.title is distinct from new.title or old.body is distinct from new.body or old.payload is distinct from new.payload then
    insert into post_edit_history(post_id,title,body,payload) values(old.id,old.title,old.body,old.payload);
  end if;
  return new;
end $$;
drop trigger if exists kamino_post_edit_history on posts;
create trigger kamino_post_edit_history before update on posts for each row execute function kamino_capture_post_edit();
create table if not exists content_media (
  id serial primary key,post_id integer references posts(id) on delete cascade,
  message_id integer references messages(id) on delete cascade,
  kind text not null check(kind in ('video','short','audio','gif','image','file')),
  storage_ref text not null,filename text not null default '',mime text not null,
  byte_size integer not null,alt_text text not null default '',captions text not null default '',
  created_at timestamptz not null default now(),
  check((post_id is not null) <> (message_id is not null))
);
create index if not exists content_media_post_idx on content_media(post_id);
create index if not exists content_media_message_idx on content_media(message_id);
create table if not exists story_details (
  post_id integer primary key references posts(id) on delete cascade,
  scope text not null default 'community' check(scope in ('community','profile')),
  background text not null default '#7548df', overlay_text text not null default '',
  sticker text not null default '',mentions text not null default '[]',
  question text not null default '',poll_options text not null default '[]',
  music_media_id integer references content_media(id) on delete set null
);
create table if not exists story_responses (
  post_id integer not null references posts(id) on delete cascade,user_id text not null,
  option_index integer,answer text not null default '',created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create table if not exists profile_highlights (
  id serial primary key,user_id text not null,title text not null,
  created_at timestamptz not null default now()
);
create table if not exists profile_highlight_posts (
  highlight_id integer not null references profile_highlights(id) on delete cascade,
  post_id integer not null references posts(id) on delete cascade,primary key(highlight_id,post_id)
);
create table if not exists profile_portfolio (
  id serial primary key,user_id text not null,title text not null,description text not null default '',
  url text not null default '',post_id integer references posts(id) on delete set null,
  position integer not null default 0,created_at timestamptz not null default now()
);
create table if not exists chat_message_pins (
  room_id integer not null references chat_rooms(id) on delete cascade,
  message_id integer not null references messages(id) on delete cascade,
  pinned_by text not null,pinned_at timestamptz not null default now(),primary key(room_id,message_id)
);
create table if not exists chat_share_cards (
  message_id integer primary key references messages(id) on delete cascade,
  kind text not null check(kind in ('post','profile','community')),target_id text not null
);
