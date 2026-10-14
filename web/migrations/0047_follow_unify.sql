-- Follow unification: there were two follow graphs — global profile_follows (profiles, feeds,
-- stories, friends) and per-community follows (community member lists). Following someone in one
-- place did not follow them in the other. Everything now uses the global graph; the per-community
-- rows are migrated in so nobody loses follows they made inside a community.
insert into profile_follows (follower_id, followee_id)
select distinct f.follower_id, f.followee_id
from follows f
on conflict (follower_id, followee_id) do nothing;

-- Requests created inside communities become pending requests on the unified graph.
-- (follow_requests already exists from the private-account feature; nothing to migrate there.)
