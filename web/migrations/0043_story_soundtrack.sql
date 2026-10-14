-- Soundtracks are a separate owner-held copy, never a pointer to somebody else's library object.
alter table profile_stories add column if not exists music_ref text;
alter table profile_stories add column if not exists music_mime text not null default '';
alter table profile_stories add column if not exists music_filename text not null default '';
alter table profile_stories add column if not exists music_byte_size integer not null default 0;
alter table profile_stories add column if not exists music_alt_text text not null default '';
alter table profile_stories add column if not exists music_captions text not null default '';
alter table profile_stories add constraint profile_story_music_bounds check (
 (music_ref is null and music_byte_size=0) or
 (music_ref is not null and music_byte_size>0 and music_byte_size<=8000000 and
  music_mime in ('audio/mp4','audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/aac') and
  length(music_filename)<=120 and length(music_alt_text)<=600 and length(music_captions)<=12000)
);
