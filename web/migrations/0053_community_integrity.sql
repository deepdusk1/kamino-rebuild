-- Module 8 (communities): clean up what older code left behind.

-- 1. A removed (banned) or waiting member never keeps curator / co-leader powers.
update memberships set role = 'member'
where status <> 'active' and role in ('curator', 'leader');

-- 2. People who left or were removed are taken out of the community's rooms (a moderator's
--    "removed from this room" marker is kept so it still applies if they come back).
delete from chat_members cm
using chat_rooms r
where r.id = cm.room_id
  and r.community_id is not null
  and cm.room_removed = false
  and not exists (
    select 1 from memberships m
    where m.community_id = r.community_id and m.user_id = cm.user_id and m.status = 'active'
  );

update chat_members cm set in_voice = false, hand_raised = false
from chat_rooms r
where r.id = cm.room_id
  and r.community_id is not null
  and (cm.in_voice = true or cm.hand_raised = true)
  and not exists (
    select 1 from memberships m
    where m.community_id = r.community_id and m.user_id = cm.user_id and m.status = 'active'
  );

-- 3. Custom community roles only belong to active members.
delete from community_role_assignments a
where not exists (
  select 1 from memberships m
  where m.community_id = a.community_id and m.user_id = a.user_id and m.status = 'active'
);

-- 4. Member counts drifted (strikes on non-members and repeat bans used to subtract again). Recount once.
update communities c
set member_count = coalesce((
  select count(*)::int from memberships m where m.community_id = c.id and m.status = 'active'
), 0);
