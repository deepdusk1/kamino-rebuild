-- Free cosmetics: a chat bubble style to go with the bubble colour. (New avatar frames need no column.)
alter table profiles add column if not exists bubble_style text not null default 'soft';
