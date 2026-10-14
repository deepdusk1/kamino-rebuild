import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import { stageMediaDeletion, processMediaDeletionQueue } from "./media-deletion.server.ts";

const migration = await readFile(new URL("../../../migrations/0038_media_deletion.sql", import.meta.url), "utf8");
const ref = (key: string) => `s3:post/${key}|image/png`;
const now = new Date("2030-01-01T00:00:00Z");
const adapter = (pg: Pick<PGlite, "query">) => ({
  query: async (text: string, params: unknown[] = []) => (await pg.query(text, params)).rows,
}) as unknown as Sql;
async function fixture(work: (pg: PGlite, sql: Sql) => Promise<void>) {
  const pg = new PGlite();
  await pg.waitReady;
  try { await pg.exec(migration); await work(pg, adapter(pg)); }
  finally { await pg.close(); }
}

test("staging queues only valid external refs once, without an account identifier", async () => {
  await fixture(async (pg, sql) => {
    assert.equal(await stageMediaDeletion(sql, [ref("one"), ref("one"), null, undefined,
      "data:image/png;base64,AAAA", "s3:../secret|image/png", "s3:bad|invalid", ref("x".repeat(1025))]), 1);
    assert.equal(await stageMediaDeletion(sql, [ref("one")]), 0);
    const rows = (await pg.query<{ media_ref: string; attempts: number }>("select * from media_deletion_queue")).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].media_ref, ref("one")); assert.equal(rows[0].attempts, 0);
    const columns = (await pg.query<{ column_name: string }>("select column_name from information_schema.columns where table_name='media_deletion_queue'")).rows;
    assert.equal(columns.some(c => /user|account|owner/.test(c.column_name)), false);
  });
});

test("cleanup intent and content deletion roll back together", async () => {
  await fixture(async (pg) => {
    await pg.exec("create table private_content(id int primary key,media_ref text); insert into private_content values(1,'s3:post/one|image/png');");
    await assert.rejects(pg.transaction(async tx => {
      const sql = adapter(tx);
      await stageMediaDeletion(sql, [ref("one")]);
      await sql.query("delete from private_content where id=1");
      throw new Error("Abort deletion");
    }), /Abort deletion/);
    assert.equal((await pg.query("select * from private_content")).rows.length, 1);
    assert.equal((await pg.query("select * from media_deletion_queue")).rows.length, 0);
    await pg.transaction(async tx => {
      const sql = adapter(tx); await stageMediaDeletion(sql, [ref("one")]);
      await sql.query("delete from private_content where id=1");
    });
    assert.equal((await pg.query("select * from private_content")).rows.length, 0);
    assert.equal((await pg.query("select * from media_deletion_queue")).rows.length, 1);
  });
});

test("provider failures retain refs, back off, and complete only after confirmed deletion", async () => {
  await fixture(async (pg, sql) => {
    await stageMediaDeletion(sql, [ref("retry")]);
    let calls = 0;
    const fail = async () => { calls++; throw new Error("secret response body must not be saved"); };
    assert.deepEqual(await processMediaDeletionQueue(sql, { now, deleteObject: fail }), { claimed: 1, deleted: 0, failed: 1, stale: 0 });
    let row = (await pg.query<{ media_ref: string; next_attempt_at: Date; last_error: string; attempts: number; lease_token: string | null }>("select * from media_deletion_queue")).rows[0];
    assert.equal(row.media_ref, ref("retry")); assert.equal(row.attempts, 1); assert.equal(row.lease_token, null);
    assert.equal(row.next_attempt_at.getTime(), now.getTime() + 60_000);
    assert.doesNotMatch(row.last_error, /secret/);
    assert.equal((await processMediaDeletionQueue(sql, { now: new Date(now.getTime() + 59_999), deleteObject: fail })).claimed, 0);
    assert.equal(calls, 1);
    await processMediaDeletionQueue(sql, { now: new Date(now.getTime() + 60_000), deleteObject: fail });
    row = (await pg.query<typeof row>("select * from media_deletion_queue")).rows[0];
    assert.equal(row.attempts, 2); assert.equal(row.next_attempt_at.getTime(), now.getTime() + 180_000);
    assert.deepEqual(await processMediaDeletionQueue(sql, { now: new Date(now.getTime() + 180_000), deleteObject: async value => { assert.equal(value, ref("retry")); } }), { claimed: 1, deleted: 1, failed: 0, stale: 0 });
    assert.equal((await pg.query("select * from media_deletion_queue")).rows.length, 0);
  });
});

test("missing storage configuration retains the queued object without contacting a provider", async () => {
  const keys = ["KAMINO_S3_ENDPOINT", "KAMINO_S3_BUCKET", "KAMINO_S3_ACCESS_KEY_ID", "KAMINO_S3_SECRET_ACCESS_KEY"];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  let requested = false;
  try {
    for (const key of keys) delete process.env[key];
    globalThis.fetch = async () => { requested = true; throw new Error("External calls prohibited"); };
    await fixture(async (pg, sql) => {
      await stageMediaDeletion(sql, [ref("unconfigured")]);
      assert.deepEqual(await processMediaDeletionQueue(sql, { now }), { claimed: 1, deleted: 0, failed: 1, stale: 0 });
      const rows = (await pg.query<{ media_ref: string; attempts: number }>("select * from media_deletion_queue")).rows;
      assert.equal(rows[0].media_ref, ref("unconfigured")); assert.equal(rows[0].attempts, 1);
    });
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("concurrent workers lease disjoint bounded batches", async () => {
  await fixture(async (pg, sql) => {
    await stageMediaDeletion(sql, Array.from({ length: 9 }, (_, i) => ref(`parallel-${i}`)));
    const calls = new Map<string, number>();
    let unblock!: () => void, entered!: () => void;
    const blocked = new Promise<void>(resolve => { unblock = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const first = processMediaDeletionQueue(sql, { limit: 6, now, deleteObject: async value => {
      calls.set(value, (calls.get(value) ?? 0) + 1); entered(); await blocked;
    } });
    await started;
    const second = await processMediaDeletionQueue(sql, { limit: 6, now, deleteObject: async value => {
      calls.set(value, (calls.get(value) ?? 0) + 1);
    } });
    assert.equal(second.claimed, 3); assert.equal(second.deleted, 3);
    unblock(); assert.equal((await first).deleted, 6);
    assert.equal(calls.size, 9); assert.ok([...calls.values()].every(count => count === 1));
    assert.equal((await pg.query("select * from media_deletion_queue")).rows.length, 0);
  });
});

test("expired leases are reclaimed and late workers cannot clear another worker's retry", async () => {
  await fixture(async (pg, sql) => {
    await stageMediaDeletion(sql, [ref("crash")]);
    let release!: () => void, entered!: () => void;
    const pause = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const oldWorker = processMediaDeletionQueue(sql, { now, deleteObject: async () => { entered(); await pause; } });
    await started;
    assert.equal((await processMediaDeletionQueue(sql, { now: new Date(now.getTime() + 599_999), deleteObject: async () => { throw new Error("must not be called"); } })).claimed, 0);
    const recovered = await processMediaDeletionQueue(sql, { now: new Date(now.getTime() + 600_000), deleteObject: async () => { throw new Error("provider unavailable"); } });
    assert.equal(recovered.failed, 1);
    release(); assert.equal((await oldWorker).stale, 1);
    const row = (await pg.query<{ attempts: number; media_ref: string }>("select * from media_deletion_queue")).rows[0];
    assert.equal(row.attempts, 2); assert.equal(row.media_ref, ref("crash"));
    assert.equal((await processMediaDeletionQueue(sql, { now: new Date(now.getTime() + 720_000), deleteObject: async () => {} })).deleted, 1);
  });
});

test("a worker never claims more than fifty objects and retry delay is capped", async () => {
  await fixture(async (pg, sql) => {
    await stageMediaDeletion(sql, Array.from({ length: 52 }, (_, i) => ref(`bound-${i}`)));
    await pg.exec("update media_deletion_queue set attempts=99");
    const result = await processMediaDeletionQueue(sql, { limit: 9999, now, deleteObject: async () => { throw new Error("retry"); } });
    assert.equal(result.claimed, 50); assert.equal(result.failed, 50);
    const delayed = (await pg.query<{ next_attempt_at: Date }>("select next_attempt_at from media_deletion_queue where attempts=100")).rows;
    assert.equal(delayed.length, 50); assert.ok(delayed.every(r => r.next_attempt_at.getTime() === now.getTime() + 86_400_000));
    assert.equal((await processMediaDeletionQueue(sql, { now, deleteObject: async () => {} })).deleted, 2);
  });
});
