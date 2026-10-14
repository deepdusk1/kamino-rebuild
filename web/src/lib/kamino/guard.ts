import type { PolicyName } from "./rate-limit.server";

/**
 * Call at the top of a server function that people could use to spam others
 * (posting, commenting, messaging...). Throws a friendly "too fast" error (HTTP 429) when someone
 * repeats the action too quickly. The limiter itself lives in `rate-limit.server.ts`; it is loaded
 * on demand so it never ends up in the browser's code.
 */
export async function guard(userId: string, action: PolicyName): Promise<void> {
  const { spamGuard } = await import("./rate-limit.server");
  spamGuard(userId, action);
}
