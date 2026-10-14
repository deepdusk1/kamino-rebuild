/**
 * Abuse throttling (server-only).
 *
 * Two layers, both counted per signed-in person:
 *   1. A general budget on every call (`overallBudget`), so a runaway script or a stuck retry
 *      loop cannot hammer the database.
 *   2. A tighter limit on actions that can be used to spam other people (`spamGuard`):
 *      posting, commenting, messaging, reporting, creating communities and so on.
 *
 * It is a sliding window kept in this server's memory. That is exactly right for one server
 * (what the Render blueprint runs). If you ever run several copies of the server, each keeps its
 * own count, which only makes the limits a little more generous.
 *
 * Set KAMINO_RATE_LIMIT=off to switch it off (the automatic tests do this for their bulk set-up).
 */

export class RateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`You're doing that too fast. Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"} and try again.`);
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "RateLimitError";
  }
}

/** How many times each spam-prone action may happen in a window. */
export const POLICIES = {
  post: { limit: 12, windowMs: 60_000 },
  comment: { limit: 25, windowMs: 60_000 },
  message: { limit: 45, windowMs: 60_000 },
  report: { limit: 10, windowMs: 60_000 },
  community: { limit: 6, windowMs: 3_600_000 },
  follow: { limit: 60, windowMs: 60_000 },
  invite: { limit: 30, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 60_000 },
  /** Asking the AI storyteller for something (it has a small free daily allowance shared by everyone). */
  ai: { limit: 30, windowMs: 3_600_000 },
  /** WebRTC signaling (roster polls plus offer/answer/ICE relay). Normal calls stay well under this. */
  rtc: { limit: 240, windowMs: 60_000 },
} as const;

export type PolicyName = keyof typeof POLICIES;

/** Any signed-in person: calls per minute across the whole app. */
const OVERALL = { limit: 600, windowMs: 60_000 };

const hitsByKey = new Map<string, number[]>();
let lastSweep = Date.now();

function disabled(): boolean {
  return /^(off|0|false|no)$/i.test(process.env.KAMINO_RATE_LIMIT ?? "");
}

/** Forget keys nobody has used for a while, so the map cannot grow forever. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hits] of hitsByKey) {
    if (!hits.length || now - hits[hits.length - 1]! > 3_600_000) hitsByKey.delete(key);
  }
}

/**
 * Records one hit and returns how many seconds to wait if the key is over its limit
 * (0 when it is fine). A refused hit is NOT counted, so waiting really does help.
 */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): number {
  sweep(now);
  const recent = (hitsByKey.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hitsByKey.set(key, recent);
    return Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000));
  }
  recent.push(now);
  hitsByKey.set(key, recent);
  return 0;
}

/** Throws a 429 when `userId` is making calls too quickly overall. */
export function overallBudget(userId: string) {
  if (disabled()) return;
  const wait = hit(`all:${userId}`, OVERALL.limit, OVERALL.windowMs);
  if (wait) throw new RateLimitError(wait);
}

/** Throws a 429 when `userId` repeats one spam-prone action too quickly. */
export function spamGuard(userId: string, action: PolicyName) {
  if (disabled()) return;
  const { limit, windowMs } = POLICIES[action];
  const wait = hit(`${action}:${userId}`, limit, windowMs);
  if (wait) throw new RateLimitError(wait);
}

/** For tests: forget everything. */
export function resetRateLimits() {
  hitsByKey.clear();
}
