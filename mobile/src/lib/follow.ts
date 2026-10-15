import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { confirmAction, notify } from "@/components/community/platform";
import { haptic } from "@/lib/haptics";
import { FOLLOW_QUERY_ROOTS, applyFollow, wantsFollow, type FollowState } from "@/lib/follow-state";

export { followLabel, wantsFollow, type FollowState } from "@/lib/follow-state";

/** Puts a new follow state into every cached screen that shows this person, then refreshes the counts. */
export function shareFollowState(queryClient: QueryClient, userId: string, next: FollowState) {
  for (const root of FOLLOW_QUERY_ROOTS) {
    queryClient.setQueriesData({ queryKey: [root] }, (data: unknown) => (data === undefined ? data : applyFollow(data, userId, next)));
  }
  // Your own "following" count, the Following feed and people lists come from the server again.
  void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
  void queryClient.invalidateQueries({ queryKey: ["followLists"] });
  void queryClient.invalidateQueries({ queryKey: ["feed", "following"] });
  void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
}

/**
 * Follows (`follow: true`) or unfollows / cancels a request (`follow: false`) and updates every screen.
 * Following a private account sends a request; the person is told.
 */
export async function setFollow(queryClient: QueryClient, userId: string, follow: boolean, options: { slug?: string } = {}): Promise<FollowState> {
  const result = options.slug ? await api.follow(options.slug, userId, follow) : await api.setFollow(userId, follow);
  shareFollowState(queryClient, userId, result);
  if (follow && result.requested) notify("Request sent", "This account is private. You'll see their posts once they accept.");
  else if (follow && result.following) haptic.success();
  return result;
}

/**
 * The tap on a follow button: follow when not following; otherwise asks first, then unfollows (or cancels the
 * request). Returns the new state, or null when the person changed their mind.
 */
export async function toggleFollowWithConfirm(
  queryClient: QueryClient,
  person: { userId: string; name: string },
  now: FollowState,
  options: { slug?: string; confirm?: boolean } = {},
): Promise<FollowState | null> {
  const follow = wantsFollow(now);
  if (!follow && options.confirm !== false) {
    const ok = await confirmAction(
      now.following ? `Unfollow ${person.name}?` : "Cancel your request?",
      now.following ? "Their posts won't show in your Following feed any more." : "You can ask again any time.",
      now.following ? "Unfollow" : "Cancel request",
      true,
    );
    if (!ok) return null;
  }
  return setFollow(queryClient, person.userId, follow, options);
}
