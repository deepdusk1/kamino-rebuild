/**
 * "Online now" (server-only). Every signed-in request calls `touchPresence`, which records the time in
 * `profiles.last_seen_at` at most once a minute per person, so it costs almost nothing. Someone counts as
 * online when they were seen in the last five minutes AND they allow showing it (`show_online`).
 *
 * The write happens in the background: presence must never slow down or break the real request.
 */
import { getSql } from "@/lib/db";

const THROTTLE_MS = 60_000;
const lastTouch = new Map<string, number>();

export function touchPresence(userId: string | null | undefined, now: number = Date.now()): void {
  if (!userId || userId.startsWith("seed:")) return;
  if (now - (lastTouch.get(userId) ?? 0) < THROTTLE_MS) return;
  lastTouch.set(userId, now);
  // Forget people who have not been around for a while, so the map stays small.
  if (lastTouch.size > 50_000) {
    for (const [id, at] of lastTouch) if (now - at > 10 * THROTTLE_MS) lastTouch.delete(id);
  }
  void getSql()
    .then(async (sql) => {
      await sql`update profiles set last_seen_at = now() where user_id = ${userId}`;
      await sql`insert into daily_member_activity(user_id,active_on)
        select id,(now() at time zone 'UTC')::date from "user" where id=${userId}
        on conflict(user_id,active_on) do nothing`;
    })
    .catch(() => {
      lastTouch.delete(userId); // try again on the next request
    });
}
