/**
 * Community membership and the follow graph: the database rules behind joining, leaving, removing members and
 * following people. The server functions in server.ts call these (through a lazy import), and
 * community-membership.server.test.ts checks them against a real database.
 *
 * Rules that used to be broken (Module 8 audit):
 * - Leaving never clears a ban. (Before, a removed member could "leave" — which deleted the ban — and join again.)
 * - Removing someone resets their role and takes them out of the community's rooms, live stages and custom roles,
 *   and reports which calls they must be disconnected from.
 * - Following is set, never toggled: `follow: true` twice stays followed (one notification), so a button showing an
 *   out-of-date state can never do the opposite of what it says.
 */
import type { Sql } from "../db.ts";

export type FollowState = { following: boolean; requested: boolean };

/** Called once for each new follow or follow request (never for repeats). */
export type FollowNotifier = (kind: "follow" | "follow_request", target: { userId: string; handle: string }) => Promise<void>;

function truthy(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

/** Where the viewer stands with someone: following them, waiting on a request, or neither. */
export async function followStateOf(sql: Sql, userId: string, targetId: string): Promise<FollowState> {
  const row = (
    await sql.query<{ following: unknown; requested: unknown }>(
      `select exists(select 1 from profile_follows where follower_id = $1 and followee_id = $2) as following,
              exists(select 1 from follow_requests where follower_id = $1 and followee_id = $2) as requested`,
      [userId, targetId],
    )
  )[0];
  return { following: truthy(row?.following), requested: truthy(row?.requested) };
}

/**
 * Sets whether `userId` follows `targetId` and returns the result. `follow: true` when already following (or already
 * asked) changes nothing; `follow: false` removes a follow and a waiting request. Private accounts get a request.
 */
export async function setProfileFollow(sql: Sql, userId: string, targetId: string, follow: boolean, notify?: FollowNotifier): Promise<FollowState> {
  if (!targetId || typeof targetId !== "string") throw new Error("Profile not found");
  if (userId === targetId) throw new Error("That's you.");
  if (!follow) {
    // Unfollowing is always allowed (also after a block), so nobody gets stuck following someone.
    await sql.query(`delete from profile_follows where follower_id = $1 and followee_id = $2`, [userId, targetId]);
    await sql.query(`delete from follow_requests where follower_id = $1 and followee_id = $2`, [userId, targetId]);
    return { following: false, requested: false };
  }
  const now = await followStateOf(sql, userId, targetId);
  if (now.following || now.requested) return now;
  const blocked = await sql.query(
    `select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)`,
    [userId, targetId],
  );
  if (blocked.length) throw new Error("You can't follow this person.");
  const target = (
    await sql.query<{ handle: string; private_account: unknown }>(`select handle, private_account from profiles where user_id = $1`, [targetId])
  )[0];
  if (!target) throw new Error("Profile not found");
  if (truthy(target.private_account)) {
    // Two taps at once insert one request; only that one notifies.
    const asked = await sql.query(
      `insert into follow_requests (follower_id, followee_id) values ($1, $2) on conflict do nothing returning follower_id`,
      [userId, targetId],
    );
    if (asked.length) await notify?.("follow_request", { userId: targetId, handle: String(target.handle) });
    return { following: false, requested: true };
  }
  const added = await sql.query(
    `insert into profile_follows (follower_id, followee_id) values ($1, $2) on conflict do nothing returning follower_id`,
    [userId, targetId],
  );
  if (added.length) await notify?.("follow", { userId: targetId, handle: String(target.handle) });
  return { following: true, requested: false };
}

/** Adds a member to the community's open rooms (chat, voice, watch parties) so they show in their chats. */
export async function addToOpenRooms(sql: Sql, userId: string, communityId: string): Promise<void> {
  await sql.query(
    `insert into chat_members (room_id, user_id)
     select id, $1 from chat_rooms where community_id = $2 and kind in ('public','voice','screening')
     on conflict do nothing`,
    [userId, communityId],
  );
}

/** Active leaders (owner and co-leaders) of a community: who hears about join requests. */
export async function communityLeaderIds(sql: Sql, communityId: string): Promise<string[]> {
  const rows = await sql.query<{ user_id: string }>(
    `select user_id from memberships where community_id = $1 and status = 'active' and role in ('agent','leader') order by user_id`,
    [communityId],
  );
  return rows.map((r) => String(r.user_id));
}

/**
 * Takes someone out of a community's rooms, live stages and custom roles (when they leave or are removed). A
 * moderator's "removed from this room" marker is kept, so coming back doesn't undo it. Returns the rooms whose call
 * they were in, so the caller can disconnect them.
 */
export async function dropCommunityAccess(sql: Sql, userId: string, communityId: string): Promise<number[]> {
  const rooms = `select id from chat_rooms where community_id = $2`;
  const inCall = await sql.query<{ room_id: number }>(`select room_id from chat_members where user_id = $1 and in_voice = true and room_id in (${rooms})`, [
    userId,
    communityId,
  ]);
  await sql.query(`delete from chat_members where user_id = $1 and room_removed = false and room_id in (${rooms})`, [userId, communityId]);
  await sql.query(`update chat_members set in_voice = false, hand_raised = false where user_id = $1 and room_id in (${rooms})`, [userId, communityId]);
  await sql.query(`delete from room_cohosts where user_id = $1 and room_id in (${rooms})`, [userId, communityId]);
  await sql.query(`delete from community_role_assignments where user_id = $1 and community_id = $2`, [userId, communityId]);
  return inCall.map((r) => Number(r.room_id));
}

type MembershipRow = { status: string; role: string };

async function membershipRow(sql: Sql, userId: string, communityId: string): Promise<MembershipRow | null> {
  const row = (await sql.query<MembershipRow>(`select status, role from memberships where user_id = $1 and community_id = $2`, [userId, communityId]))[0];
  return row ? { status: String(row.status), role: String(row.role) } : null;
}

/**
 * Removes (bans) a member: status "banned", role reset to member (so a removed curator has no powers), out of every
 * room. The member count only drops if they were active. `changed` is false when they were already removed.
 */
export async function banMember(sql: Sql, userId: string, communityId: string): Promise<{ changed: boolean; inCallRooms: number[] }> {
  const before = await membershipRow(sql, userId, communityId);
  if (!before || before.status === "banned") return { changed: false, inCallRooms: [] };
  const updated = await sql.query(
    `update memberships set status = 'banned', role = 'member' where user_id = $1 and community_id = $2 and status <> 'banned' returning user_id`,
    [userId, communityId],
  );
  if (!updated.length) return { changed: false, inCallRooms: [] };
  if (before.status === "active") {
    await sql.query(`update communities set member_count = greatest(member_count - 1, 0) where id = $1`, [communityId]);
  }
  return { changed: true, inCallRooms: await dropCommunityAccess(sql, userId, communityId) };
}

/** Lets a removed member back in (a leader's "restore" or an accepted appeal), with their rooms back. */
export async function restoreMember(sql: Sql, userId: string, communityId: string): Promise<boolean> {
  const restored = await sql.query(
    `update memberships set status = 'active' where user_id = $1 and community_id = $2 and status = 'banned' returning user_id`,
    [userId, communityId],
  );
  if (!restored.length) return false;
  await sql.query(`update communities set member_count = member_count + 1 where id = $1`, [communityId]);
  await addToOpenRooms(sql, userId, communityId);
  return true;
}

/**
 * Leaves a community, or cancels a waiting join request. A removed member stays removed (leaving never clears a ban).
 * The owner must hand the community over first.
 */
export async function leaveMembership(sql: Sql, userId: string, communityId: string): Promise<{ left: boolean; inCallRooms: number[] }> {
  const m = await membershipRow(sql, userId, communityId);
  if (!m || m.status === "banned") return { left: false, inCallRooms: [] };
  if (m.role === "agent") throw new Error("You own this community. Make a co-leader the owner first (Moderation → People).");
  const left = await sql.query(`delete from memberships where user_id = $1 and community_id = $2 and status = $3 returning user_id`, [
    userId,
    communityId,
    m.status,
  ]);
  if (!left.length) return { left: false, inCallRooms: [] };
  if (m.status === "active") {
    await sql.query(`update communities set member_count = greatest(member_count - 1, 0) where id = $1`, [communityId]);
  }
  await sql.query(`delete from join_answers where user_id = $1 and community_id = $2`, [userId, communityId]);
  return { left: true, inCallRooms: await dropCommunityAccess(sql, userId, communityId) };
}

/** Checks an invite code for a community without using it up. Throws a readable message when it can't be used. */
export async function checkInvite(sql: Sql, code: string, communityId: string): Promise<void> {
  const inv = (
    await sql.query<{ max_uses: number; uses: number; expires_at: unknown }>(
      `select max_uses, uses, expires_at from invite_codes where code = $1 and community_id = $2`,
      [code, communityId],
    )
  )[0];
  if (!inv) throw new Error("That invite code isn’t valid.");
  if (inv.expires_at && new Date(String(inv.expires_at)).getTime() < Date.now()) throw new Error("That invite expired.");
  if (Number(inv.max_uses) > 0 && Number(inv.uses) >= Number(inv.max_uses)) throw new Error("That invite is used up.");
}

/** Uses one place on an invite, atomically (two people can't both take the last place). False when none is left. */
export async function useInvite(sql: Sql, code: string, communityId: string): Promise<boolean> {
  const used = await sql.query(
    `update invite_codes set uses = uses + 1
     where code = $1 and community_id = $2 and (max_uses = 0 or uses < max_uses) and (expires_at is null or expires_at > now())
     returning code`,
    [code, communityId],
  );
  return used.length > 0;
}
