import { useQuery } from "@tanstack/react-query";
import { chatsOverview } from "@/lib/kamino/social";
import { useServerEventsLive } from "@/lib/server-events";
import { isLiveKind } from "./rooms";

export type Filter = "all" | "dm" | "groups" | "live" | "requests";

/** The chat list data, shared by the Chats screen and the list beside an open chat on computers. */
export function useChatsData(enabled: boolean, userId?: string | null) {
  // Push invalidation keeps this fresh; the 15s poll is only the SSE fallback.
  const pushLive = useServerEventsLive();
  const overview = useQuery({
    queryKey: ["chatsOverview"],
    queryFn: () => chatsOverview(),
    enabled,
    refetchInterval: pushLive ? false : 15_000,
  });
  const rooms = overview.data?.rooms ?? [];
  const requests = rooms.filter((r) => r.isRequest);
  const requestCount = Math.max(overview.data?.requests ?? 0, requests.length);
  // Pinned first, then the most recent conversation; rooms without messages go last.
  const sorted = rooms
    .filter((r) => !r.isRequest)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""),
    );
  const pick = (filter: Filter) =>
    filter === "dm"
      ? sorted.filter((r) => r.kind === "dm")
      : filter === "groups"
        ? sorted.filter((r) => r.isGroup)
        : filter === "live"
          ? sorted.filter((r) => isLiveKind(r.kind))
          : filter === "requests"
            ? requests
            : sorted.filter(
                // Live rooms are auto-joined by every community member when started, so message-less
                // ones stay out of everyone else's list — but a room you started yourself must not vanish.
                (r) => !(isLiveKind(r.kind) && !r.lastAt && r.createdBy !== userId),
              );
  return { overview, requestCount, pick };
}
