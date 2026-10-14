import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { deleteMediaObject, parseMediaRef } from "./media-store.server.ts";

/** Use the caller's deletion transaction: a rollback must also roll back the cleanup intent. */
export async function stageMediaDeletion(sql: Sql, refs: Array<string | null | undefined>): Promise<number> {
  const valid = [...new Set(refs.filter((ref): ref is string => {
    if (!ref || ref.length > 2048) return false;
    const parsed = parseMediaRef(ref);
    return parsed !== null && parsed.key.length <= 1024;
  }))];
  let staged = 0;
  for (let start = 0; start < valid.length; start += 500) {
    const rows = await sql.query(`insert into media_deletion_queue(media_ref)
      select ref from unnest($1::text[]) as refs(ref)
      on conflict(media_ref) do nothing returning id`, [valid.slice(start, start + 500)]);
    staged += rows.length;
  }
  return staged;
}

type ClaimedObject = { id: number | string; media_ref: string; attempts: number };
export type MediaDeletionResult = { claimed: number; deleted: number; failed: number; stale: number };
export type MediaDeletionOptions = {
  /** Each run claims at most 50 objects; four workers keep it within the ten-minute lease. */
  limit?: number;
  /** Injectable for offline tests. Resolves only after successful deletion or confirmed absence. */
  deleteObject?: (ref: string) => Promise<void>;
  now?: Date;
};

/** Retry forever with bounded backoff. Missing storage settings never discard a pending reference. */
export async function processMediaDeletionQueue(sql: Sql, options: MediaDeletionOptions = {}): Promise<MediaDeletionResult> {
  const requested = options.limit ?? 20;
  const limit = Number.isFinite(requested) ? Math.min(50, Math.max(1, Math.floor(requested))) : 20;
  const now = options.now ?? new Date();
  const token = randomUUID();
  const leaseUntil = new Date(now.getTime() + 10 * 60_000);
  const rows = await sql.query<ClaimedObject>(`with due as (
    select id from media_deletion_queue
    where next_attempt_at <= $2::timestamptz and (lease_until is null or lease_until <= $2::timestamptz)
    order by next_attempt_at,id limit $1 for update skip locked
  ) update media_deletion_queue q set lease_token=$3::uuid,lease_until=$4::timestamptz,
    attempts=least(q.attempts,2147483646)+1 from due where q.id=due.id
    returning q.id,q.media_ref,q.attempts`, [limit, now.toISOString(), token, leaseUntil.toISOString()]);
  const result: MediaDeletionResult = { claimed: rows.length, deleted: 0, failed: 0, stale: 0 };
  const remove = options.deleteObject ?? deleteMediaObject;
  let position = 0;
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (position < rows.length) {
      const row = rows[position++];
      try {
        await remove(row.media_ref);
        // A reclaimed lease belongs to the new worker. A late old worker must not acknowledge it.
        const removed = await sql.query(`delete from media_deletion_queue where id=$1 and lease_token=$2::uuid returning id`, [row.id, token]);
        if (removed.length) result.deleted++;
        else result.stale++;
      } catch {
        const finishedAt = options.now ?? new Date();
        const delay = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(11, Math.max(0, Number(row.attempts) - 1)));
        // Do not store provider response bodies, credentials or caller-supplied error text.
        const retained = await sql.query(`update media_deletion_queue set lease_token=null,lease_until=null,
          next_attempt_at=$3::timestamptz,last_error='Object deletion failed; retry scheduled.'
          where id=$1 and lease_token=$2::uuid returning id`, [row.id, token, new Date(finishedAt.getTime() + delay).toISOString()]);
        if (retained.length) result.failed++;
        else result.stale++;
      }
    }
  }));
  return result;
}
