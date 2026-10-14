create table if not exists profile_stories (
 id bigserial primary key,
 owner_id text not null references "user"(id) on delete cascade,
 caption text not null default '',
 background text not null default 'violet',
 audience text not null default 'public' check (audience in ('public','followers','close_friends')),
 minimum_age integer not null default 13 check (minimum_age in (13,16,18)),
 content_warning text not null default '',
 highlighted boolean not null default false,
 hidden boolean not null default false,
 media_ref text,
 kind text not null default '', filename text not null default '', mime text not null default '',
 byte_size integer not null default 0, alt_text text not null default '', captions text not null default '',
 question text not null default '', poll_options text not null default '[]',
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours'
);
create index if not exists profile_stories_owner_idx on profile_stories(owner_id,id desc);
create table if not exists profile_story_responses (
 story_id bigint not null references profile_stories(id) on delete cascade,
 user_id text not null references "user"(id) on delete cascade,
 option_index integer, answer text not null default '', updated_at timestamptz not null default now(),
 primary key(story_id,user_id)
);
