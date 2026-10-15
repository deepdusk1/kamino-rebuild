/**
 * Followers / following / friends lists, one page at a time. Tested in profile-lists.server.test.ts.
 *
 * Lists used to stop at 200 people with no way to see the rest. Now they come 50 at a time with a cursor (the last
 * row of the previous page). Banned or suspended accounts are left out.
 */
import type { Sql } from "../db.ts";

export type ListKind = "followers" | "following" | "friends";
type Row = Record<string, unknown>;

const SOURCES: Record<ListKind, string> = {
  followers: `select p.*, f.created_at as since from profile_follows f join profiles p on p.user_id = f.follower_id where f.followee_id = $1`,
  following: `select p.*, f.created_at as since from profile_follows f join profiles p on p.user_id = f.followee_id where f.follower_id = $1`,
  // Friends: people who follow each other.
  friends: `select p.*, a.created_at as since from profile_follows a
    join profile_follows b on b.follower_id = a.followee_id and b.followee_id = a.follower_id
    join profiles p on p.user_id = a.followee_id where a.follower_id = $1`,
};

/** Reads "2026-01-02T03:04:05.123Z|<user id>", or null when it isn't one. */
export function parseListCursor(cursor: string | null | undefined): { at: string; userId: string } | null {
  const m = typeof cursor === "string" ? /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\|(.{1,100})$/.exec(cursor) : null;
  if (!m || Number.isNaN(Date.parse(m[1]!))) return null;
  return { at: m[1]!, userId: m[2]! };
}

export async function followListPage(
  sql: Sql,
  ownerId: string,
  kind: ListKind,
  cursor: string | null | undefined,
  limit = 50,
): Promise<{ rows: Row[]; next: string | null }> {
  const params: unknown[] = [ownerId];
  let after = "";
  const from = parseListCursor(cursor);
  if (from) {
    params.push(from.at, from.userId);
    // Times are compared to the millisecond, the same precision the cursor carries, so no one is skipped.
    after = ` and (date_trunc('milliseconds', listed.since), listed.user_id) < ($2::timestamptz, $3::text)`;
  }
  const page = Math.max(1, Math.min(100, Math.trunc(limit)));
  const raw = await sql.query<Row>(
    `select * from (${SOURCES[kind]}) listed
     where not exists(select 1 from identity_account_status s where s.user_id = listed.user_id and s.status <> 'active' and (s.until is null or s.until > now()))
     ${after}
     order by date_trunc('milliseconds', listed.since) desc, listed.user_id desc
     limit ${page + 1}`,
    params,
  );
  const rows = raw.slice(0, page);
  const last = rows[rows.length - 1];
  const next = raw.length > page && last ? `${new Date(String(last.since instanceof Date ? last.since.toISOString() : last.since)).toISOString()}|${String(last.user_id)}` : null;
  return { rows, next };
}
