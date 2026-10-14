/**
 * In-process real-time event bus (server-only).
 *
 * Mutations publish; the /api/events SSE route subscribes and fans the events
 * out to connected browsers, which invalidate their React Query caches instead
 * of polling every few seconds.
 *
 * This is safe on a single server process (the Railway deployment). If the app
 * ever scales to multiple server instances, replace this with Redis pub/sub —
 * an in-memory emitter cannot cross process boundaries.
 */
import { EventEmitter } from "node:events";

export type ServerEvent =
  | { type: "message"; roomId: number; messageId: number }
  | { type: "typing"; roomId: number; userId: string }
  | { type: "receipt"; roomId: number; userId: string }
  | { type: "voice"; roomId: number }
  | { type: "call"; toUserId: string; roomId: number }
  | { type: "call-declined"; toUserId: string; roomId: number };

type Listener = (event: ServerEvent) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/** Fire-and-forget: never let a push failure break the mutation that triggered it. */
export function publishEvent(event: ServerEvent): void {
  try {
    emitter.emit("kamino-event", event);
  } catch {
    /* push is best-effort; polling remains as the fallback */
  }
}

export function subscribeEvents(listener: Listener): () => void {
  emitter.on("kamino-event", listener);
  return () => emitter.off("kamino-event", listener);
}
