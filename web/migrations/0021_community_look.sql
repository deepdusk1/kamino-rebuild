-- Community look: a colour style, an optional icon, and (through the existing `cover` column) an optional uploaded banner.
alter table communities add column if not exists theme_style text not null default 'aurora';
alter table communities add column if not exists icon text not null default '';

-- Uploaded pictures for a community. Public, like profile photos: they are shown on listings.
create table if not exists community_media (
  community_id text not null,
  kind text not null,
  data_url text not null,
  updated_at timestamptz not null default now(),
  primary key (community_id, kind)
);
