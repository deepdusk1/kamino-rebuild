import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import {
  readableProfileStory,
  storyAgeAllowed,
  profileStoryAccessSql,
} from "./profile-stories.server.ts";
const pg = new PGlite();
await pg.waitReady;
const directory = new URL("../../../migrations/", import.meta.url);
for (const f of readdirSync(directory)
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await pg.exec(readFileSync(new URL(f, directory), "utf8"));
after(() => pg.close());
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const q = strings.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, "");
  return (await pg.query(q, values)).rows;
}) as Sql;
sql.query = async <T>(q: string, v: unknown[] = []) => (await pg.query<T>(q, v)).rows;
let n = 0;
async function person(adult = true) {
  const id = `story-person-${++n}`;
  await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${`${id}@example.test`},true)`;
  await sql`insert into profiles(user_id,handle,display_name,min_age_confirmed_at,age_eligible_at_16,age_eligible_at_18) values(${id},${id},${id},now(),${adult ? "2000-01-01" : "2040-01-01"},${adult ? "2000-01-01" : "2040-01-01"})`;
  return id;
}
async function story(owner: string) {
  return Number(
    (
      await sql`insert into profile_stories(owner_id,caption) values(${owner},'A standalone story') returning id`
    )[0].id,
  );
}
test("expiry, highlights and hidden status share the same list and media predicate", async () => {
  const owner = await person(),
    viewer = await person(),
    id = await story(owner);
  assert.equal(Number((await readableProfileStory(sql, null, id)).id), id);
  await sql`update profile_stories set expires_at=now()-interval '1 hour' where id=${id}`;
  await assert.rejects(readableProfileStory(sql, viewer, id), /unavailable/);
  assert.equal(Number((await readableProfileStory(sql, owner, id)).id), id);
  await sql`update profile_stories set highlighted=true where id=${id}`;
  await readableProfileStory(sql, viewer, id);
  await sql`update profile_stories set hidden=true where id=${id}`;
  await assert.rejects(readableProfileStory(sql, viewer, id), /unavailable/);
  assert.equal(
    (
      await sql.query(
        `select s.id from profile_stories s where s.id=$2 and ${profileStoryAccessSql()}`,
        [viewer, id],
      )
    ).length,
    0,
  );
});
test("private profiles, followers, close friends, restriction and mutual blocks are enforced after access changes", async () => {
  const owner = await person(),
    viewer = await person(),
    id = await story(owner);
  await sql`update profiles set private_account=true where user_id=${owner}`;
  await assert.rejects(readableProfileStory(sql, viewer, id));
  await sql`insert into profile_follows(follower_id,followee_id) values(${viewer},${owner})`;
  await readableProfileStory(sql, viewer, id);
  await sql`update profile_stories set audience='close_friends' where id=${id}`;
  await assert.rejects(readableProfileStory(sql, viewer, id));
  await sql`insert into identity_relationships(user_id,target_user_id,kind) values(${owner},${viewer},'close_friend')`;
  await readableProfileStory(sql, viewer, id);
  await sql`insert into identity_relationships(user_id,target_user_id,kind) values(${owner},${viewer},'restrict')`;
  await assert.rejects(readableProfileStory(sql, viewer, id));
  await sql`delete from identity_relationships where user_id=${owner} and kind='restrict'`;
  await sql`insert into blocks(blocker_id,blocked_id) values(${owner},${viewer})`;
  await assert.rejects(readableProfileStory(sql, viewer, id));
  await sql`delete from blocks where blocker_id=${owner}`;
  await sql`insert into blocks(blocker_id,blocked_id) values(${viewer},${owner})`;
  await assert.rejects(readableProfileStory(sql, viewer, id));
});
test("adult rating, restricted mode, sensitive hiding and suspended authors never leak in story lists or playback", async () => {
  const owner = await person(),
    viewer = await person(),
    teen = await person(false),
    id = await story(owner);
  await sql`update profile_stories set minimum_age=18 where id=${id}`;
  await assert.rejects(readableProfileStory(sql, teen, id));
  await assert.rejects(readableProfileStory(sql, null, id));
  await assert.rejects(storyAgeAllowed(sql, teen, 18));
  await readableProfileStory(sql, viewer, id);
  await sql`update profiles set restricted_mode=true where user_id=${viewer}`;
  await assert.rejects(readableProfileStory(sql, viewer, id));
  await sql`update profiles set restricted_mode=false,sensitive_content='hide' where user_id=${viewer}`;
  await sql`update profile_stories set content_warning='Flashing lights' where id=${id}`;
  await assert.rejects(readableProfileStory(sql, viewer, id));
  await sql`update profiles set sensitive_content='blur' where user_id=${viewer}`;
  await readableProfileStory(sql, viewer, id);
  await sql`insert into identity_account_status(user_id,status,reason,actor_id) values(${owner},'suspended','Fixture',${owner})`;
  await assert.rejects(readableProfileStory(sql, viewer, id));
});
