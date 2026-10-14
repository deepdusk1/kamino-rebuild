alter table profile_stories add column if not exists layers text not null default '[]';
create table if not exists media_library (
 id bigserial primary key,
 owner_id text not null references "user"(id) on delete cascade,
 kind text not null check (kind in ('gif','audio')),
 title text not null, artist text not null default '',
 tags text not null default '',
 storage_ref text not null, mime text not null, byte_size integer not null check(byte_size>0),
 filename text not null, alt_text text not null default '',
 licensed boolean not null default false,
 license_url text not null default '',
 created_at timestamptz not null default now(),
 check(not licensed or (kind='audio' and license_url<>''))
);
create index if not exists media_library_owner_idx on media_library(owner_id,id desc);
create index if not exists media_library_catalog_idx on media_library(licensed,kind,id desc);
