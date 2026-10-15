/**
 * Follow state, shared by every follow button in the app (no React or network code here, so it can be unit tested).
 *
 * The old bug: each screen kept its own copy of "do I follow them?" and the server only had a toggle. When one copy
 * was out of date (you followed someone on their profile, then went back to a post or the members list), the button
 * still said "Follow", and tapping it sent a toggle that UNFOLLOWED them. Private accounts made it worse: after a
 * request the button went back to "Follow", and the next tap silently cancelled the request.
 *
 * The fix has two halves: the app always tells the server what it wants (`setFollowProfile` with follow true/false,
 * which is safe to repeat), and after every change `applyFollow` updates every cached screen that shows this person.
 */

export type FollowState = { following: boolean; requested: boolean };

/** The words on a follow button. */
export function followLabel(state: FollowState): "Following" | "Requested" | "Follow" {
  if (state.following) return "Following";
  if (state.requested) return "Requested";
  return "Follow";
}

/**
 * What tapping the button asks for: following or a waiting request means "stop" (unfollow / cancel the request);
 * anything else means "follow".
 */
export function wantsFollow(state: FollowState): boolean {
  return !(state.following || state.requested);
}

/** The cached queries that can show whether you follow someone (by the first part of their React Query key). */
export const FOLLOW_QUERY_ROOTS = [
  "profileOverview",
  "homeOverview",
  "exploreOverview",
  "searchEverything",
  "followLists",
  "community",
  "communityMembers",
  "onboardingSuggestions",
] as const;

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Followers go up by one when you start following and down by one when you stop (never below zero). */
function adjustFollowers(count: unknown, before: FollowState, after: FollowState): unknown {
  if (typeof count !== "number") return count;
  if (before.following === after.following) return count;
  return Math.max(0, count + (after.following ? 1 : -1));
}

/**
 * Returns `data` with every place that describes the viewer's follow state for `userId` set to `next`.
 * Unchanged parts keep their identity (so React Query only re-renders what changed). It understands:
 * - people cards and rows: `{ userId, following: boolean, requested?, followers? }`
 * - a profile page: `{ profile: { userId }, following: boolean, requested, stats: { followers } }`
 * - a community page: `{ followingIds: string[], requestedIds?: string[] }`
 */
export function applyFollow<T>(data: T, userId: string, next: FollowState, depth = 0): T {
  if (depth > 8 || data === null || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    let changed = false;
    const out = data.map((item) => {
      const patched = applyFollow(item, userId, next, depth + 1);
      if (patched !== item) changed = true;
      return patched;
    });
    return (changed ? out : data) as T;
  }

  const obj = data as Plain;
  let out: Plain | null = null;
  const set = (key: string, value: unknown) => {
    if (obj[key] === value) return;
    out ??= { ...obj };
    out[key] = value;
  };

  const before: FollowState = { following: obj.following === true, requested: obj.requested === true };
  const isPerson = obj.userId === userId && typeof obj.following === "boolean";
  const isProfilePage = isPlain(obj.profile) && obj.profile.userId === userId && typeof obj.following === "boolean";
  if (isPerson || isProfilePage) {
    set("following", next.following);
    if ("requested" in obj) set("requested", next.requested);
    if (isPerson) set("followers", adjustFollowers(obj.followers, before, next));
    if (isProfilePage && isPlain(obj.stats) && typeof obj.stats.followers === "number") {
      const followers = adjustFollowers(obj.stats.followers, before, next);
      if (followers !== obj.stats.followers) set("stats", { ...obj.stats, followers });
    }
  }

  if (Array.isArray(obj.followingIds)) {
    const ids = obj.followingIds.filter((id) => id !== userId);
    const following = next.following ? [...ids, userId] : ids;
    if (following.length !== obj.followingIds.length || following.some((id, i) => id !== (obj.followingIds as unknown[])[i])) {
      set("followingIds", following);
    }
    if ("requestedIds" in obj) {
      const asked = (Array.isArray(obj.requestedIds) ? obj.requestedIds : []).filter((id) => id !== userId);
      const requested = next.requested ? [...asked, userId] : asked;
      const old = Array.isArray(obj.requestedIds) ? obj.requestedIds : [];
      if (requested.length !== old.length || requested.some((id, i) => id !== old[i])) set("requestedIds", requested);
    }
  }

  // Look inside everything else (lists of posts, people, sections...).
  for (const [key, value] of Object.entries(obj)) {
    if (key === "followingIds" || key === "requestedIds" || key === "stats" || key === "profile") continue;
    if (value === null || typeof value !== "object") continue;
    const patched = applyFollow(value, userId, next, depth + 1);
    if (patched !== value) set(key, patched);
  }

  return (out ?? data) as T;
}
