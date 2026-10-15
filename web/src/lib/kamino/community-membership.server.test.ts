import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { Sql } from "../db";
import {
  addToOpenRooms,
  banMember,
  checkInvite,
  communityLeaderIds,
  followStateOf,
  handOverOwnedCommunities,
  leaveMembership,
  restoreMember,
  setBlock,
  setProfileFollow,
  useInvite,
} from "./community-membership.server.ts";

const pg = new PGlite();
await pg.waitReady;
const migrations = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
after(() => pg.close());
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
  (await pg.query(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)).rows) as Sql;
sql.query = async <T>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows;

async function person(id: string, privateAccount = false) {
  await sql`insert into profiles (user_id, handle, display_name, private_account) values (${id}, ${id}, ${id}, ${privateAccount})`;
}
async function community(id: string) {
  await sql`insert into communities (id, name, category, visibility, created_by, member_count) values (${id}, ${id}, 'Games', 'public', 'owner', 0)`;
  const room = (await sql<{ id: number }>`insert into chat_rooms (community_id, name, kind, created_by) values (${id}, 'lobby', 'public', 'owner') returning id`)[0]!;
  return Number(room.id);
}
async function member(userId: string, communityId: string, role = "member", status = "active") {
  await sql`insert into memberships (user_id, community_id, role, status, nickname) values (${userId}, ${communityId}, ${role}, ${status}, ${userId})`;
  if (status === "active") await sql`update communities set member_count = member_count + 1 where id = ${communityId}`;
}
const count = async (communityId: string) => Number((await sql<{ n: number }>`select member_count as n from communities where id = ${communityId}`)[0]!.n);
const statusOf = async (userId: string, communityId: string) =>
  (await sql<{ status: string; role: string }>`select status, role from memberships where user_id = ${userId} and community_id = ${communityId}`)[0];
const inRoom = async (roomId: number, userId: string) => (await sql`select 1 from chat_members where room_id = ${roomId} and user_id = ${userId}`).length > 0;

await person("ana");
await person("ben");
await person("cleo", true);
await person("dev");

// ── Follow state ────────────────────────────────────────────────────────────

test("follow is set, not toggled: following twice stays followed and notifies once", async () => {
  const sent: string[] = [];
  const notify = async (kind: string, target: { userId: string }) => void sent.push(`${kind}:${target.userId}`);
  assert.deepEqual(await setProfileFollow(sql, "ana", "ben", true, notify), { following: true, requested: false });
  // A stale "Follow" button pressed again must NOT unfollow (the old bug).
  assert.deepEqual(await setProfileFollow(sql, "ana", "ben", true, notify), { following: true, requested: false });
  assert.deepEqual(await followStateOf(sql, "ana", "ben"), { following: true, requested: false });
  assert.deepEqual(sent, ["follow:ben"]);
  assert.deepEqual(await setProfileFollow(sql, "ana", "ben", false, notify), { following: false, requested: false });
  assert.deepEqual(await setProfileFollow(sql, "ana", "ben", false, notify), { following: false, requested: false });
  assert.deepEqual(await followStateOf(sql, "ana", "ben"), { following: false, requested: false });
});

test("a private account gets one request; asking again keeps it, and follow:false cancels it", async () => {
  const sent: string[] = [];
  const notify = async (kind: string) => void sent.push(kind);
  assert.deepEqual(await setProfileFollow(sql, "ana", "cleo", true, notify), { following: false, requested: true });
  // The old toggle cancelled the request on the second tap while the button said "Follow".
  assert.deepEqual(await setProfileFollow(sql, "ana", "cleo", true, notify), { following: false, requested: true });
  assert.deepEqual(sent, ["follow_request"]);
  assert.deepEqual(await setProfileFollow(sql, "ana", "cleo", false), { following: false, requested: false });
  assert.equal((await sql`select 1 from follow_requests where follower_id = 'ana' and followee_id = 'cleo'`).length, 0);
});

test("two follow taps at the same moment save one follow and one notification", async () => {
  const sent: string[] = [];
  const notify = async (kind: string) => void sent.push(kind);
  const [a, b] = await Promise.all([setProfileFollow(sql, "dev", "ben", true, notify), setProfileFollow(sql, "dev", "ben", true, notify)]);
  assert.equal(a.following && b.following, true);
  assert.equal(sent.length, 1);
});

test("you can't follow yourself or someone in a block, but you can always unfollow", async () => {
  await assert.rejects(setProfileFollow(sql, "ana", "ana", true), /That's you/);
  await setProfileFollow(sql, "ben", "dev", true);
  await sql`insert into blocks (blocker_id, blocked_id) values ('dev', 'ben')`;
  await assert.rejects(setProfileFollow(sql, "ana", "nobody-here", true), /Profile not found/);
  // Already following: following again just reports it; unfollowing works despite the block.
  assert.deepEqual(await setProfileFollow(sql, "ben", "dev", false), { following: false, requested: false });
  await assert.rejects(setProfileFollow(sql, "ben", "dev", true), /can't follow/);
});

// ── Membership ──────────────────────────────────────────────────────────────

test("leaving never clears a ban (no rejoining by leaving first)", async () => {
  const room = await community("ban-test");
  await member("owner", "ban-test", "agent");
  await member("ana", "ban-test", "curator");
  await addToOpenRooms(sql, "ana", "ban-test");
  await sql`update chat_members set in_voice = true where room_id = ${room} and user_id = 'ana'`;
  assert.equal(await count("ban-test"), 2);

  const banned = await banMember(sql, "ana", "ban-test");
  assert.equal(banned.changed, true);
  assert.deepEqual(banned.inCallRooms, [room], "the caller is told to disconnect them from the call");
  assert.deepEqual(await statusOf("ana", "ban-test"), { status: "banned", role: "member" }, "a removed curator loses their role");
  assert.equal(await inRoom(room, "ana"), false, "removed members leave the community's rooms");
  assert.equal(await count("ban-test"), 1);

  // Banning again changes nothing (the count used to drop again).
  assert.equal((await banMember(sql, "ana", "ban-test")).changed, false);
  assert.equal(await count("ban-test"), 1);

  // "Leave" from a removed member keeps the ban.
  assert.equal((await leaveMembership(sql, "ana", "ban-test")).left, false);
  assert.equal((await statusOf("ana", "ban-test"))?.status, "banned");
});

test("restoring a removed member brings back their rooms and the member count", async () => {
  const room = Number((await sql<{ id: number }>`select id from chat_rooms where community_id = 'ban-test'`)[0]!.id);
  assert.equal(await restoreMember(sql, "ana", "ban-test"), true);
  assert.equal((await statusOf("ana", "ban-test"))?.status, "active");
  assert.equal(await inRoom(room, "ana"), true);
  assert.equal(await count("ban-test"), 2);
  assert.equal(await restoreMember(sql, "ana", "ban-test"), false, "restoring twice changes nothing");
  assert.equal(await count("ban-test"), 2);
});

test("leaving takes you out of the rooms but keeps a moderator's room removal", async () => {
  const room = await community("leave-test");
  await sql`insert into chat_rooms (community_id, name, kind, created_by) values ('leave-test', 'stage', 'voice', 'owner')`;
  const stage = Number((await sql<{ id: number }>`select id from chat_rooms where community_id = 'leave-test' and name = 'stage'`)[0]!.id);
  await member("owner", "leave-test", "agent");
  await member("ben", "leave-test");
  await addToOpenRooms(sql, "ben", "leave-test");
  await sql`update chat_members set room_removed = true where room_id = ${stage} and user_id = 'ben'`;
  await sql`insert into join_answers (user_id, community_id, answers) values ('ben', 'leave-test', '[]')`;

  assert.equal((await leaveMembership(sql, "ben", "leave-test")).left, true);
  assert.equal(await statusOf("ben", "leave-test"), undefined);
  assert.equal(await inRoom(room, "ben"), false);
  assert.equal(await inRoom(stage, "ben"), true, "the removed-from-room marker stays");
  assert.equal(await count("leave-test"), 1);
  assert.equal((await sql`select 1 from join_answers where user_id = 'ben' and community_id = 'leave-test'`).length, 0);
});

test("the owner can't leave without handing the community over", async () => {
  await assert.rejects(leaveMembership(sql, "owner", "leave-test"), /co-leader the owner first/);
});

test("cancelling a join request doesn't change the member count", async () => {
  await member("dev", "leave-test", "member", "pending");
  assert.equal((await leaveMembership(sql, "dev", "leave-test")).left, true);
  assert.equal(await count("leave-test"), 1);
});

test("join requests go to every active leader, not just the creator", async () => {
  await community("leaders");
  await member("owner", "leaders", "agent");
  await member("ben", "leaders", "leader");
  await member("dev", "leaders", "curator");
  await member("ana", "leaders", "leader", "banned");
  assert.deepEqual(await communityLeaderIds(sql, "leaders"), ["ben", "owner"]);
});

test("an invite is only used up when someone actually joins, and never past its limit", async () => {
  await community("invites");
  await sql`insert into invite_codes (code, community_id, created_by, max_uses) values ('one-use', 'invites', 'owner', 1)`;
  await sql`insert into invite_codes (code, community_id, created_by, max_uses, expires_at) values ('old', 'invites', 'owner', 0, now() - interval '1 day')`;
  await checkInvite(sql, "one-use", "invites");
  assert.equal(Number((await sql<{ uses: number }>`select uses from invite_codes where code = 'one-use'`)[0]!.uses), 0, "checking doesn't use it");
  await assert.rejects(checkInvite(sql, "one-use", "other-community"), /isn’t valid/);
  await assert.rejects(checkInvite(sql, "old", "invites"), /expired/);
  const [a, b] = await Promise.all([useInvite(sql, "one-use", "invites"), useInvite(sql, "one-use", "invites")]);
  assert.deepEqual([a, b].sort(), [false, true], "two people can't both take the last place");
  await assert.rejects(checkInvite(sql, "one-use", "invites"), /used up/);
  assert.equal(await useInvite(sql, "old", "invites"), false);
});

test("the cleanup migration left banned and waiting members without staff roles", async () => {
  await member("eve", "leaders", "curator", "banned");
  await pg.exec(readFileSync(new URL("0053_community_integrity.sql", migrations), "utf8"));
  assert.equal((await statusOf("eve", "leaders"))?.role, "member");
  assert.equal(await count("leaders"), 3, "member counts are recounted from active memberships");
});

// ── Settings: blocking and account deletion ─────────────────────────────────

test("block is set, not toggled, and ends follows and requests both ways", async () => {
  await person("gus");
  await person("hana", true);
  await setProfileFollow(sql, "gus", "dev", true);
  await setProfileFollow(sql, "dev", "gus", true);
  await setProfileFollow(sql, "gus", "hana", true); // a request (private account)
  assert.deepEqual(await setBlock(sql, "gus", "dev", true), { blocked: true });
  assert.deepEqual(await setBlock(sql, "gus", "dev", true), { blocked: true }, "blocking twice stays blocked");
  assert.deepEqual(await followStateOf(sql, "gus", "dev"), { following: false, requested: false });
  assert.deepEqual(await followStateOf(sql, "dev", "gus"), { following: false, requested: false });
  await setBlock(sql, "hana", "gus", true);
  assert.deepEqual(await followStateOf(sql, "gus", "hana"), { following: false, requested: false }, "the waiting request is gone");
  // A stale "Unblock" pressed twice must not block again (the old toggle did).
  assert.deepEqual(await setBlock(sql, "gus", "dev", false), { blocked: false });
  assert.deepEqual(await setBlock(sql, "gus", "dev", false), { blocked: false });
  assert.equal((await sql`select 1 from blocks where blocker_id = 'gus' and blocked_id = 'dev'`).length, 0);
  await assert.rejects(setBlock(sql, "gus", "gus", true), /yourself/);
});

test("an owner's communities get a new owner when their account is deleted", async () => {
  await community("handover");
  await member("owner2", "handover", "agent");
  await member("m1", "handover", "member");
  await member("c1", "handover", "curator");
  await member("l1", "handover", "leader");
  await sql`update memberships set rep = 999 where user_id = 'm1' and community_id = 'handover'`;
  await community("alone");
  await member("owner2", "alone", "agent");
  assert.equal(await handOverOwnedCommunities(sql, "owner2"), 1);
  assert.equal((await statusOf("l1", "handover"))?.role, "agent", "a co-leader comes first, even over a busier member");
  assert.equal((await sql<{ created_by: string }>`select created_by from communities where id = 'handover'`)[0]!.created_by, "l1");
  assert.equal((await statusOf("owner2", "alone"))?.role, "agent", "nobody else to hand an empty community to");
});

test("without a co-leader, a curator and then the most active member take over", async () => {
  await community("handover2");
  await member("owner3", "handover2", "agent");
  await member("m2", "handover2", "member");
  await member("m3", "handover2", "member");
  await sql`update memberships set rep = 50 where user_id = 'm3' and community_id = 'handover2'`;
  await handOverOwnedCommunities(sql, "owner3");
  assert.equal((await statusOf("m3", "handover2"))?.role, "agent");
});

test("the settings repair migration fixes values older code left behind", async () => {
  await person("ivy");
  await sql`update profiles set restricted_mode = true, quiet_start = 22, quiet_end = null, dm_privacy = 'whatever' where user_id = 'ivy'`;
  await sql`insert into profile_follows (follower_id, followee_id) values ('ivy', 'ana')`;
  await sql`insert into blocks (blocker_id, blocked_id) values ('ana', 'ivy')`;
  await pg.exec(readFileSync(new URL("0055_settings_fixes.sql", migrations), "utf8"));
  const row = (await sql<{ restricted_mode: boolean; quiet_start: number | null; dm_privacy: string }>`select restricted_mode, quiet_start, dm_privacy from profiles where user_id = 'ivy'`)[0]!;
  assert.deepEqual([row.restricted_mode, row.quiet_start, row.dm_privacy], [false, null, "members"]);
  assert.deepEqual(await followStateOf(sql, "ivy", "ana"), { following: false, requested: false });
});
