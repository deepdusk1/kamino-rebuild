/**
 * Saving a new chat message exactly once.
 *
 * The phone app tags every message (`clientTag`) before its first attempt and reuses the tag when it retries (after
 * a timeout, or from the offline queue). The same tag from the same person always means the same message, so a
 * retry returns the message that was already saved instead of posting it twice, even when two retries arrive at
 * the same moment (the unique index decides; see migrations/0051_chat_fixes.sql).
 */
import type { Sql } from "../db.ts";

/** A usable tag (letters, digits, `_` and `-`, at most 64), or null. */
export function cleanClientTag(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const t = tag.slice(0, 64);
  return /^[A-Za-z0-9_-]+$/.test(t) ? t : null;
}

/** The message this person already saved with this tag, if any. */
export async function findTaggedMessage(sql: Sql, userId: string, tag: string | null): Promise<number | null> {
  if (!tag) return null;
  const row = (
    await sql.query<{ id: number }>(`select id from messages where author_user_id = $1 and client_tag = $2`, [userId, tag])
  )[0];
  return row ? Number(row.id) : null;
}

/**
 * Inserts the message (held until moderation has looked at it). Returns `duplicate: true` with the existing id when
 * the same tag was saved first by a parallel retry.
 */
export async function insertChatMessage(
  sql: Sql,
  input: { roomId: number; userId: string; body: string; replyTo: number | null; clientTag: string | null },
): Promise<{ id: number; duplicate: boolean }> {
  const rows = await sql.query<{ id: number }>(
    `insert into messages (room_id, author_user_id, body, reply_to, held, client_tag)
     values ($1, $2, $3, $4, true, $5)
     on conflict (author_user_id, client_tag) where client_tag is not null do nothing
     returning id`,
    [input.roomId, input.userId, input.body, input.replyTo, input.clientTag],
  );
  if (rows[0]) return { id: Number(rows[0].id), duplicate: false };
  const existing = await findTaggedMessage(sql, input.userId, input.clientTag);
  if (existing === null) throw new Error("The message could not be saved. Please try again.");
  return { id: existing, duplicate: true };
}
