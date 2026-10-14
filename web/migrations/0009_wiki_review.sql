alter table posts add column if not exists wiki_status text not null default 'draft';
alter table posts add column if not exists wiki_review_note text not null default '';
update posts set wiki_status = 'approved' where type = 'wiki' and featured = true and wiki_status = 'draft';
