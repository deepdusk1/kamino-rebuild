-- Minimum-age (13+) confirmation. The date of birth itself is never stored: the server checks it
-- once and only records WHEN the person passed the check. `age_confirmed` (the older column) is a
-- different thing: it is the optional "I am old enough for 16+/18+ communities" tick in Settings.
alter table profiles add column if not exists min_age_confirmed_at timestamptz;

-- Everyone who joined before this check existed is treated as already confirmed.
update profiles set min_age_confirmed_at = created_at where min_age_confirmed_at is null;
