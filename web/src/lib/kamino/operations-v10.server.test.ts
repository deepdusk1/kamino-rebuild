import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import {
  consumeExperiment,
  convertExperiment,
  seasonProgress,
  claimCollectible,
  decideCase,
  decideCaseAppeal,
  makeAppealProof,
  readAppealProof,
} from "./operations-v10.server.ts";
import {
  processPushDeliveries,
  processEmailDigests,
  enqueueWeeklyDigest,
} from "./delivery-v10.server.ts";
import { sendPush } from "./push.server.ts";

const pg = new PGlite();
await pg.waitReady;
const directory = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(directory)
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await pg.exec(readFileSync(new URL(file, directory), "utf8"));
after(() => pg.close());
function adapter(run: Sql["query"]) {
  const value = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
    run(
      strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""),
      values,
    )) as Sql;
  value.query = run;
  return value;
}
const sql = adapter(async <T>(q: string, p: unknown[] = []) => (await pg.query<T>(q, p)).rows);
sql.transaction = (work) =>
  pg.transaction((tx) =>
    work(adapter(async <T>(q: string, p: unknown[] = []) => (await tx.query<T>(q, p)).rows)),
  );
let sequence = 0;
async function person() {
  const id = `operations-${++sequence}`;
  await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${`${id}@example.test`},true)`;
  await sql`insert into profiles(user_id,handle,display_name,min_age_confirmed_at) values(${id},${id},${id},now())`;
  return id;
}
async function pushFixture() {
  const userId = await person(),
    token = `ExpoPushToken[token-${sequence}]`;
  await sql`insert into push_tokens(token,user_id) values(${token},${userId})`;
  await sql`insert into notifications(user_id,kind,title,body,href) values(${userId},'chat','OTHER_PRIVATE_NAME','OTHER_PRIVATE_MESSAGE','/chats/1')`;
  await sendPush(sql, userId, {
    title: "OTHER_PRIVATE_NAME",
    body: "OTHER_PRIVATE_MESSAGE",
    href: "/chats/1",
  });
  return { userId, token };
}
const allow = async () => "allow" as const;
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
const request = (fn: (url: string, init: RequestInit) => Promise<Response>) => fn as typeof fetch;
async function clearQueues() {
  await sql`delete from push_delivery_queue`;
  await sql`delete from email_digest_queue`;
}

test("operation schema is rerunnable and queue stores references without private copied content", async () => {
  await pg.exec(readFileSync(new URL("0041_operations_v10.sql", directory), "utf8"));
  await clearQueues();
  const p = await pushFixture();
  await sendPush(sql, p.userId, {
    title: "OTHER_PRIVATE_NAME",
    body: "OTHER_PRIVATE_MESSAGE",
    href: "/chats/1",
  });
  const rows = await sql`select * from push_delivery_queue`;
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes("OTHER_PRIVATE"));
  const columns =
    await sql`select column_name from information_schema.columns where table_name='push_delivery_queue'`;
  assert.ok(
    !columns.some((c) => ["title", "body", "email", "storage_ref"].includes(String(c.column_name))),
  );
});
test("push tickets remain pending provider confirmation, payload hides names and private text", async () => {
  await clearQueues();
  await pushFixture();
  const now = new Date();
  let sentBody = "";
  const first = await processPushDeliveries(sql, {
    now,
    allowed: allow,
    request: request(async (_url, init) => {
      sentBody = String(init.body);
      return reply([{ status: "ok", id: "ticket-first" }]);
    }),
  });
  assert.equal(first.sent, 1);
  assert.equal(first.delivered, 0);
  assert.ok(!sentBody.includes("OTHER_PRIVATE"));
  assert.match(sentBody, /Open Kamino/);
  assert.equal((await sql`select status from push_delivery_queue`)[0].status, "receipt");
  const second = await processPushDeliveries(sql, {
    now: new Date(now.getTime() + 16 * 60000),
    allowed: allow,
    request: request(async (url) => {
      assert.match(url, /getReceipts$/);
      return reply({ "ticket-first": { status: "ok" } });
    }),
  });
  assert.equal(second.delivered, 1);
  assert.equal((await sql`select status from push_delivery_queue`)[0].status, "delivered");
});
test("temporary send failures retry with backoff and stop after six attempts", async () => {
  await clearQueues();
  await pushFixture();
  let now = new Date();
  for (let i = 1; i <= 6; i++) {
    await processPushDeliveries(sql, {
      now,
      allowed: allow,
      request: request(async () => reply(null, 503)),
    });
    const row = (await sql`select * from push_delivery_queue`)[0];
    assert.equal(Number(row.attempts), i);
    if (i < 6) {
      assert.equal(row.status, "pending");
      assert.ok(
        (row.next_attempt_at instanceof Date
          ? row.next_attempt_at.getTime()
          : new Date(String(row.next_attempt_at)).getTime()) > now.getTime(),
      );
      now = new Date(
        (row.next_attempt_at instanceof Date
          ? row.next_attempt_at.getTime()
          : new Date(String(row.next_attempt_at)).getTime()) + 1,
      );
    } else assert.equal(row.status, "failed");
  }
});
test("receipt network failure preserves the existing ticket and does not resend a notification", async () => {
  await clearQueues();
  await pushFixture();
  const now = new Date();
  await processPushDeliveries(sql, {
    now,
    allowed: allow,
    request: request(async () => reply([{ status: "ok", id: "existing-ticket" }])),
  });
  const result = await processPushDeliveries(sql, {
    now: new Date(now.getTime() + 16 * 60000),
    allowed: allow,
    request: request(async (url) => {
      assert.match(url, /getReceipts$/);
      throw new Error("provider outage");
    }),
  });
  const row = (await sql`select * from push_delivery_queue`)[0];
  assert.equal(result.deferred, 1);
  assert.equal(row.status, "receipt");
  assert.equal(row.ticket_id, "existing-ticket");
  assert.equal(Number(row.attempts), 1);
  assert.equal(Number(row.receipt_checks), 1);
});
test("unregistered tokens are removed, taking all of that token delivery intents with them", async () => {
  await clearQueues();
  const p = await pushFixture();
  const result = await processPushDeliveries(sql, {
    allowed: allow,
    request: request(async () =>
      reply([{ status: "error", details: { error: "DeviceNotRegistered" } }]),
    ),
  });
  assert.equal(result.cancelled, 1);
  assert.equal((await sql`select * from push_tokens where token=${p.token}`).length, 0);
  assert.equal((await sql`select * from push_delivery_queue`).length, 0);
});
test("quiet hours defer without spending attempts; access or preference changes cancel without a provider call", async () => {
  await clearQueues();
  await pushFixture();
  let calls = 0;
  const now = new Date(),
    provider = request(async () => {
      calls++;
      return reply([{ status: "ok", id: "unexpected" }]);
    });
  await processPushDeliveries(sql, { now, allowed: async () => "quiet", request: provider });
  assert.equal(calls, 0);
  assert.equal(Number((await sql`select attempts from push_delivery_queue`)[0].attempts), 0);
  await processPushDeliveries(sql, {
    now: new Date(now.getTime() + 61 * 60000),
    allowed: async () => "cancel",
    request: provider,
  });
  assert.equal(calls, 0);
  assert.equal((await sql`select status from push_delivery_queue`)[0].status, "cancelled");
});
test("concurrent schedulers lease one notification once and keep provider concurrency bounded", async () => {
  await clearQueues();
  for (let i = 0; i < 9; i++) await pushFixture();
  let calls = 0,
    current = 0,
    maximum = 0;
  const provider = request(async () => {
    calls++;
    current++;
    maximum = Math.max(maximum, current);
    await new Promise((resolve) => setTimeout(resolve, 20));
    current--;
    return reply([{ status: "ok", id: `ticket-${calls}` }]);
  });
  await Promise.all([
    processPushDeliveries(sql, { allowed: allow, request: provider }),
    processPushDeliveries(sql, { allowed: allow, request: provider }),
  ]);
  assert.equal(calls, 9);
  assert.ok(maximum <= 4);
});
test("account deletion cascades queues without retaining recipients or tokens in the queue", async () => {
  await clearQueues();
  const p = await pushFixture();
  await sql`insert into email_digest_queue(user_id,week_start) values(${p.userId},current_date)`;
  await sql`delete from "user" where id=${p.userId}`;
  assert.equal((await sql`select * from push_delivery_queue`).length, 0);
  assert.equal((await sql`select * from email_digest_queue`).length, 0);
});
test("digest retries keep the same provider idempotency key and only mark a real provider ID sent", async () => {
  await clearQueues();
  const userId = await person();
  await sql`insert into email_digest_queue(user_id,week_start,post_count,reply_count) values(${userId},current_date,2,3)`;
  const keys: string[] = [];
  let fails = true;
  const now = new Date();
  const opts = {
    compose: async () => ({
      to: "member@example.test",
      subject: "Weekly digest",
      text: "Two posts, three replies.",
    }),
    send: async (_mail: unknown, key: string) => {
      keys.push(key);
      if (fails) throw new Error("outage");
      return "resend-real-provider-id";
    },
  };
  await processEmailDigests(sql, { now, ...opts });
  assert.equal((await sql`select status from email_digest_queue`)[0].status, "pending");
  fails = false;
  await processEmailDigests(sql, { now: new Date(now.getTime() + 61000), ...opts });
  const row = (await sql`select * from email_digest_queue`)[0];
  assert.equal(row.status, "sent");
  assert.equal(row.provider_id, "resend-real-provider-id");
  assert.deepEqual(keys, [keys[0], keys[0]]);
});
test("digest opt-out cancels before sending and unconfigured delivery never fakes success", async () => {
  await clearQueues();
  const userId = await person();
  await sql`insert into email_digest_queue(user_id,week_start) values(${userId},current_date)`;
  let calls = 0;
  await processEmailDigests(sql, {
    compose: async () => null,
    send: async () => {
      calls++;
      return "unexpected";
    },
  });
  assert.equal(calls, 0);
  assert.equal((await sql`select status from email_digest_queue`)[0].status, "cancelled");
  const saved = process.env.KAMINO_PUSH_ENABLED;
  delete process.env.KAMINO_PUSH_ENABLED;
  try {
    await pushFixture();
    const result = await processPushDeliveries(sql, { allowed: allow });
    assert.equal(result.configured, false);
    assert.equal(result.sent, 0);
    assert.equal((await sql`select status from push_delivery_queue`)[0].status, "pending");
  } finally {
    if (saved !== undefined) process.env.KAMINO_PUSH_ENABLED = saved;
  }
});
test("appeal proofs bind the account and case, expire and reject any edited payload", () => {
  const secret = "fixture-secret-".repeat(4),
    now = Date.now(),
    token = makeAppealProof({ caseId: 1, userId: "owner", expires: now + 60000 }, secret);
  assert.equal(readAppealProof(token, secret, now).userId, "owner");
  assert.throws(() => readAppealProof(token, secret, now + 60001), /expired/);
  const [payload, signature] = token.split(".");
  const edited = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString()),
      userId: "other",
    }),
  ).toString("base64url");
  assert.throws(() => readAppealProof(`${edited}.${signature}`, secret, now), /invalid/);
  assert.throws(() => readAppealProof(token, "wrong".repeat(10), now), /invalid/);
  assert.throws(
    () => makeAppealProof({ caseId: 1, userId: "owner", expires: now + 60000 }, "short"),
    /configured/,
  );
});
test("real feature consumption creates stable assignments, master-off records no exposure", async () => {
  const userId = await person(),
    key = `experiment-${sequence}`;
  const id = Number(
    (
      await sql`insert into platform_experiments(key,title,feature_key,status,treatment_percent,created_by) values(${key},'Related discovery','related_discovery','running',50,${userId}) returning id`
    )[0].id,
  );
  const chosen = await consumeExperiment(sql, userId, "related_discovery", true);
  for (let i = 0; i < 5; i++)
    assert.equal(await consumeExperiment(sql, userId, "related_discovery", true), chosen);
  assert.equal(
    (
      await sql`select * from experiment_assignments where experiment_id=${id} and user_id=${userId}`
    ).length,
    1,
  );
  const off = await person();
  assert.equal(await consumeExperiment(sql, off, "related_discovery", false), false);
  assert.equal(
    (await sql`select * from experiment_assignments where experiment_id=${id} and user_id=${off}`)
      .length,
    0,
  );
  await convertExperiment(sql, off, "related_discovery");
  assert.equal(
    (await sql`select * from experiment_assignments where experiment_id=${id} and user_id=${off}`)
      .length,
    0,
  );
  await convertExperiment(sql, userId, "related_discovery");
  const first = (
    await sql`select converted_at from experiment_assignments where experiment_id=${id} and user_id=${userId}`
  )[0].converted_at;
  await convertExperiment(sql, userId, "related_discovery");
  assert.equal(
    String(
      (
        await sql`select converted_at from experiment_assignments where experiment_id=${id} and user_id=${userId}`
      )[0].converted_at,
    ),
    String(first),
  );
  await sql`update platform_experiments set status='ended' where id=${id}`;
});
test("season daily caps count authoritative published participation; new season resets only seasonal progress", async () => {
  const userId = await person(),
    space = `operations-space-${sequence}`;
  await sql`insert into communities(id,name,category,created_by) values(${space},'Fixture','Art',${userId})`;
  const seasonId = Number(
    (
      await sql`insert into progression_seasons(title,starts_at,ends_at,status,created_by) values('Fixture',now()-interval '2 days',now()+interval '2 days','active',${userId}) returning id`
    )[0].id,
  );
  for (let i = 0; i < 8; i++)
    await sql`insert into posts(community_id,author_user_id,type,title,body) values(${space},${userId},'blog','Published post','Useful contribution')`;
  await sql`insert into posts(community_id,author_user_id,type,title,body,hidden) values(${space},${userId},'blog','Held post','Not counted',true)`;
  const post = Number(
    (
      await sql`select id from posts where author_user_id=${userId} and hidden=false order by id limit 1`
    )[0].id,
  );
  for (let i = 0; i < 15; i++)
    await sql`insert into comments(post_id,author_user_id,body) values(${post},${userId},'Helpful reply')`;
  await sql`insert into community_checkin_days(user_id,community_id) values(${userId},${space})`;
  assert.equal((await seasonProgress(sql, userId, seasonId)).points, 75);
  const fresh = Number(
    (
      await sql`insert into progression_seasons(title,starts_at,ends_at,status,created_by) values('Future season',now()+interval '1 day',now()+interval '3 days','scheduled',${userId}) returning id`
    )[0].id,
  );
  assert.equal((await seasonProgress(sql, userId, fresh)).points, 0);
  const setId = Number(
    (
      await sql`insert into collectible_sets(season_id,title,cosmetic,required_points,supply) values(${seasonId},'Limited aurora','aurora',70,1) returning id`
    )[0].id,
  );
  const claimed = await Promise.all([
    claimCollectible(sql, userId, setId),
    claimCollectible(sql, userId, setId),
  ]);
  assert.equal(claimed.filter((r) => r.alreadyClaimed === false).length, 1);
  assert.equal(
    Number((await sql`select awarded from collectible_sets where id=${setId}`)[0].awarded),
    1,
  );
  assert.equal((await sql`select * from earned_cosmetics where user_id=${userId}`).length, 1);
  assert.equal(Number((await sql`select rep from profiles where user_id=${userId}`)[0].rep), 0);
});
test("finite collectible supply is never oversold to simultaneous eligible claimants", async () => {
  const a = await person(),
    b = await person(),
    space = `collectible-space-${sequence}`;
  await sql`insert into communities(id,name,category,created_by) values(${space},'Fixture','Art',${a})`;
  for (const userId of [a, b])
    await sql`insert into posts(community_id,author_user_id,type,title,body) values(${space},${userId},'blog','Eligible','Contribution')`;
  const season = Number(
    (
      await sql`insert into progression_seasons(title,starts_at,ends_at,status,created_by) values('Limited',now()-interval '1 day',now()+interval '1 day','active',${a}) returning id`
    )[0].id,
  );
  const item = Number(
    (
      await sql`insert into collectible_sets(season_id,title,cosmetic,required_points,supply) values(${season},'One colour','ocean',10,1) returning id`
    )[0].id,
  );
  const claims = await Promise.allSettled([
    claimCollectible(sql, a, item),
    claimCollectible(sql, b, item),
  ]);
  assert.equal(claims.filter((c) => c.status === "fulfilled").length, 1);
  assert.equal(
    Number((await sql`select awarded from collectible_sets where id=${item}`)[0].awarded),
    1,
  );
  assert.equal((await sql`select * from collectible_awards where set_id=${item}`).length, 1);
});
async function caseFixture() {
  const subject = await person(),
    actor = await person(),
    other = await person();
  const id = Number(
    (
      await sql`insert into moderation_cases(subject_id,opened_by,assigned_to,summary) values(${subject},${actor},${actor},'Human investigation') returning id`
    )[0].id,
  );
  return { subject, actor, other, id };
}
test("case decisions reject self-review, require assignment and cannot overwrite a previous final decision", async () => {
  const f = await caseFixture();
  await assert.rejects(
    decideCase(sql, f.subject, {
      id: f.id,
      decision: "warning",
      reason: "Reason for warning",
      days: 7,
    }),
    /Another/,
  );
  await assert.rejects(
    decideCase(sql, f.other, {
      id: f.id,
      decision: "warning",
      reason: "Reason for warning",
      days: 7,
    }),
    /Assign/,
  );
  await decideCase(sql, f.actor, {
    id: f.id,
    decision: "warning",
    reason: "Reason for warning",
    days: 7,
  });
  await assert.rejects(
    decideCase(sql, f.actor, { id: f.id, decision: "banned", reason: "New reason", days: 7 }),
    /already/,
  );
  assert.equal(
    (await sql`select status from moderation_cases where id=${f.id}`)[0].status,
    "decided",
  );
});
test("independent appeal review reverses exactly its own sanction and records member-visible history", async () => {
  const f = await caseFixture();
  await decideCase(sql, f.actor, {
    id: f.id,
    decision: "suspended",
    reason: "Reviewable suspension",
    days: 7,
  });
  const appeal = Number(
    (
      await sql`insert into moderation_case_appeals(case_id,user_id,message) values(${f.id},${f.subject},'Please reconsider this decision with my explanation.') returning id`
    )[0].id,
  );
  await assert.rejects(
    decideCaseAppeal(sql, f.actor, {
      id: appeal,
      decision: "overturned",
      note: "Original issuer cannot decide",
    }),
    /Another/,
  );
  await decideCaseAppeal(sql, f.other, {
    id: appeal,
    decision: "overturned",
    note: "The suspension was issued in error.",
  });
  assert.equal(
    (await sql`select status from identity_account_status where user_id=${f.subject}`)[0].status,
    "active",
  );
  assert.equal(
    (await sql`select status from moderation_cases where id=${f.id}`)[0].status,
    "closed",
  );
  assert.equal(
    (await sql`select status from moderation_case_appeals where id=${appeal}`)[0].status,
    "overturned",
  );
  assert.ok(
    (
      await sql`select * from moderation_case_events where case_id=${f.id} and kind='appeal.overturned' and member_visible=true`
    ).length,
  );
});
test("an appeal cannot erase an account action changed after the case decision", async () => {
  const f = await caseFixture();
  await decideCase(sql, f.actor, {
    id: f.id,
    decision: "banned",
    reason: "Initial case reason",
    days: 7,
  });
  const appeal = Number(
    (
      await sql`insert into moderation_case_appeals(case_id,user_id,message) values(${f.id},${f.subject},'Please review this case again with the new evidence.') returning id`
    )[0].id,
  );
  await sql`update identity_account_status set reason='New administrative reason',actor_id=${f.other} where user_id=${f.subject}`;
  await assert.rejects(
    decideCaseAppeal(sql, f.other, {
      id: appeal,
      decision: "overturned",
      note: "Attempt to clear newer action",
    }),
    /newer/,
  );
  assert.equal(
    (await sql`select status from identity_account_status where user_id=${f.subject}`)[0].status,
    "banned",
  );
  assert.equal(
    (await sql`select status from moderation_case_appeals where id=${appeal}`)[0].status,
    "open",
  );
});

test("weekly digest totals use a fixed completed week, exclude held replies, respect opt-in and deduplicate", async () => {
  await clearQueues();
  const reader = await person(),
    author = await person(),
    space = `digest-space-${sequence}`,
    week = "2030-01-07";
  await sql`insert into communities(id,name,category,created_by) values(${space},'Digest fixture','Art',${author})`;
  await sql`insert into memberships(user_id,community_id,nickname,status) values(${reader},${space},'Reader','active')`;
  await sql`update profiles set email_digest=true where user_id=${reader}`;
  const post = Number(
    (
      await sql`insert into posts(community_id,author_user_id,type,title,body,created_at) values(${space},${author},'blog','Previous week','Visible',${"2030-01-05T12:00:00Z"}) returning id`
    )[0].id,
  );
  await sql`insert into posts(community_id,author_user_id,type,title,body,created_at) values(${space},${author},'blog','Current week','Not counted',${"2030-01-07T12:00:00Z"})`;
  await sql`insert into comments(post_id,author_user_id,body,created_at,held) values(${post},${author},'Visible reply',${"2030-01-06T12:00:00Z"},false),(${post},${author},'Held reply',${"2030-01-06T12:00:00Z"},true)`;
  await enqueueWeeklyDigest(sql, reader, week, "true");
  await enqueueWeeklyDigest(sql, reader, week, "true");
  let rows = await sql`select * from email_digest_queue where user_id=${reader}`;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].post_count), 1);
  assert.equal(Number(rows[0].reply_count), 1);
  await sql`delete from email_digest_queue where user_id=${reader}`;
  await sql`insert into blocks(blocker_id,blocked_id) values(${reader},${author})`;
  await enqueueWeeklyDigest(sql, reader, week, "true");
  rows = await sql`select * from email_digest_queue where user_id=${reader}`;
  assert.equal(Number(rows[0].post_count), 0);
  assert.equal(Number(rows[0].reply_count), 0);
  await sql`delete from email_digest_queue where user_id=${reader}`;
  await sql`update profiles set email_digest=false where user_id=${reader}`;
  await enqueueWeeklyDigest(sql, reader, week, "true");
  assert.equal((await sql`select * from email_digest_queue where user_id=${reader}`).length, 0);
});
test("held replies and scheduled unpublished posts cannot earn season points", async () => {
  const userId = await person(),
    other = await person(),
    space = `held-season-${sequence}`;
  await sql`insert into communities(id,name,category,created_by) values(${space},'Season fixture','Art',${other})`;
  const parent = Number(
    (
      await sql`insert into posts(community_id,author_user_id,type,title,body) values(${space},${other},'blog','Parent','Contribution') returning id`
    )[0].id,
  );
  await sql`insert into posts(community_id,author_user_id,type,title,body,publish_at) values(${space},${userId},'blog','Future scheduled','Wait until published',now()+interval '1 day')`;
  await sql`insert into comments(post_id,author_user_id,body,held) values(${parent},${userId},'Held contribution',true)`;
  const season = Number(
    (
      await sql`insert into progression_seasons(title,starts_at,ends_at,status,created_by) values('Held season',now()-interval '1 day',now()+interval '2 days','active',${other}) returning id`
    )[0].id,
  );
  assert.equal((await seasonProgress(sql, userId, season)).points, 0);
});
test("an audit failure rolls back a case sanction, session removal and case decision atomically", async () => {
  const f = await caseFixture();
  await sql`insert into session(id,"userId",token,"expiresAt","updatedAt") values(${`rollback-${sequence}`},${f.subject},${`token-${sequence}`},now()+interval '1 day',now())`;
  await sql.query("create table operations_test_rejected_actor(actor_id text primary key)");
  await sql`insert into operations_test_rejected_actor values(${f.actor})`;
  await sql.query(
    `create function reject_operations_audit() returns trigger language plpgsql as $$ begin if exists(select 1 from operations_test_rejected_actor where actor_id=NEW.actor_id) then raise exception 'fixture audit rejection'; end if; return NEW; end $$`,
  );
  await sql.query(
    "create trigger operations_test_reject before insert on platform_audit for each row execute function reject_operations_audit()",
  );
  try {
    await assert.rejects(
      decideCase(sql, f.actor, {
        id: f.id,
        decision: "banned",
        reason: "Would ban if transaction committed",
        days: 7,
      }),
      /audit rejection/,
    );
    assert.equal(
      (await sql`select status from moderation_cases where id=${f.id}`)[0].status,
      "open",
    );
    assert.equal(
      (await sql`select * from identity_account_status where user_id=${f.subject}`).length,
      0,
    );
    assert.equal((await sql`select * from session where "userId"=${f.subject}`).length, 1);
    assert.equal((await sql`select * from moderation_case_events where case_id=${f.id}`).length, 0);
  } finally {
    await sql.query("drop trigger operations_test_reject on platform_audit");
    await sql.query("drop function reject_operations_audit()");
    await sql.query("drop table operations_test_rejected_actor");
  }
});
