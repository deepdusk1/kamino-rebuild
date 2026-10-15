import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Sql } from "../db";
import { cleanClientTag, findTaggedMessage, insertChatMessage } from "./chat-send.server.ts";

const pg = new PGlite();
await pg.waitReady;
const migrations = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
after(() => pg.close());
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
  (await pg.query(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)).rows) as Sql;
sql.query = async <T>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows;

const room = Number(
  (await sql<{ id: number }>`insert into chat_rooms (name, kind, created_by) values ('dm', 'dm', 'ana') returning id`)[0]!.id,
);
const send = (userId: string, clientTag: string | null, body = "hi") =>
  insertChatMessage(sql, { roomId: room, userId, body, replyTo: null, clientTag });
const count = async (userId: string) =>
  Number((await sql<{ n: number }>`select count(*)::int as n from messages where author_user_id = ${userId}`)[0]!.n);

test("tags must be plain short ids", () => {
  assert.equal(cleanClientTag("lz3k1-ab12cd"), "lz3k1-ab12cd");
  assert.equal(cleanClientTag("bad tag!"), null);
  assert.equal(cleanClientTag(42), null);
  assert.equal(cleanClientTag("x".repeat(80))?.length, 64);
});

test("a retry with the same tag returns the first message instead of posting a second copy", async () => {
  const first = await send("ana", "tag-retry");
  const again = await send("ana", "tag-retry", "hi (sent again)");
  assert.equal(again.duplicate, true);
  assert.equal(again.id, first.id);
  assert.equal(await findTaggedMessage(sql, "ana", "tag-retry"), first.id);
  assert.equal(await count("ana"), 1);
});

test("two retries at the same moment still save one message", async () => {
  const [a, b] = await Promise.all([send("ben", "tag-race"), send("ben", "tag-race")]);
  assert.equal(a.id, b.id);
  assert.equal([a, b].filter((r) => r.duplicate).length, 1);
  assert.equal(await count("ben"), 1);
});

test("tags are per person: someone else's identical tag is a different message", async () => {
  const mine = await send("cleo", "shared-tag");
  const theirs = await send("dev", "shared-tag");
  assert.notEqual(mine.id, theirs.id);
  assert.equal(theirs.duplicate, false);
});

test("untagged messages are never treated as duplicates", async () => {
  const a = await send("eve", null);
  const b = await send("eve", null);
  assert.notEqual(a.id, b.id);
});
