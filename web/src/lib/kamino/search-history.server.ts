/**
 * "Recent searches". Search runs as you type, so the old code saved every pause: typing "mika" could leave "mi",
 * "mik" and "mika" in the list. Now a search replaces the ones it grew out of (or was shortened to) from the last few
 * minutes, repeats move to the top, and only the newest 20 are kept.
 */
import type { Sql } from "../db.ts";
import { supersedesRecent } from "./search-text.ts";

/** Searches made this close together count as one search being typed. */
const TYPING_WINDOW_MINUTES = 3;
const KEEP = 20;

export async function rememberSearch(sql: Sql, userId: string, query: string): Promise<void> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.replace(/^[#@]+/, "").length < 2) return;
  const recent = await sql.query<{ id: number; query: string; fresh: unknown }>(
    `select id, query, (at > now() - interval '${TYPING_WINDOW_MINUTES} minutes') as fresh from recent_searches where user_id = $1`,
    [userId],
  );
  const drop = recent
    .filter((r) => String(r.query).toLowerCase() === q.toLowerCase() || ((r.fresh === true || r.fresh === "t") && supersedesRecent(String(r.query), q)))
    .map((r) => Number(r.id));
  if (drop.length) await sql.query(`delete from recent_searches where user_id = $1 and id = any($2::int[])`, [userId, drop]);
  await sql.query(`insert into recent_searches (user_id, query) values ($1, $2)`, [userId, q]);
  await sql.query(
    `delete from recent_searches where user_id = $1 and id not in (select id from recent_searches where user_id = $1 order by at desc, id desc limit ${KEEP})`,
    [userId],
  );
}
