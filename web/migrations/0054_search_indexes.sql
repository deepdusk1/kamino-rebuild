-- Module 9 (search): fast "contains" searches.
-- Search uses ILIKE '%words%', which without these indexes reads every post, profile and community on each
-- keystroke. Trigram (pg_trgm) GIN indexes let Postgres jump straight to the matches. Neon and normal Postgres
-- have pg_trgm; if a database can't load it (for example the in-memory test database), search still works, just
-- without these indexes.
do $$
begin
  begin
    create extension if not exists pg_trgm;
  exception when others then
    raise notice 'pg_trgm is not available here; search indexes skipped';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists profiles_handle_trgm on profiles using gin (handle gin_trgm_ops)';
    execute 'create index if not exists profiles_display_name_trgm on profiles using gin (display_name gin_trgm_ops)';
    execute 'create index if not exists communities_name_trgm on communities using gin (name gin_trgm_ops)';
    execute 'create index if not exists posts_title_trgm on posts using gin (title gin_trgm_ops)';
    execute 'create index if not exists posts_body_trgm on posts using gin (body gin_trgm_ops)';
    execute 'create index if not exists posts_hashtags_trgm on posts using gin (hashtags gin_trgm_ops)';
    execute 'create index if not exists events_title_trgm on events using gin (title gin_trgm_ops)';
  end if;
end $$;

-- Message search is per room: the room index narrows it before the text is checked.
create index if not exists messages_room_id_desc_idx on messages (room_id, id desc);

-- "Recent searches" reads and trims per person.
create index if not exists recent_searches_user_at_id_idx on recent_searches (user_id, at desc, id desc);
