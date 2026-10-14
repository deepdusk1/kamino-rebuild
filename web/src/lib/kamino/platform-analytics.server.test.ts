import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { collectPlatformAnalytics } from "./platform-analytics.server.ts";

test("activity metrics count real distinct accounts with exact UTC windows and hide small retention cohorts", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
    return (await pg.query(query, values)).rows;
  }) as Sql;
  try {
    await pg.exec(`create table "user"(id text primary key);create table profiles(user_id text primary key,created_at timestamptz);
      create table daily_member_activity(user_id text,active_on date,primary key(user_id,active_on));
      insert into "user" values('first'),('second'),('seed:demo');
      insert into profiles values('first',now()-interval '20 days'),('second',now()),('seed:demo',now());
      insert into daily_member_activity values('first',(now() at time zone 'UTC')::date),('second',(now() at time zone 'UTC')::date-6),('first',(now() at time zone 'UTC')::date-10),('seed:demo',(now() at time zone 'UTC')::date),('second',(now() at time zone 'UTC')::date+1);
      insert into daily_member_activity values('first',(now() at time zone 'UTC')::date) on conflict do nothing;`);
    let result = await collectPlatformAnalytics(sql);
    assert.deepEqual(result.metrics, { members: 2, dau: 1, wau: 2, mau: 2, newMembers7: 1 });
    assert.equal(result.activity.length, 30);
    assert.equal(result.activity.at(-1)?.activeMembers, 1);
    assert.ok(
      result.cohorts.every(
        (c) => c.members === null && c.retention7 === null && c.retention30 === null,
      ),
    );
    // A mature cohort of five: two return within days 7–13, one within days 30–36.
    for (let i = 0; i < 5; i++) {
      await pg.query('insert into "user" values($1)', [`cohort-${i}`]);
      await pg.query("insert into profiles values($1,now()-interval '45 days')", [`cohort-${i}`]);
    }
    await pg.exec(
      `insert into daily_member_activity values('cohort-0',(now() at time zone 'UTC')::date-38),('cohort-1',(now() at time zone 'UTC')::date-32),('cohort-2',(now() at time zone 'UTC')::date-31),('cohort-0',(now() at time zone 'UTC')::date-15),('cohort-3',(now() at time zone 'UTC')::date-8);`,
    );
    result = await collectPlatformAnalytics(sql);
    const cohort = result.cohorts.find((c) => c.members === 5);
    assert.ok(cohort);
    assert.equal(cohort.eligible7, 5);
    assert.equal(cohort.retained7, 2);
    assert.equal(cohort.retention7, 40);
    assert.equal(cohort.eligible30, 5);
    assert.equal(cohort.retained30, 1);
    assert.equal(cohort.retention30, 20);
  } finally {
    await pg.close();
  }
});
