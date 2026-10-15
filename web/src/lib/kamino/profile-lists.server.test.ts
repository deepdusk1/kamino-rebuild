import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Sql } from "../db";
import { followListPage, parseListCursor } from "./profile-lists.server.ts";

const pg = new PGlite();
await pg.waitReady;
const migrations = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
after(() => pg.close());
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
  (await pg.query(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)).rows) as Sql;
sql.query = async <T>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows;

await sql`insert into profiles (user_id, handle, display_name) values ('star', 'star', 'Star')`;
// 120 followers; ten of them in the same millisecond (bulk follows) to check nobody is skipped between pages.
for (let i = 0; i < 120; i++) {
  const id = `fan${String(i).padStart(3, "0")}`;
  await sql`insert into profiles (user_id, handle, display_name) values (${id}, ${id}, ${id})`;
  const at = i < 10 ? "2026-05-01T10:00:00.123456Z" : new Date(Date.UTC(2026, 4, 2) + i * 60_000).toISOString();
  await sql`insert into profile_follows (follower_id, followee_id, created_at) values (${id}, 'star', ${at}::timestamptz)`;
}
// A suspended follower is left out.
await sql`insert into identity_account_status (user_id, status, reason, actor_id) values ('fan050', 'suspended', 'spam', 'admin')`;

test("cursors are read safely", () => {
  assert.deepEqual(parseListCursor("2026-05-01T10:00:00.123Z|fan001"), { at: "2026-05-01T10:00:00.123Z", userId: "fan001" });
  assert.equal(parseListCursor("nonsense"), null);
  assert.equal(parseListCursor(null), null);
});

test("followers come 50 at a time and every one is listed exactly once", async () => {
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await followListPage(sql, "star", "followers", cursor);
    seen.push(...page.rows.map((r) => String(r.user_id)));
    cursor = page.next;
    pages += 1;
  } while (cursor && pages < 10);
  assert.equal(pages, 3, "50 + 50 + 19");
  assert.equal(seen.length, 119, "the suspended follower is left out");
  assert.equal(new Set(seen).size, 119, "no one twice");
  assert.equal(seen.includes("fan050"), false);
  assert.equal(seen[0], "fan119", "newest first");
});

test("friends are people who follow each other", async () => {
  await sql`insert into profile_follows (follower_id, followee_id) values ('star', 'fan001'), ('star', 'fan002')`;
  const friends = await followListPage(sql, "star", "friends", null);
  assert.deepEqual(friends.rows.map((r) => r.user_id).sort(), ["fan001", "fan002"]);
  const following = await followListPage(sql, "star", "following", null);
  assert.equal(following.rows.length, 2);
  assert.equal(following.next, null);
});
