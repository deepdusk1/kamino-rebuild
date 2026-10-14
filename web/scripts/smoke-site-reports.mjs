import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

/** Reuse the production browser fixture; no extra fixed-email administrator or live provider account is created. */
export async function verifySiteReports({ owner, member, community, post }) {
  const base = process.env.TEST_ORIGIN ?? "http://localhost:8085";
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(base).hostname)) throw new Error("Fixture verification runs on loopback only.");
  let groups = 0;
  const pass = name => console.log(`PASS SITE REPORTS ${++groups} ${name}`);
  async function call(who, name, data) {
    const response = await fetch(`${base}/api/v1/rpc/${name}`, {
      method: "POST", headers: { "content-type": "application/json", ...(who?.token ? { authorization: `Bearer ${who.token}` } : {}) },
      body: JSON.stringify({ data }), signal: AbortSignal.timeout(60000),
    });
    return { status: response.status, ...(await response.json()) };
  }
  async function ok(who, name, data) { const r = await call(who, name, data); assert.equal(r.error, undefined, `${name}: ${r.error?.message}`); return r.result; }
  async function denied(who, name, data) { const r = await call(who, name, data); assert.ok(r.error, `${name} should refuse`); return r; }
  for (const who of [null, member]) {
    await denied(who, "listSiteReports", {});
    await denied(who, "reviewSiteReport", { id: 1, status: "resolved" });
    await denied(who, "listSiteSafetyFlags");
  }
  pass("guests and ordinary members cannot read or decide site queues");
  await ok(member, "fileReport", { targetType: "user", targetId: owner.id, reason: "Fixture site report", details: "Account report details supplied by the member." });
  const queue = await ok(owner, "listSiteReports", {});
  const siteReport = queue.reports.find(r => r.targetType === "user" && r.targetId === owner.id && r.reason === "Fixture site report");
  assert.ok(siteReport);
  assert.equal(siteReport.communityId, null);
  assert.equal(siteReport.details, "Account report details supplied by the member.");
  assert.equal(siteReport.reporterId, undefined);
  assert.equal(siteReport.messageBody, undefined);
  assert.equal(siteReport.content, undefined);
  assert.ok(queue.reports.length <= 100);
  await denied(owner, "listSiteReports", { beforeId: -1 });
  await denied(owner, "reviewSiteReport", { id: siteReport.id, status: "active" });
  await denied(owner, "reviewSiteReport", { id: siteReport.id, status: "resolved", note: "x".repeat(1001) });
  await denied(member, "reviewSiteReport", { id: siteReport.id, status: "resolved" });
  pass("verified administrator sees bounded reporter-supplied details and invalid reviews fail");
  const competitors = await Promise.all([
    call(owner, "reviewSiteReport", { id: siteReport.id, status: "resolved", note: "Fixture reviewed account report" }),
    call(owner, "reviewSiteReport", { id: siteReport.id, status: "dismissed", note: "Competing decision" }),
  ]);
  assert.equal(competitors.filter(r => !r.error).length, 1);
  assert.equal(competitors.filter(r => r.error).length, 1);
  const closed = (await ok(owner, "listSiteReports", { closed: true })).reports.find(r => r.id === siteReport.id);
  assert.ok(["resolved", "dismissed"].includes(closed.status));
  assert.ok(!(await ok(owner, "listSiteReports", {})).reports.some(r => r.id === siteReport.id));
  const audit = (await ok(owner, "getAdminDashboard")).audit.filter(r => /^report\./.test(r.action) && JSON.parse(r.detail).reportId === siteReport.id);
  assert.equal(audit.length, 1);
  pass("competing site reviews produce exactly one decision and platform audit");
  await ok(member, "fileReport", { communityId: community.id, targetType: "post", targetId: String(post.id), reason: "Fixture community report", details: "Community review fixture" });
  const communityReport = (await ok(owner, "listSiteReports", {})).reports.find(r => r.targetType === "post" && r.targetId === String(post.id) && r.reason === "Fixture community report");
  assert.ok(communityReport);
  assert.equal(communityReport.communityName, (await ok(owner, "getCommunityPage", { slug: community.id })).community.name);
  await ok(owner, "reviewSiteReport", { id: communityReport.id, status: "resolved" });
  await denied(owner, "resolveReport", { slug: community.id, id: communityReport.id, status: "dismissed" });
  assert.equal((await ok(owner, "getModeration", community.id)).reports.find(r => r.id === communityReport.id).status, "resolved");
  assert.equal((await ok(member, "getPostPage", { slug: community.id, postId: post.id })).post.id, post.id, "closing report does not delete content");
  pass("community reviewer cannot overwrite a site decision and closing does not remove content");
  const own = await ok(member, "listMySafetyCommunities");
  assert.ok(own.some(c => c.id === community.id));
  assert.ok(own.every(c => !('members' in c) && !('reports' in c) && !('description' in c)));
  const bannedSpace = await ok(owner, "createCommunity", { name: `Appeal fixture ${Date.now()}`, category: "Art", tagline: "Own appeal access", description: "An isolated moderation fixture", rules: "Be kind", visibility: "private", ageGate: 13 });
  const privatePost = await ok(owner, "createPost", { slug: bannedSpace.id, type: "blog", title: "Private report fixture", body: "A private post available only to members." });
  await denied(member, "fileReport", { targetType: "post", targetId: String(privatePost.id), reason: "Foreign private target" });
  await denied(member, "fileReport", { targetType: "community", targetId: bannedSpace.id, reason: "Foreign private target" });
  await denied(member, "reportCommunityV9", { slug: bannedSpace.id, reason: "Foreign private target" });
  await denied(member, "fileReport", { communityId: bannedSpace.id, targetType: "post", targetId: String(post.id), reason: "Misattributed community" });
  await denied(member, "fileReport", { targetType: "post", targetId: "999999999", reason: "Missing target" });
  await denied(member, "fileReport", { targetType: "message", targetId: "0", reason: "Invalid target" });
  await denied(member, "fileReport", { targetType: "admin", targetId: "1", reason: "Invalid kind" });
  await denied(member, "fileReport", { targetType: "user", targetId: "does-not-exist", reason: "Missing profile" });
  await denied(member, "fileReport", { targetType: "user", targetId: owner.id, reason: "x".repeat(301) });
  await denied(member, "fileReport", { targetType: "user", targetId: owner.id, reason: "Oversized details", details: "x".repeat(5001) });
  pass("invalid, missing, foreign private and misattributed targets cannot create reports");
  const privateRoom = await ok(owner, "createRoom", { slug: community.id, name: "Private review fixture", kind: "private" });
  const privateMessage = await ok(owner, "sendMessage", { roomId: privateRoom.id, body: "Private context unavailable to other members" });
  await denied(member, "fileReport", { targetType: "message", targetId: String(privateMessage.id), reason: "Foreign private message" });
  const dm = await ok(owner, "openDm", member.id);
  const dmMessage = await ok(owner, "sendMessage", { roomId: dm.roomId, body: "A direct conversation fixture" });
  await ok(member, "fileReport", { targetType: "message", targetId: String(dmMessage.id), reason: "Fixture direct report" });
  const dmReport = (await ok(owner, "listSiteReports", {})).reports.find(r => r.targetType === "message" && r.targetId === String(dmMessage.id));
  assert.ok(dmReport);
  assert.equal(dmReport.communityId, null);
  assert.equal(dmReport.messageBody, undefined);
  await denied(owner, "resolveReport", { slug: community.id, id: dmReport.id, status: "resolved" });
  await ok(owner, "reviewSiteReport", { id: dmReport.id, status: "resolved" });
  await ok(owner, "blockUser", member.id);
  await denied(member, "fileReport", { targetType: "user", targetId: owner.id, reason: "Blocked context" });
  await denied(member, "fileReport", { targetType: "post", targetId: String(post.id), reason: "Blocked context" });
  await ok(owner, "blockUser", member.id);
  await ok(owner, "addComment", { postId: post.id, body: "Reportable comment fixture" });
  const comment = (await ok(member, "getPostPage", { slug: community.id, postId: post.id })).comments.find(c => c.body === "Reportable comment fixture");
  assert.ok(comment);
  await denied(member, "fileReport", { targetType: "comment", targetId: `${privatePost.id}/${comment.id}`, reason: "Wrong parent" });
  await ok(member, "fileReport", { targetType: "comment", targetId: `${post.id}/${comment.id}`, reason: "Fixture comment report" });
  const commentReport = (await ok(owner, "listSiteReports", {})).reports.find(r => r.targetType === "comment" && r.targetId === `${post.id}/${comment.id}`);
  assert.equal(commentReport.communityId, community.id);
  await denied(member, "fileReport", { targetType: "comment", targetId: String(comment.id), reason: "Duplicate normalized comment" });
  pass("private message and block guards hold; genuine DMs and canonical comment reports keep correct ownership");
  const invite = await ok(owner, "createInvite", { slug: bannedSpace.id, maxUses: 1 });
  // A private fixture invite is accepted by the existing shared join guard.
  await ok(member, "joinCommunity", { slug: bannedSpace.id, invite: invite.code });
  await ok(owner, "setMemberRole", { slug: bannedSpace.id, userId: member.id, action: "ban" });
  assert.equal((await ok(member, "listMySafetyCommunities")).find(c => c.id === bannedSpace.id).status, "banned");
  assert.equal((await ok(member, "getMyStanding", bannedSpace.id)).status, "banned");
  pass("own safety list retains removed private communities for appeals with no other-member data");
  console.log(`Site reports integration: ${groups} groups passed`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { testFixtures } = await import("./smoke-platform-v9.mjs");
  await verifySiteReports(testFixtures);
}
