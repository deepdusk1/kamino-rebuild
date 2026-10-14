import type { Sql } from "../db";

/** Library files are private unless an administrator has supplied a licensed music catalog entry. */
export async function readableLibraryMedia(sql: Sql, userId: string, libraryId: number) {
  const rows = await sql`select * from media_library where id=${libraryId} and (owner_id=${userId} or licensed=true)
    and not exists(select 1 from identity_account_status a where a.user_id=media_library.owner_id and a.status<>'active' and (a.until is null or a.until>now()))
    and not exists(select 1 from blocks b where (b.blocker_id=${userId} and b.blocked_id=media_library.owner_id) or (b.blocked_id=${userId} and b.blocker_id=media_library.owner_id))`;
  if (!rows.length) throw new Error("Library media unavailable.");
  return rows[0]!;
}
