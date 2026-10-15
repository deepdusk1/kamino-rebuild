import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Sql } from "../db";
import { rememberSearch } from "./search-history.server.ts";
import { containsPattern, prefixPattern } from "./search-text.ts";

const pg = new PGlite();
await pg.waitReady;
const migrations = new URL("../../../migrations/", import.meta.url);
// Also proves 0054 (search indexes) runs where pg_trgm isn't available.
for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
after(() => pg.close());
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
  (await pg.query(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)).rows) as Sql;
sql.query = async <T>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows;

const recent = async (userId: string) =>
  (await sql<{ query: string }>`select query from recent_searches where user_id = ${userId} order by at desc, id desc`).map((r) => r.query);

test("typing a search leaves one recent search, not one per pause", async () => {
  for (const q of ["mi", "mik", "mika"]) await rememberSearch(sql, "ana", q);
  assert.deepEqual(await recent("ana"), ["mika"]);
  await rememberSearch(sql, "ana", "#anime");
  await rememberSearch(sql, "ana", "Mika");
  assert.deepEqual(await recent("ana"), ["Mika", "#anime"], "a repeat moves to the top once");
});

test("older searches are not replaced by a new one that happens to share letters", async () => {
  await sql`insert into recent_searches (user_id, query, at) values ('ben', 'manga', now() - interval '1 day')`;
  await rememberSearch(sql, "ben", "mangaka");
  assert.deepEqual(await recent("ben"), ["mangaka", "manga"]);
});

test("only the newest 20 are kept, and one-letter searches are not saved", async () => {
  for (let i = 0; i < 25; i++) await sql`insert into recent_searches (user_id, query, at) values ('cleo', ${`old ${i}`}, now() - interval '1 day' + ${`${i} seconds`}::interval)`;
  await rememberSearch(sql, "cleo", "x");
  await rememberSearch(sql, "cleo", "#a");
  await rememberSearch(sql, "cleo", "fresh");
  const list = await recent("cleo");
  assert.equal(list.length, 20);
  assert.equal(list[0], "fresh");
  assert.equal(list.includes("x"), false);
});

test("escaped patterns find underscores and percent signs literally", async () => {
  await sql`insert into profiles (user_id, handle, display_name) values ('u1', 'neo_tokyo', 'Neo'), ('u2', 'neoxtokyo', 'Other'), ('u3', 'sale', '100% fun')`;
  const handles = async (pattern: string) =>
    (await sql<{ handle: string }>`select handle from profiles where handle ilike ${pattern} or display_name ilike ${pattern} order by handle`).map((r) => r.handle);
  assert.deepEqual(await handles(containsPattern("neo_")), ["neo_tokyo"], "_ is not 'any character'");
  assert.deepEqual(await handles(containsPattern("%")), ["sale"], "% is not 'anything'");
  assert.deepEqual(await handles(prefixPattern("NEO")), ["neo_tokyo", "neoxtokyo"]);
});
