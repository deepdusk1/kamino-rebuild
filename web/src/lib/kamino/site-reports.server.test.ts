import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { closeSiteReport } from "./site-reports.server.ts";
import type { Sql } from "../db.ts";

test("report review keeps one decision and one audit across competing reviewers", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    await pg.exec(`create table reports(id bigint primary key,status text); create table platform_audit(id bigserial,actor_id text,action text,detail text);
      insert into reports values(1,'open'),(2,'open');`);
    const sql = { query: async (text: string, args: unknown[]) => (await pg.query(text, args)).rows } as unknown as Sql;
    const results = await Promise.allSettled([
      closeSiteReport(sql, "admin-a", { id: 1, status: "resolved", note: "Checked community records" }),
      closeSiteReport(sql, "admin-b", { id: 1, status: "dismissed", note: "Second decision" }),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected").length, 1);
    const audits = (await pg.query<{ actor_id: string; action: string; detail: string }>("select * from platform_audit")).rows;
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor_id, "admin-a");
    assert.equal(audits[0].action, "report.resolved");
    assert.deepEqual(JSON.parse(audits[0].detail), { reportId: 1, note: "Checked community records" });
    await assert.rejects(closeSiteReport(sql, "admin-b", { id: 999, status: "resolved", note: "" }), /no longer exists/);
    assert.equal((await pg.query("select * from platform_audit")).rows.length, 1);
  } finally { await pg.close(); }
});

test("failed audit rolls report closure back", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    await pg.exec(`create table reports(id bigint primary key,status text); create table platform_audit(id bigserial,actor_id text check(actor_id<>'rejected'),action text,detail text);
      insert into reports values(1,'open');`);
    const sql = { query: async (text: string, args: unknown[]) => (await pg.query(text, args)).rows } as unknown as Sql;
    await assert.rejects(closeSiteReport(sql, "rejected", { id: 1, status: "resolved", note: "" }));
    assert.equal((await pg.query<{ status: string }>("select status from reports where id=1")).rows[0].status, "open");
  } finally { await pg.close(); }
});
