import type { Sql } from "../db";

/** A driver transaction and shared auth-row lock serialize quotas across server processes. */
export async function withStoryOwnerLock<T>(
  sql: Sql,
  userId: string,
  work: (tx: Sql) => Promise<T>,
): Promise<T> {
  if (!sql.transaction) throw new Error("Story changes require a transactional database.");
  return sql.transaction(async (tx) => {
    if (!(await tx`select id from "user" where id=${userId} for update`).length)
      throw new Error("Profile unavailable.");
    return work(tx);
  });
}

/** Same predicate for list, playback, replies and reporting. No community is needed. */
export function profileStoryAccessSql(viewer = "$1", story = "s") {
  return `exists(select 1 from profiles owner where owner.user_id=${story}.owner_id
    and not exists(select 1 from identity_account_status a where a.user_id=owner.user_id and a.status<>'active' and (a.until is null or a.until>now()))
    and (${story}.owner_id=${viewer} or (
      ${story}.hidden=false and (${story}.expires_at>now() or ${story}.highlighted=true)
      and not exists(select 1 from blocks b where (b.blocker_id=${viewer} and b.blocked_id=owner.user_id) or (b.blocked_id=${viewer} and b.blocker_id=owner.user_id))
      and not exists(select 1 from identity_relationships r where r.user_id=owner.user_id and r.target_user_id=${viewer} and r.kind='restrict')
      and (owner.private_account=false or exists(select 1 from profile_follows f where f.follower_id=${viewer} and f.followee_id=owner.user_id))
      and (${story}.audience='public' or (${story}.audience='followers' and exists(select 1 from profile_follows f where f.follower_id=${viewer} and f.followee_id=owner.user_id))
        or (${story}.audience='close_friends' and exists(select 1 from identity_relationships r where r.user_id=owner.user_id and r.target_user_id=${viewer} and r.kind='close_friend')))
      and (${story}.minimum_age=13 or exists(select 1 from profiles v where v.user_id=${viewer} and v.restricted_mode=false and case when ${story}.minimum_age=18 then v.age_eligible_at_18 else v.age_eligible_at_16 end<=current_date))
      and not exists(select 1 from profiles v where v.user_id=${viewer} and v.sensitive_content='hide' and ${story}.content_warning<>'')
    )))`;
}
export async function readableProfileStory(sql: Sql, viewer: string | null, storyId: number) {
  const rows = await sql.query(
    `select s.* from profile_stories s where s.id=$2 and ${profileStoryAccessSql()}`,
    [viewer ?? "", storyId],
  );
  if (!rows[0]) throw new Error("Story unavailable.");
  return rows[0];
}
export async function storyAgeAllowed(sql: Sql, userId: string, age: number) {
  const rows = await sql.query(
    `select 1 from profiles where user_id=$1 and min_age_confirmed_at is not null
    and ($2::int=13 or (restricted_mode=false and case when $2::int=18 then age_eligible_at_18 else age_eligible_at_16 end<=current_date))`,
    [userId, age],
  );
  if (!rows.length) throw new Error("Your age or safety settings do not allow this story rating.");
}
