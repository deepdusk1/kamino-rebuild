import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Sql } from "../db";
import { applyLiveKitWebhook, callHref, leaveCall } from "./calls.server.ts";
import { subscribeEvents, type ServerEvent } from "./events.server.ts";
import {
  LIVEKIT_TOKEN_TTL_SECONDS,
  createLiveKitToken,
  liveKitRoleFor,
  loadLiveKitRole,
  roomIdFromLiveKitRoom,
} from "./livekit.server.ts";

// Every migration runs, in order, on an in-memory Postgres.
const pg = new PGlite();
await pg.waitReady;
const migrations = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
after(() => pg.close());
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
  (await pg.query(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)).rows) as Sql;
sql.query = async <T>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows;

const events: ServerEvent[] = [];
const stop = subscribeEvents((e) => events.push(e));
after(stop);

let n = 0;
/** A room with the given members; `inVoice` lists who is in its call right now. */
async function room(kind: string, members: string[], inVoice: string[] = []): Promise<number> {
  n += 1;
  const rows = await sql<{ id: number }>`
    insert into chat_rooms (name, kind, created_by) values (${`call-test-${n}`}, ${kind}, ${members[0]!}) returning id`;
  const id = Number(rows[0]!.id);
  for (const m of members)
    await sql`insert into chat_members (room_id, user_id, in_voice) values (${id}, ${m}, ${inVoice.includes(m)})`;
  return id;
}
async function inVoice(roomId: number): Promise<string[]> {
  const rows = await sql<{ user_id: string }>`
    select user_id from chat_members where room_id = ${roomId} and in_voice = true order by user_id`;
  return rows.map((r) => r.user_id);
}
async function ring(roomId: number, userId: string) {
  await sql`insert into notifications (user_id, kind, title, body, href) values (${userId}, 'call', 'Caller', 'Incoming call', ${callHref(roomId)})`;
}
async function unreadRings(roomId: number): Promise<number> {
  return (await sql`select 1 from notifications where kind = 'call' and href = ${callHref(roomId)} and read = false`).length;
}
const endedFor = (roomId: number) =>
  events.filter((e) => e.type === "call-ended" && e.roomId === roomId).map((e) => ("toUserId" in e ? e.toUserId : ""));

test("who may speak: everyone in DMs and groups, hosts always, the stage decides the rest", () => {
  const base = { kind: "voice", isCreator: false, isCohost: false, stageEnabled: false, stageRole: "listener", hostMuted: false };
  assert.equal(liveKitRoleFor({ ...base, kind: "dm" }), "speaker");
  assert.equal(liveKitRoleFor({ ...base, kind: "group", hostMuted: true }), "speaker");
  assert.equal(liveKitRoleFor({ ...base, isCreator: true, hostMuted: true }), "host");
  assert.equal(liveKitRoleFor({ ...base, isCohost: true }), "host");
  assert.equal(liveKitRoleFor({ ...base, isCohost: true, hostMuted: true }), "listener");
  // Stage off: a plain voice room where everyone can talk (this used to get a listen-only token).
  assert.equal(liveKitRoleFor(base), "speaker");
  assert.equal(liveKitRoleFor({ ...base, hostMuted: true }), "listener");
  assert.equal(liveKitRoleFor({ ...base, stageEnabled: true }), "listener");
  assert.equal(liveKitRoleFor({ ...base, stageEnabled: true, stageRole: "speaker" }), "speaker");
});

test("roles come from the database; removed members and non-members get nothing", async () => {
  const id = await room("voice", ["host-a", "member-b", "member-c"]);
  await sql`update chat_rooms set stage_enabled = true where id = ${id}`;
  await sql`update chat_members set stage_role = 'speaker' where room_id = ${id} and user_id = 'member-b'`;
  await sql`update chat_members set room_removed = true where room_id = ${id} and user_id = 'member-c'`;
  assert.equal(await loadLiveKitRole(sql, id, "host-a"), "host");
  assert.equal(await loadLiveKitRole(sql, id, "member-b"), "speaker");
  assert.equal(await loadLiveKitRole(sql, id, "member-c"), null);
  assert.equal(await loadLiveKitRole(sql, id, "stranger"), null);
});

test("join tokens are short-lived, for one room, and listeners cannot publish", async () => {
  const config = { url: "wss://example.livekit.cloud", apiKey: "key", apiSecret: "secret-that-is-long-enough-32b!!" };
  const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString()) as {
    exp: number;
    nbf?: number;
    iat?: number;
    sub: string;
    video: Record<string, unknown>;
  };
  const listener = decode(await createLiveKitToken(config, "k-live-5", "user-1", "Sam", "listener"));
  assert.equal(listener.sub, "user-1");
  assert.equal(listener.video.room, "k-live-5");
  assert.equal(listener.video.canPublish, false);
  assert.equal(listener.video.canSubscribe, true);
  assert.equal(listener.video.roomRecord, false);
  const now = Math.floor(Date.now() / 1000);
  assert.ok(listener.exp - now <= LIVEKIT_TOKEN_TTL_SECONDS + 5 && listener.exp > now);
  const speaker = decode(await createLiveKitToken(config, "k-live-5", "user-2", "Ana", "speaker"));
  assert.equal(speaker.video.canPublish, true);
});

test("LiveKit room names map back to chat rooms and nothing else", () => {
  assert.equal(roomIdFromLiveKitRoom("k-live-42"), 42);
  assert.equal(roomIdFromLiveKitRoom("k-live-42x"), null);
  assert.equal(roomIdFromLiveKitRoom("other"), null);
  assert.equal(roomIdFromLiveKitRoom(undefined), null);
});

test("hanging up a 1:1 call ends it for both: rings stop and the other screen is told", async () => {
  const id = await room("dm", ["caller", "callee"], ["caller"]);
  await ring(id, "callee");
  const result = await leaveCall(sql, id, "caller", { explicit: true });
  assert.deepEqual(result, { wasInCall: true, callOver: true });
  assert.deepEqual(await inVoice(id), []);
  assert.equal(await unreadRings(id), 0);
  assert.deepEqual(endedFor(id), ["callee"]);
});

test("a DM hang-up still ends the call when the app already cleared its own in-call mark", async () => {
  const id = await room("dm", ["caller", "callee"], ["callee"]);
  const result = await leaveCall(sql, id, "caller", { explicit: true });
  assert.equal(result.callOver, true);
  assert.deepEqual(await inVoice(id), [], "the other person is taken out of the finished call too");
  assert.deepEqual(endedFor(id), ["callee"]);
});

test("leaving a group call only ends it for everyone when the last person leaves", async () => {
  const id = await room("group", ["a", "b", "c"], ["a", "b"]);
  await ring(id, "c");
  assert.equal((await leaveCall(sql, id, "a", { explicit: true })).callOver, false);
  assert.deepEqual(await inVoice(id), ["b"]);
  assert.equal(await unreadRings(id), 1, "c is still being rung while b is in the call");
  assert.deepEqual(endedFor(id), []);
  assert.equal((await leaveCall(sql, id, "b", { explicit: true })).callOver, true);
  assert.equal(await unreadRings(id), 0);
  assert.deepEqual(endedFor(id).sort(), ["a", "c"]);
});

test("a late 'left' notice for someone no longer in the call changes nothing", async () => {
  const id = await room("dm", ["x", "y"], ["y"]);
  const result = await leaveCall(sql, id, "x", { explicit: false });
  assert.deepEqual(result, { wasInCall: false, callOver: false });
  assert.deepEqual(await inVoice(id), ["y"]);
  assert.deepEqual(endedFor(id), []);
});

test("LiveKit webhooks: a phone that vanished is taken out of the call; a reconnect is not", async () => {
  const id = await room("dm", ["p1", "p2"], ["p1", "p2"]);
  const event = { event: "participant_left", room: { name: `k-live-${id}` }, participant: { identity: "p1" } };
  // LiveKit still has them (they reconnected): nothing changes.
  assert.equal(await applyLiveKitWebhook(sql, event, async () => true), "ignored");
  assert.deepEqual(await inVoice(id), ["p1", "p2"]);
  // Really gone: out of the call, and the 1:1 call ends for the other person.
  assert.equal(await applyLiveKitWebhook(sql, event, async () => false), "left");
  assert.deepEqual(await inVoice(id), []);
  assert.deepEqual(endedFor(id), ["p2"]);
});

test("LiveKit webhooks: joining marks the member in the call; strangers and other rooms are ignored", async () => {
  const id = await room("voice", ["owner", "guest"]);
  const joined = (identity: string, name = `k-live-${id}`) =>
    applyLiveKitWebhook(sql, { event: "participant_joined", room: { name }, participant: { identity } }, async () => true);
  assert.equal(await joined("guest"), "joined");
  assert.equal(await joined("stranger"), "joined");
  assert.deepEqual(await inVoice(id), ["guest"]);
  assert.equal(await joined("guest", "some-other-room"), "ignored");
  const finished = await applyLiveKitWebhook(sql, { event: "room_finished", room: { name: `k-live-${id}` } }, async () => false);
  assert.equal(finished, "finished");
  assert.deepEqual(await inVoice(id), []);
});
