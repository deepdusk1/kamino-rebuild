import type { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/api/endpoints";
import { confirmAction, notify } from "@/components/community/platform";
import { haptic } from "@/lib/haptics";
import { canQuickJoin, type JoinView } from "@/lib/community-join-rules";

export { canQuickJoin, joinButtonLabel, joinNeedsApproval, type JoinView } from "@/lib/community-join-rules";

/** Everything that shows whether you're in a community, refreshed after a join or a leave. */
export function refreshCommunityLists(queryClient: QueryClient, slug: string) {
  for (const key of [["community", slug], ["communityOverview", slug], ["exploreOverview"], ["homeOverview"], ["bootstrap"], ["searchEverything"], ["onboardingSuggestions"], ["chatsOverview"], ["feed"]]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/** Asks first, then leaves (or cancels a waiting request). Returns false when the person changed their mind. */
export async function leaveCommunity(queryClient: QueryClient, c: { id: string; name: string; pending?: boolean }): Promise<boolean> {
  const ok = await confirmAction(
    c.pending ? "Cancel your request?" : `Leave ${c.name}?`,
    c.pending ? "The leaders won't see it any more. You can ask again later." : "You'll stop seeing its rooms in your chats. Your reputation is kept if you come back.",
    c.pending ? "Cancel request" : "Leave",
    true,
  );
  if (!ok) return false;
  await api.leave(c.id);
  refreshCommunityLists(queryClient, c.id);
  return true;
}

/**
 * The Join / Joined button on a community card. Joined: asks, then leaves. Open communities: joins in one tap.
 * Anything else (private, approval, invite only, or already waiting): opens the community page, which has the join
 * sheet (answers, invite code) and the "cancel request" option. Returns the new joined state, or null for no change.
 */
export async function tapJoinButton(queryClient: QueryClient, c: JoinView & { id: string; name: string }): Promise<boolean | null> {
  if (c.joined) return (await leaveCommunity(queryClient, c)) ? false : null;
  if (!canQuickJoin(c)) {
    router.push(`/community/${c.id}`);
    return null;
  }
  const result = await api.join({ slug: c.id });
  refreshCommunityLists(queryClient, c.id);
  if (result.pending) {
    notify("Request sent", "The leaders will review your request. You'll get a notification when you're in.");
    return null;
  }
  haptic.success();
  return true;
}
