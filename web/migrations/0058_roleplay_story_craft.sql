-- Role-play stories that feel specific to each group (Module: AI storyteller).
-- tone:      the mood picked at set-up (adventure, mystery, horror, comedy, romance, drama), or '' for none.
-- notes:     the storyteller's private running notes (names, facts, open threads) so long stories stay consistent.
--            Never shown to members.
-- spotlight: the character the storyteller turned to last ("your move"), or '' when nobody plays one.
alter table roleplay_scenes add column if not exists tone text not null default '';
alter table roleplay_scenes add column if not exists notes text not null default '';
alter table roleplay_scenes add column if not exists spotlight text not null default '';
