-- Module 10 (settings): repair values older code could leave behind.

-- 1. "Restricted mode" shows only 13+ communities. Every Kamino community is 18+, so it hid everything.
update profiles set restricted_mode = false where restricted_mode = true;

-- 2. Quiet hours with only a start or only an end (or start = end) never worked; switch them off cleanly.
update profiles set quiet_start = null, quiet_end = null
where (quiet_start is null) <> (quiet_end is null) or (quiet_start is not null and quiet_start = quiet_end);

-- 3. "Who can message me" only accepts three values; anything else falls back to the default.
update profiles set dm_privacy = 'members' where dm_privacy not in ('everyone', 'members', 'none');

-- 4. A block ends follows and follow requests both ways (older blocks left them in place).
delete from profile_follows f using blocks b
where (b.blocker_id = f.follower_id and b.blocked_id = f.followee_id)
   or (b.blocker_id = f.followee_id and b.blocked_id = f.follower_id);
delete from follow_requests f using blocks b
where (b.blocker_id = f.follower_id and b.blocked_id = f.followee_id)
   or (b.blocker_id = f.followee_id and b.blocked_id = f.follower_id);
