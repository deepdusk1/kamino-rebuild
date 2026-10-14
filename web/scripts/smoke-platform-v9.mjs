import {fixtureAuthFetch} from "./fixture-auth.mjs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { signJWT } from "../node_modules/better-auth/dist/crypto/jwt.mjs";
const base = process.env.TEST_ORIGIN ?? "http://localhost:8085";
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(base).hostname))
  throw new Error("Fixture verification runs on loopback only.");
const secret = process.env.TEST_AUTH_SECRET;
if (!secret) throw new Error("Set TEST_AUTH_SECRET to the local fixture server secret.");
let groups = 0;
const pass = (name) => console.log(`PASS ${++groups} ${name}`);
async function call(who, name, data) {
  const r = await fetch(`${base}/api/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(who?.token ? { authorization: `Bearer ${who.token}` } : {}),
    },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(60000),
  });
  return { status: r.status, ...(await r.json()) };
}
async function ok(who, name, data) {
  const r = await call(who, name, data);
  assert.equal(r.error, undefined, `${name}: ${r.error?.message}`);
  return r.result;
}
async function no(who, name, data) {
  const r = await call(who, name, data);
  assert.ok(r.error, `${name} must refuse`);
  return r;
}
async function signup(name, email, birth = { year: 1990, month: 1, day: 1 }) {
  const password = randomBytes(16).toString("hex");
  const r = await fixtureAuthFetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      name,
      email: email ?? `platform-${randomBytes(8).toString("hex")}@example.test`,
      password,
    }),
  });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  const who = {
    id: j.user.id,
    email: j.user.email,
    password,
    token: r.headers.get("set-auth-token"),
  };
  assert.ok(who.token);
  who.handle = (await ok(who, "bootstrap")).profile.handle;
  await ok(who, "confirmMinimumAge", birth);
  return who;
}
const owner = await signup("Platform owner", process.env.TEST_ADMIN_EMAIL ?? "v9-owner@example.test"),
  member = await signup("Platform member"),
  other = await signup("Platform other");
await no(owner, "getAdminDashboard");
await no(owner, "listSiteReports", {});
await no(owner, "reviewSiteReport", { id: 1, status: "resolved" });
await no(member, "setPlatformFlag", { key: "fixture_test", enabled: true });
pass("unverified allowlist and ordinary members cannot administer");
const verification = await signJWT({ email: owner.email }, secret, 3600);
const verify = await fetch(
  `${base}/api/auth/verify-email?token=${encodeURIComponent(verification)}&callbackURL=${encodeURIComponent("/security")}`,
  { redirect: "manual" },
);
assert.ok([200, 302].includes(verify.status));
assert.equal((await ok(owner, "getIdentityDashboard")).isAdmin, true);
assert.ok((await ok(owner, "getAdminDashboard")).metrics);
pass("real email verification enables configured administrator");
const c = await ok(owner, "createCommunity", {
  name: `Platform lab ${Date.now()}`,
  category: "Art",
  tagline: "Testing tools",
  description: "A place to create together",
  rules: "Be kind",
  visibility: "public",
  ageGate: 13,
});
await ok(member, "joinCommunity", { slug: c.id });
const p = await ok(owner, "createPost", {
  slug: c.id,
  type: "blog",
  title: "Community progress",
  body: "A thoughtful studio update",
});
await ok(member, "recordPostView", { postId: p.id });
await ok(member, "recordPostView", { postId: p.id });
const stats = await ok(owner, "getCreatorDashboard");
assert.equal(Number(stats.stats.views), 1);
assert.ok(stats.topPosts.some((x) => Number(x.id) === p.id));
pass("creator dashboard counts actual unique viewers");
await ok(owner, "adminSetVerified", { userId: owner.id, creator: true });
const related = () => ok(member, "getDiscoveryHub", { contextCommunityId: c.id });
let hub = await related();
assert.equal(hub.relatedEnabled, true);
assert.ok(hub.relatedPosts.some(x => Number(x.id) === p.id));
assert.ok(hub.relatedCreators.some(x => x.user_id === owner.id));
await ok(owner, "updateIdentityPreferences", { searchVisible: false });
hub = await related();
assert.ok(!hub.relatedPosts.some(x => Number(x.id) === p.id));
assert.ok(!hub.relatedCreators.some(x => x.user_id === owner.id));
await ok(owner, "updateIdentityPreferences", { searchVisible: true });
await ok(member, "setPersonRelationship", { targetHandle: owner.handle, kind: "mute", enabled: true });
assert.ok(!(await related()).relatedPosts.some(x => Number(x.id) === p.id));
await ok(member, "setPersonRelationship", { targetHandle: owner.handle, kind: "mute", enabled: false });
await ok(owner, "blockUser", member.id);
hub = await related();
assert.ok(!hub.relatedPosts.some(x => Number(x.id) === p.id));
assert.ok(!hub.relatedCreators.some(x => x.user_id === owner.id));
await ok(owner, "blockUser", member.id);
await ok(owner, "setPostFlags", { slug: c.id, postId: p.id, hidden: true });
assert.ok(!(await related()).relatedPosts.some(x => Number(x.id) === p.id));
await ok(owner, "setPostFlags", { slug: c.id, postId: p.id, hidden: false });
const privateC = await ok(owner, "createCommunity", {
  name: `Private related lab ${Date.now()}`, category: "Art", tagline: "Private fixture",
  description: "Private related work", rules: "Be kind", visibility: "private", ageGate: 13,
});
const privateP = await ok(owner, "createPost", { slug: privateC.id, type: "blog", title: "Private related work", body: "Should never appear outside this space" });
assert.ok(!(await related()).relatedPosts.some(x => Number(x.id) === privateP.id));
await no(member, "getDiscoveryHub", { contextCommunityId: privateC.id });
const adultC = await ok(owner, "createCommunity", {
  name: `Adult related lab ${Date.now()}`, category: "Art", tagline: "Age fixture",
  description: "Adult related work", rules: "Be kind", visibility: "public", ageGate: 18,
});
const adultP = await ok(owner, "createPost", { slug: adultC.id, type: "blog", title: "Adult related work", body: "Age-restricted related fixture" });
const teen = await signup("Related teen fixture", undefined, { year: 2009, month: 1, day: 1 });
const teenHub = await ok(teen, "getDiscoveryHub", { contextCommunityId: c.id });
assert.ok(!teenHub.relatedPosts.some(x => Number(x.id) === adultP.id));
assert.ok(!teenHub.relatedCreators.some(x => x.user_id === owner.id));
await no(teen, "getDiscoveryHub", { contextCommunityId: adultC.id });
pass("related posts/creators respect context, hidden content, search privacy, mute, bilateral blocks, private spaces and age");
await ok(owner, "setPlatformFlag", { key: "related_discovery", enabled: true, rolloutPercent: 0 });
hub = await related();
assert.equal(hub.relatedEnabled, false);
assert.deepEqual(hub.relatedPosts, []);
assert.deepEqual(hub.relatedCreators, []);
assert.equal((await ok(member, "getFeatureFlags")).related_discovery, false);
await ok(owner, "setPlatformFlag", { key: "related_discovery", enabled: true, rolloutPercent: 100 });
assert.ok((await related()).relatedPosts.some(x => Number(x.id) === p.id));
await ok(owner, "setPlatformFlag", { key: "discovery_assistant", enabled: false, rolloutPercent: 100 });
assert.equal((await related()).aiAvailable, false);
assert.match((await no(member, "aiAssistant", { task: "discover", text: "Help me discover" })).error.message, /unavailable for this account/);
await ok(owner, "setPlatformFlag", { key: "discovery_assistant", enabled: true, rolloutPercent: 100 });
pass("recognized discovery switches control returned panels and server assistant authorization");
await ok(member, "recordCommunityVisit", { communityId: c.id });
assert.ok((await ok(member, "getDiscoveryHub", {})).visits.some((x) => x.id === c.id));
await ok(member, "setDiscoveryFeedback", {
  targetType: "community",
  targetId: c.id,
  preference: "hide",
});
assert.ok(!(await ok(member, "getDiscoveryHub", {})).communities.some((x) => x.id === c.id));
await ok(member, "resetDiscovery");
assert.equal((await ok(member, "getDiscoveryHub", {})).visits.length, 0);
pass("recent visits and hide/reset discovery persist");
await ok(member, "updateIdentityPreferences", { searchVisible: false });
assert.ok(
  !(await ok(owner, "searchSuggestions", { query: member.handle })).people.some(
    (x) => x.handle === member.handle,
  ),
);
pass("autocomplete respects member search privacy");
const collection = await ok(owner, "saveEditorialCollection", {
  title: "Studio picks",
  description: "Handpicked places",
  communityIds: [c.id],
  published: true,
});
assert.ok(
  (await ok(member, "getDiscoveryHub", {})).collections.some((x) => x.id === collection.id),
);
await no(member, "saveEditorialCollection", {
  title: "Wrong editor",
  communityIds: [],
  published: true,
});
pass("editorial collections require administrator and show readable communities");
await ok(owner, "setPlatformFlag", { key: "fixture_test", enabled: true, rolloutPercent: 100 });
assert.equal((await ok(member, "getFeatureFlags")).fixture_test, true);
await ok(owner, "setPlatformFlag", { key: "fixture_test", enabled: true, rolloutPercent: 0 });
assert.equal((await ok(member, "getFeatureFlags")).fixture_test, false);
await no(owner, "setPlatformFlag", { key: "payments_enabled", enabled: true });
pass("rollout flags cannot bypass the payment gate");
for (const kind of ["membership", "tip", "gift", "ticket", "marketplace"]) {
  const offer = await ok(owner, "saveCreatorOffer", {
    kind,
    title: `Studio ${kind}`,
    description: "Configurable paid offer",
    priceMinor: 500,
    currency: "usd",
    published: true,
    communityId: c.id,
  });
  assert.ok((await ok(member, "getMarketplace")).offers.some((o) => Number(o.id) === offer.id));
  await no(member, "saveCreatorOffer", {
    id: offer.id,
    kind,
    title: "Stolen offer",
    priceMinor: 500,
    published: true,
  });
  assert.match(
    (await no(member, "requestCheckout", { offerId: offer.id })).error.message,
    /disabled/,
  );
}
assert.equal((await ok(member, "getMarketplace")).paymentsEnabled, false);
pass("paid offer catalog saves; ownership enforced; every checkout refused");
const ticket = await ok(member, "submitSupportTicket", {
  subject: "Need help",
  body: "Could you help me find my saved posts?",
});
assert.equal((await ok(other, "getMySupportTickets")).length, 0);
await no(other, "respondSupportTicket", { id: ticket.id, status: "resolved", response: "No" });
await ok(owner, "respondSupportTicket", {
  id: ticket.id,
  status: "resolved",
  response: "Open Saved from your account menu.",
});
assert.equal((await ok(member, "getMySupportTickets"))[0].status, "resolved");
pass("support tickets are private and administrator replies persist");
await ok(owner, "adminSaveTaxonomy", {
  key: "studio_test",
  label: "Studio craft",
  icon: "🎨",
  active: true,
});
assert.ok((await ok(member, "getCustomTaxonomy")).some((t) => t.key === "studio_test"));
await ok(owner, "adminSaveCommunity", {
  communityId: c.id,
  category: "Studio craft",
  language: "fr",
  verified: true,
});
assert.equal(
  (await ok(member, "getCommunityPage", { slug: c.id })).community.category,
  "Studio craft",
);
pass("managed categories and community metadata are usable");
await ok(owner, "adminFeatureCreator", { userId: member.id, featured: true });
await ok(other, "joinCommunity", { slug: c.id });
await ok(owner, "adminSetVerified", { userId: other.id, creator: true });
const otherP = await ok(other, "createPost", { slug: c.id, type: "blog", title: "Other creator work", body: "Account-status suggestion fixture" });
assert.ok((await related()).relatedCreators.some(x => x.user_id === other.id));
await ok(owner, "adminSetAccountStatus", {
  userId: other.id,
  status: "suspended",
  reason: "Fixture temporary suspension",
  days: 1,
});
await no(other, "getDiscoveryHub", {});
hub = await related();
assert.ok(!hub.relatedCreators.some(x => x.user_id === other.id));
assert.ok(!hub.relatedPosts.some(x => Number(x.id) === otherP.id));
await ok(owner, "adminSetAccountStatus", {
  userId: other.id,
  status: "active",
  reason: "Fixture suspension lifted",
});
const restored = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: other.email, password: other.password }),
});
assert.equal(restored.status, 200);
other.token = restored.headers.get("set-auth-token");
assert.ok(other.token);
await ok(other, "getDiscoveryHub", {});
pass("suspension revokes sessions; reinstated member can sign in again");
await ok(member, "toggleFollowProfile", owner.id);
const campaign = await ok(owner, "adminPublishCampaign", {
  title: "Studio news",
  body: "Welcome to the expanded tools",
  href: "/discover-plus",
});
const jobs = async (auth) => {
  const r = await fetch(`${base}/api/v1/jobs`, {
    method: "POST",
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
    signal: AbortSignal.timeout(60000),
  });
  const text = await r.text();
  return { status: r.status, body: r.ok ? JSON.parse(text) : text };
};
assert.equal((await jobs()).status, 401);
const run = await jobs(process.env.TEST_JOB_SECRET ?? "v9-local-jobs-fixture");
assert.equal(run.status, 200, JSON.stringify(run.body));
const repeat = await jobs(process.env.TEST_JOB_SECRET ?? "v9-local-jobs-fixture");
assert.equal(repeat.status, 200, JSON.stringify(repeat.body));
assert.equal(repeat.body.delivered, 0);
assert.ok(campaign.id);
pass("protected background worker runs and repeat delivery is idempotent");
const get = await fetch(`${base}/api/v1/rpc/resetDiscovery?data={}`, {
  headers: { authorization: `Bearer ${member.token}` },
});
assert.equal(get.status, 405);
pass("GET requests cannot perform mutations");
assert.ok((await ok(owner, "getAdminDashboard")).audit.length >= 8);
pass("administration writes leave reviewable audit entries");
console.log(`Platform v9 integration: ${groups} groups passed`);
export const testFixtures = { owner, member, community: c, post: p };
