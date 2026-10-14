alter table profiles add column if not exists featured_creator boolean not null default false;
create table if not exists platform_taxonomy (
 key text primary key, label text not null, icon text not null default '✨', active boolean not null default true
);
