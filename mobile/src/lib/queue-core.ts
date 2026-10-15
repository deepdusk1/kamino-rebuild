/**
 * The rules of the offline message queue, without any phone APIs (so they can be unit-tested).
 * Storage and the network live in ./offline-queue.ts.
 */
export type QueuedMessage = {
  clientTag: string;
  userId: string;
  input: { roomId: number; body: string; replyTo?: number | null; clientTag: string };
  queuedAt: number;
  /** Set when the server refused the message for good (blocked, removed from the room, rejected text…). */
  failed?: string;
};

/** Network trouble, timeouts, rate limits and server hiccups are worth retrying; anything else is a real "no". */
export function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return true;
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

export type FlushResult = { sent: Set<string>; failed: Map<string, string> };

/**
 * Sends waiting messages oldest first. Stops at the first temporary failure, so a later message never arrives
 * before an earlier one. A message the server refuses for good is marked failed (and skipped from then on) instead
 * of being retried forever.
 */
export async function flushEntries(
  queue: QueuedMessage[],
  userId: string,
  send: (input: QueuedMessage["input"]) => Promise<unknown>,
): Promise<FlushResult> {
  const result: FlushResult = { sent: new Set(), failed: new Map() };
  for (const entry of queue) {
    // Never send another account's message with these credentials.
    if (entry.userId !== userId || entry.failed) continue;
    try {
      await send(entry.input);
      result.sent.add(entry.clientTag);
    } catch (error) {
      if (isRetryable(error)) break;
      result.failed.set(entry.clientTag, error instanceof Error && error.message ? error.message : "Not sent.");
    }
  }
  return result;
}

/** Applies a flush to the latest saved queue, keeping anything added while the flush was running. */
export function applyFlush(latest: QueuedMessage[], result: FlushResult): QueuedMessage[] {
  return latest
    .filter((entry) => !result.sent.has(entry.clientTag))
    .map((entry) => (result.failed.has(entry.clientTag) ? { ...entry, failed: result.failed.get(entry.clientTag) } : entry));
}

/** This room's waiting and failed messages, oldest first. */
export function entriesForRoom(queue: QueuedMessage[], userId: string, roomId: number): QueuedMessage[] {
  return queue.filter((entry) => entry.userId === userId && entry.input.roomId === roomId);
}
