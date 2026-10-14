-- Watch-party media persisted on screening rooms
alter table chat_rooms add column if not exists watch_url text not null default '';
alter table chat_rooms add column if not exists watch_title text not null default '';
