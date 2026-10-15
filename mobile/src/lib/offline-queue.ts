import NetInfo from "@react-native-community/netinfo";
import { deleteAsync, documentDirectory, readAsStringAsync, writeAsStringAsync } from "expo-file-system/legacy";
import { deleteSecret, readSecret } from "@/auth/storage";
import { applyFlush, entriesForRoom, flushEntries, type QueuedMessage } from "./queue-core";

export type { QueuedMessage } from "./queue-core";

/**
 * Offline message queue: when a chat message can't reach the server, it waits here and is sent automatically when
 * the phone is back online. The rules (ordering, which failures are retried) are in ./queue-core.ts.
 *
 * - Each account has its own queue file, and a flush only ever sends the signed-in account's messages.
 * - Every message keeps the tag it got before its first attempt, so the server never saves it twice.
 * - One flush runs at a time; only messages the server confirmed are removed.
 * - Messages the server refuses for good are kept as "failed" so the chat can show them (retry or delete).
 *
 * Stored as a file in the app's private documents folder. (It used to be in SecureStore, which on Android is only
 * meant for values under 2 KB: a few queued messages were enough to lose the whole queue.)
 */
const LEGACY_KEY_PREFIX = "kamino.offline-queue.";
const MAX_QUEUE = 100;

let listeners: ((count: number) => void)[] = [];

function emit(queue: QueuedMessage[]) {
  for (const listener of listeners) listener(queue.length);
}

/** Called whenever the queue changes (a message added, sent, failed or removed). */
export function onQueueChange(listener: (count: number) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

function fileFor(userId: string): string | null {
  if (!documentDirectory) return null;
  return `${documentDirectory}kamino-offline-queue-${userId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
}

async function load(userId: string): Promise<QueuedMessage[]> {
  const file = fileFor(userId);
  try {
    if (file) {
      const raw = await readAsStringAsync(file).catch(() => null);
      if (raw) return JSON.parse(raw) as QueuedMessage[];
    }
    // One-time move from the old SecureStore location.
    const legacy = await readSecret(`${LEGACY_KEY_PREFIX}${userId}`);
    if (legacy) {
      const queue = JSON.parse(legacy) as QueuedMessage[];
      await save(userId, queue, false);
      await deleteSecret(`${LEGACY_KEY_PREFIX}${userId}`);
      return queue;
    }
  } catch {
    // An unreadable file is treated as empty rather than blocking chat.
  }
  return [];
}

async function save(userId: string, queue: QueuedMessage[], notify = true): Promise<void> {
  const kept = queue.slice(-MAX_QUEUE);
  const file = fileFor(userId);
  if (file) {
    try {
      if (kept.length) await writeAsStringAsync(file, JSON.stringify(kept));
      else await deleteAsync(file, { idempotent: true });
    } catch {
      // Storage full or unavailable: the message stays in this session only.
    }
  }
  if (notify) emit(kept);
}

/** Allocate a stable client tag before the first send attempt. Reuse it on every retry. */
export function newClientTag(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queuedCount(userId: string): Promise<number> {
  return (await load(userId)).filter((e) => !e.failed).length;
}

/** This room's messages that are waiting to send or failed, oldest first (shown at the end of the chat). */
export async function queuedForRoom(userId: string, roomId: number): Promise<QueuedMessage[]> {
  return entriesForRoom(await load(userId), userId, roomId);
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
  await save(userId, [...queue.filter((e) => e.clientTag !== clientTag), entry]);
  return entry;
}

/** Puts a failed message back in line to be sent again (same tag, so it can never be saved twice). */
export async function retryQueued(userId: string, clientTag: string): Promise<void> {
  const queue = await load(userId);
  await save(
    userId,
    queue.map((e) => (e.clientTag === clientTag ? { ...e, failed: undefined } : e)),
  );
}

/** Removes one waiting or failed message. */
export async function discardQueued(userId: string, clientTag: string): Promise<void> {
  const queue = await load(userId);
  await save(userId, queue.filter((e) => e.clientTag !== clientTag));
}

/** Remove a user's queued messages (sign-out, account deletion). */
export async function clearQueue(userId: string): Promise<void> {
  await save(userId, []);
  await deleteSecret(`${LEGACY_KEY_PREFIX}${userId}`);
}

export type SendFn = (input: QueuedMessage["input"]) => Promise<unknown>;

/** One flush at a time; concurrent triggers wait for the active one. */
let flushInFlight: Promise<{ sent: number; remaining: number }> | null = null;

/** Sends this user's waiting messages in order (see flushEntries for the rules). */
export async function flushQueue(userId: string, send: SendFn): Promise<{ sent: number; remaining: number }> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const queue = await load(userId);
    if (!queue.some((e) => !e.failed)) return { sent: 0, remaining: queue.length };
    const result = await flushEntries(queue, userId, send);
    // Applied to the LATEST queue, so messages added during the flush are kept.
    const next = applyFlush(await load(userId), result);
    await save(userId, next);
    return { sent: result.sent.size, remaining: next.length };
  })();
  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

let wiredUserId: string | null = null;
let wiredSend: SendFn | null = null;
let unwireNetInfo: (() => void) | null = null;

/**
 * Hooks the queue to connectivity for one account. Call on sign-in; call `unwireOfflineFlush()` on sign-out so a
 * later account never replays this queue.
 */
export function wireOfflineFlush(userId: string, send: SendFn): void {
  unwireOfflineFlush();
  wiredUserId = userId;
  wiredSend = send;
  unwireNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false && wiredUserId === userId) {
      void flushQueue(userId, send);
    }
  });
  // Flush now in case we came back online while the app was closed.
  void flushQueue(userId, send);
}

/** Tries to send waiting messages right away (e.g. after the person taps "Try again"). */
export function flushNow(): void {
  if (wiredUserId && wiredSend) void flushQueue(wiredUserId, wiredSend);
}

/** Detach the connectivity listener (call on sign-out). */
export function unwireOfflineFlush(): void {
  wiredUserId = null;
  wiredSend = null;
  unwireNetInfo?.();
  unwireNetInfo = null;
}
