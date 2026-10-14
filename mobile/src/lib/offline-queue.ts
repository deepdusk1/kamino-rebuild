import NetInfo from "@react-native-community/netinfo";
import { readSecret, writeSecret, deleteSecret } from "@/auth/storage";

/**
 * Offline message queue: when a chat message cannot reach the server, it waits here and is
 * replayed automatically on reconnect.
 *
 * Safety properties (fixed Oct 2026 after QA audit):
 * - C2: every queued message is tagged with the owner's user ID; the queue key is
 *   scoped per account; flush verifies the current user matches before sending;
 *   sign-out clears the in-memory wiring so another account never replays yours.
 * - M1: a flush lock serializes concurrent flushes; only acknowledged IDs are
 *   removed, so messages enqueued mid-flush survive.
 * - M2: callers decide what to queue (network errors only); the clientTag is
 *   allocated before the first attempt so server dedup works on every retry.
 */
const QUEUE_KEY_PREFIX = "kamino.offline-queue.";
const MAX_QUEUE = 100;

export type QueuedMessage = {
  clientTag: string;
  userId: string;
  input: { roomId: number; body: string; replyTo?: number | null; clientTag: string };
  queuedAt: number;
};

type Queue = QueuedMessage[];

let listeners: ((count: number) => void)[] = [];

function emit(count: number) {
  for (const listener of listeners) listener(count);
}

export function onQueueChange(listener: (count: number) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

function queueKey(userId: string): string {
  return `${QUEUE_KEY_PREFIX}${userId}`;
}

async function load(userId: string): Promise<Queue> {
  try {
    const raw = await readSecret(queueKey(userId));
    return raw ? (JSON.parse(raw) as Queue) : [];
  } catch {
    return [];
  }
}

async function save(userId: string, queue: Queue): Promise<void> {
  await writeSecret(queueKey(userId), JSON.stringify(queue.slice(-MAX_QUEUE)));
  emit(queue.length);
}

/** Allocate a stable client tag before the first send attempt. Reuse it on every retry. */
export function newClientTag(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queuedCount(userId: string): Promise<number> {
  return (await load(userId)).length;
}

export async function enqueueMessage(
  userId: string,
  input: { roomId: number; body: string; replyTo?: number | null; clientTag?: string },
): Promise<QueuedMessage> {
  const queue = await load(userId);
  const clientTag = input.clientTag ?? newClientTag();
  const entry: QueuedMessage = {
    clientTag,
    userId,
    input: { roomId: input.roomId, body: input.body, replyTo: input.replyTo ?? null, clientTag },
    queuedAt: Date.now(),
  };
  await save(userId, [...queue, entry]);
  return entry;
}

/** Remove a user's queued messages (e.g. on sign-out or account deletion). */
export async function clearQueue(userId: string): Promise<void> {
  await deleteSecret(queueKey(userId));
  emit(0);
}

export type SendFn = (input: QueuedMessage["input"]) => Promise<unknown>;

/** One flush at a time; concurrent triggers queue behind the active one. */
let flushInFlight: Promise<{ sent: number; remaining: number }> | null = null;

/**
 * Replays queued messages in order for the given user. Only removes entries the
 * server confirms; anything enqueued during the flush stays queued. Verifies the
 * entry owner matches so one account never sends another's queue (C2).
 */
export async function flushQueue(
  userId: string,
  send: SendFn,
): Promise<{ sent: number; remaining: number }> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const queue = await load(userId);
    if (!queue.length) return { sent: 0, remaining: 0 };
    const sentIds = new Set<string>();
    let sent = 0;
    for (const entry of queue) {
      // Defensive: never send another account's message with these credentials.
      if (entry.userId !== userId) continue;
      try {
        await send(entry.input);
        sentIds.add(entry.clientTag);
        sent += 1;
      } catch {
        // Keep for the next flush; do not retry permanently-rejected sends here —
        // the caller decides what to queue (M2).
      }
    }
    // Remove only acknowledged IDs from the LATEST queue, preserving anything
    // enqueued while this flush was in flight (M1).
    const latest = await load(userId);
    const remaining = latest.filter((e) => !sentIds.has(e.clientTag));
    await save(userId, remaining);
    return { sent, remaining: remaining.length };
  })();
  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

let wiredUserId: string | null = null;
let unwireNetInfo: (() => void) | null = null;

/**
 * Hooks the queue to connectivity for one account. Call on sign-in; call
 * `unwireOfflineFlush()` on sign-out so a later account never replays this queue.
 */
export function wireOfflineFlush(userId: string, send: SendFn): void {
  unwireOfflineFlush();
  wiredUserId = userId;
  unwireNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false && wiredUserId === userId) {
      void flushQueue(userId, send);
    }
  });
  // Flush immediately in case we regained connectivity while the app was open.
  void flushQueue(userId, send);
}

/** Detach the connectivity listener (call on sign-out). */
export function unwireOfflineFlush(): void {
  wiredUserId = null;
  unwireNetInfo?.();
  unwireNetInfo = null;
}
