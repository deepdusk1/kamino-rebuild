import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

/**
 * Real-time server events over SSE (`GET /api/events`).
 *
 * Mounted once in the app root. While the stream is connected, screens skip
 * their polling intervals (they pass `live ? false : <ms>` as refetchInterval)
 * because the server pushes invalidations instead. If the stream drops,
 * EventSource reconnects on its own — and every (re)connect refetches the
 * push-covered queries so no event missed during a gap stays stale.
 */
const LiveContext = createContext(false);

/** True while the SSE stream is connected — screens use it to skip polling. */
export function useServerEventsLive(): boolean {
  return useContext(LiveContext);
}

type PushEvent = { type: string; roomId?: number };

const RESYNC_KEYS: string[][] = [
  ["room"],
  ["chatsOverview"],
  ["typing"],
  ["receipts"],
  ["incoming-calls"],
  ["live-stage"],
  ["liveRooms"],
];

export function ServerEventsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useCurrentUserState();
  const [live, setLive] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setLive(false);
      return;
    }
    let stopped = false;
    const es = new EventSource("/api/events");
    const resync = () => {
      for (const key of RESYNC_KEYS)
        void queryClient.invalidateQueries({ queryKey: key });
    };
    es.onopen = () => {
      if (stopped) return;
      setLive(true);
      resync();
    };
    es.onerror = () => {
      if (!stopped) setLive(false);
    };
    es.onmessage = (msg) => {
      let event: PushEvent;
      try {
        event = JSON.parse(msg.data) as PushEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case "message":
          if (event.roomId != null) {
            void queryClient.invalidateQueries({ queryKey: ["room", event.roomId] });
            void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
          }
          break;
        case "typing":
          if (event.roomId != null)
            void queryClient.invalidateQueries({ queryKey: ["typing", event.roomId] });
          break;
        case "receipt":
          if (event.roomId != null)
            void queryClient.invalidateQueries({ queryKey: ["receipts", event.roomId] });
          break;
        case "voice":
          if (event.roomId != null)
            void queryClient.invalidateQueries({ queryKey: ["live-stage", event.roomId] });
          break;
        case "call":
          void queryClient.invalidateQueries({ queryKey: ["incoming-calls"] });
          break;
        case "call-declined":
          void queryClient.invalidateQueries({ queryKey: ["incoming-calls"] });
          window.dispatchEvent(
            new CustomEvent("kamino-call-declined", { detail: event.roomId }),
          );
          break;
      }
    };
    return () => {
      stopped = true;
      es.close();
      setLive(false);
    };
  }, [userId, queryClient]);

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}
