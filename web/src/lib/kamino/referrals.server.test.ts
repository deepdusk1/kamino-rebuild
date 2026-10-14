import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import {
  claimReferralForUser,
  ensureReferralCode,
  INVITED_REP,
  REFERRER_REP,
  referralPreview,
  referralStats,
} from "./referrals.server.ts";

const pg = new PGlite();
await pg.waitReady;
const directory = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(directory).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, directory), "utf8"));
after(() => pg.close());
function adapter(run: Sql["query"]) {
  const value = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
    run(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)) as Sql;
  value.query = run;
  return value;
}
const sql = adapter(async <T>(q: string, p: unknown[] = []) => (await pg.query<T>(q, p)).rows);
let sequence = 0;
async function person() {
  const id = `referral-${++sequence}`;
  await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${`${id}@example.test`},true)`;
  await sql`insert into profiles(user_id,handle,display_name,min_age_confirmed_at) values(${id},${id},${id},now())`;
  return id;
}
const rep = async (userId: string) =>
  Number((await sql`select rep from profiles where user_id=${userId}`)[0]!.rep);

test("a member gets one stable code, and a preview shows the referrer's name", async () => {
  const referrer = await person();
  const first = await ensureReferralCode(sql, referrer);
  const second = await ensureReferralCode(sql, referrer);
  assert.equal(first, second);
  assert.match(first, /^[A-HJ-NP-Z2-9]{8}$/);
  const preview = await referralPreview(sql, first);
  assert.deepEqual(preview, { valid: true, name: referrer });
  assert.deepEqual(await referralPreview(sql, "ZZZZZZZZ"), { valid: false });
});

test("claiming credits both sides once, and refuses own code, bad code and repeat claims", async () => {
  const referrer = await person();
  const invited = await person();
  const code = await ensureReferralCode(sql, referrer);
  const beforeReferrer = await rep(referrer);
  const beforeInvited = await rep(invited);

  const result = await claimReferralForUser(sql, invited, code);
  assert.equal(result.referrerName, referrer);
  assert.equal(result.repEarned, INVITED_REP);
  assert.equal(await rep(referrer), beforeReferrer + REFERRER_REP);
  assert.equal(await rep(invited), beforeInvited + INVITED_REP);
  assert.deepEqual(await referralStats(sql, referrer), {
    invited: 1,
    repEarned: REFERRER_REP,
    repPerInvite: REFERRER_REP,
    repForFriend: INVITED_REP,
  });

  await assert.rejects(() => claimReferralForUser(sql, invited, code), /already been referred/);
  const third = await person();
  await assert.rejects(() => claimReferralForUser(sql, third, "ZZZZZZZZ"), /not valid/);
  await assert.rejects(() => claimReferralForUser(sql, referrer, code), /own invite code/);
});

test("a second friend can use the same code, and stats count every successful referral", async () => {
  const referrer = await person();
  const code = await ensureReferralCode(sql, referrer);
  const friendA = await person();
  const friendB = await person();
  await claimReferralForUser(sql, friendA, code);
  await claimReferralForUser(sql, friendB, code);
  const stats = await referralStats(sql, referrer);
  assert.equal(stats.invited, 2);
  assert.equal(stats.repEarned, 2 * REFERRER_REP);
});

test("referrals keep the exporter honest: every referral row is attributable", async () => {
  const referrer = await person();
  const invited = await person();
  const code = await ensureReferralCode(sql, referrer);
  await claimReferralForUser(sql, invited, code);
  const rows = await sql`select referrer_id, invited_user_id from referrals`;
  assert.ok(rows.length >= 1);
  for (const row of rows) {
    assert.ok(row.referrer_id && row.invited_user_id);
    assert.notEqual(row.referrer_id, row.invited_user_id);
  }
});
