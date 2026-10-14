-- Extra pictures for an image post (the album), and folders for a community's shared files.
create table if not exists post_images (
  post_id int not null,
  position int not null,
  data_url text not null,
  primary key (post_id, position)
);

alter table shared_items add column if not exists folder text not null default '';
alter table shared_items add column if not exists min_level int not null default 1;
create index if not exists shared_items_folder_idx on shared_items (community_id, folder);
