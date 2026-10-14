/**
 * Integration test for the redesign's social features (src/lib/kamino/social.ts and the changes around it).
 * Talks to a RUNNING server over the phone API (`/api/v1/rpc/<name>`, JSON + bearer tokens), like smoke-mobile.mjs.
 *
 * Start the server with the site owner set and rate limits off, on a fresh data folder.
 * Supply TEST_ADMIN_TOKEN for a provisioned, email-verified admin session, or verify the site-owner
 * fixture using the real development verification link before re-running this suite.
 *   npm run test:social            (TEST_ORIGIN=http://localhost:<port> for another port)
 *
 * It creates throwaway accounts and communities. One scheduled post is published about 70 seconds after it is
 * made, so the run takes a little over a minute.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const base = process.env.TEST_ORIGIN ?? "http://localhost:8080";
let passed = 0;
const pass = (name) => {
  passed += 1;
  console.log(`PASS ${name}`);
};

async function call(token, name, data) {
  const res = await fetch(`${base}/api/v1/rpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: res.status, ...(await res.json()) };
}
async function ok(who, name, data) {
  const r = await call(who?.token ?? who, name, data);
  assert.equal(r.error, undefined, `${name} failed: ${r.error?.message}`);
  return r.result;
}
async function refused(who, name, data) {
  const r = await call(who?.token ?? who, name, data);
  assert.ok(r.error, `${name} should have been refused`);
  return r.error.message;
}

const OWNER_PASSWORD = "kamino-site-owner-smoke-1";
async function signUp(label, email) {
  const address = email ?? `social-${label}-${randomBytes(6).toString("hex")}@example.test`;
  const password = email ? OWNER_PASSWORD : randomBytes(16).toString("hex");
  let res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.TEST_AUTH_ORIGIN ?? base },
    body: JSON.stringify({ name: `Social ${label}`, email: address, password }),
  });
  if (res.status !== 200 && email) {
    // The site owner may already exist from an earlier run on the same data folder.
    res = await fetch(`${base}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: process.env.TEST_AUTH_ORIGIN ?? base },
      body: JSON.stringify({ email: address, password }),
    });
  }
  assert.equal(res.status, 200, `sign-up ${label}`);
  const token = res.headers.get("set-auth-token");
  const body = await res.json();
  const boot = await ok(token, "bootstrap", {});
  await ok(token, "confirmMinimumAge", { year: 1990, month: 1, day: 1 });
  return { token, id: body.user.id, handle: boot.profile.handle, name: boot.profile.displayName };
}
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const feedItems = async (who, filter = "all") => (await ok(who, "notificationsFeed", { filter })).items;
/** Raw notification rows (the Notifications list leaves chat messages out; the Chats tab counts those). */
const chatNotes = async (who, roomId) => (await ok(who, "listNotifications", {})).filter((n) => n.kind === "chat" && String(n.href).includes(String(roomId)));

// ── Set-up ──────────────────────────────────────────────────────────────────
const owner = process.env.TEST_ADMIN_TOKEN ? await (async () => {
  const boot = await ok(process.env.TEST_ADMIN_TOKEN, 'bootstrap');
  return {token:process.env.TEST_ADMIN_TOKEN,id:boot.profile.userId,handle:boot.profile.handle,name:boot.profile.displayName};
})() : await signUp("owner", "site-owner@example.test");
assert.equal((await ok(owner,'getIdentityDashboard')).isAdmin,true,
  'Social admin fixtures require a verified, provisioned identity. Set TEST_ADMIN_TOKEN or verify the fixture email using the real verification link.');
const alice = await signUp("alice");
const bob = await signUp("bob");
const carol = await signUp("carol");
const dave = await signUp("dave");
const eve = await signUp("eve");
const stamp = Date.now().toString(36);
const lab = await ok(owner, "createCommunity", {
  name: `Zephyrine Lab ${stamp}`, tagline: "Social QA", description: "Where the redesign is tested", category: "Art",
  visibility: "public", ageGate: 13, rules: "Be kind.",
});
for (const who of [alice, bob]) await ok(who, "joinCommunity", { slug: lab.id });
pass("set-up: accounts, a community and members");

// ── Onboarding ──────────────────────────────────────────────────────────────
const options = await ok(null, "interestOptions", undefined);
assert.equal(options.length, 18);
assert.ok(options.every((o) => o.key && o.label && o.emoji));
assert.equal((await ok(alice, "bootstrap", {})).profile.onboardedAt, null, "new people have not onboarded");
assert.deepEqual((await ok(alice, "saveInterests", { keys: ["art", "music", "nope", "art", "gaming"] })).keys, ["art", "music", "gaming"]);
assert.deepEqual((await ok(alice, "getMe", {})).profile.interests, ["art", "music", "gaming"]);
const suggestions = await ok(alice, "onboardingSuggestions", undefined);
assert.ok(suggestions.communities.length > 0 && suggestions.creators.length > 0);
assert.ok(suggestions.communities.every((c) => !c.joined && Array.isArray(c.memberFaces) && typeof c.onlineCount === "number"));
assert.ok(suggestions.creators.every((c) => c.userId !== alice.id && typeof c.followers === "number"));
assert.ok((await ok(alice, "finishOnboarding", undefined)).onboardedAt);
assert.ok((await ok(alice, "bootstrap", {})).profile.onboardedAt);
assert.equal((await call(null, "finishOnboarding", undefined)).status, 401);
pass("onboarding: interest list, saving interests, suggestions, finish");

// ── Profile settings ────────────────────────────────────────────────────────
await ok(alice, "updateSettings", {
  headline: "Digital Artist", pronouns: "she/her", location: "Kelowna", website: "alice.example.com",
  profileCategories: ["art", "daily", "bogus"], dmPrivacy: "everyone", timezone: "America/Vancouver",
  notifyPrefs: { digest: true },
});
let me = (await ok(alice, "getMe", {})).profile;
assert.equal(me.headline, "Digital Artist");
assert.equal(me.website, "https://alice.example.com/");
assert.deepEqual(me.profileCategories, ["art", "daily"]);
assert.equal(me.notifyPrefs.digest, true);
assert.equal(me.notifyPrefs.social, true);
assert.equal(me.bio, "", "fields that were not sent stay as they were");
assert.match(await refused(alice, "updateSettings", { website: "javascript:alert(1)" }), /http/);
assert.match(await refused(alice, "updateSettings", { quietStart: 25, quietEnd: 3 }), /0 to 23/);
assert.match(await refused(alice, "updateSettings", { timezone: "Mars/Olympus" }), /time zone/);
assert.match(await refused(alice, "updateSettings", { profileCategories: ["art", "daily", "gaming", "growth", "qa", "milestones", "music"] }), /six/);
pass("settings: headline, pronouns, location, website (http only), categories, prefs and validation");

// Quiet hours on right now (the in-app list must still fill; only pushes wait).
const hourNow = new Date().getUTCHours();
await ok(alice, "updateSettings", { quietStart: hourNow, quietEnd: (hourNow + 2) % 24, timezone: "UTC" });
me = (await ok(alice, "getMe", {})).profile;
assert.deepEqual([me.quietStart, me.quietEnd, me.timezone], [hourNow, (hourNow + 2) % 24, "UTC"]);

// ── Posts: tags, location, members-only, scheduled ─────────────────────────
const art = await ok(alice, "createPost", {
  slug: lab.id, type: "image", title: "Morning sketch", body: "Ink and coffee #sketch with @" + carol.handle,
  cover: PIXEL, hashtags: ["Art", "#wip", "bad tag"], location: "Kelowna",
});
assert.equal(art.scheduled, false);
let page = await ok(bob, "getPostPage", { slug: lab.id, postId: art.id });
assert.deepEqual(page.post.hashtags.slice(0, 3), ["art", "wip", "sketch"]);
assert.equal(page.post.location, "Kelowna");
assert.equal(page.post.visibility, "public");
const secret = await ok(alice, "createPost", { slug: lab.id, type: "blog", title: "Members only news", body: "Just for us", visibility: "members" });
assert.match(await refused(alice, "createPost", { slug: lab.id, type: "blog", title: "Bad vis", body: "x", visibility: "friends" }), /see the post/);
const later = await ok(alice, "createPost", { slug: lab.id, type: "blog", title: "Scheduled for later", body: "Not yet", publishAt: new Date(Date.now() + 3 * 3600_000).toISOString() });
assert.equal(later.scheduled, true);
const soonAt = Date.now() + 70_000;
const soon = await ok(alice, "createPost", { slug: lab.id, type: "blog", title: "Published in a minute", body: "Soon", publishAt: new Date(soonAt).toISOString() });
assert.match(await refused(alice, "createPost", { slug: lab.id, type: "blog", title: "Too far", body: "x", publishAt: new Date(Date.now() + 90 * 86400_000).toISOString() }), /60 days/);

const ids = (list) => list.map((p) => p.id);
// Members-only: carol is not a member.
assert.ok(!ids((await ok(carol, "getCommunityPage", { slug: lab.id })).posts).includes(secret.id));
assert.ok(ids((await ok(bob, "getCommunityPage", { slug: lab.id })).posts).includes(secret.id));
assert.match(await refused(carol, "getPostPage", { slug: lab.id, postId: secret.id }), /unavailable/);
assert.match(await refused(null, "getPostPage", { slug: lab.id, postId: secret.id }), /unavailable/);
assert.ok(!ids((await ok(carol, "searchEverything", { q: "Members only news", kind: "posts" })).posts).includes(secret.id));
assert.ok(ids((await ok(bob, "searchEverything", { q: "Members only news", kind: "posts" })).posts).includes(secret.id));
assert.ok(!ids((await ok(carol, "searchAll", "Members only news")).posts).includes(secret.id));
pass("members-only posts: hidden from non-members everywhere, shown to members");

// Scheduled: nobody but alice sees it until it is due.
for (const [label, list] of [
  ["community page", (await ok(bob, "getCommunityPage", { slug: lab.id })).posts],
  ["home feed", (await ok(bob, "homeFeed", {})).latest],
  ["feed tab", (await ok(bob, "feed", { tab: "communities" })).posts],
  ["for you", (await ok(bob, "feed", { tab: "forYou" })).posts],
  ["search", (await ok(bob, "searchEverything", { q: "Scheduled for later" })).posts],
  ["old search", (await ok(bob, "searchAll", "Scheduled for later")).posts],
  ["profile", (await ok(bob, "getPublicProfile", alice.handle)).recent],
  ["profile posts", (await ok(bob, "profilePosts", { handle: alice.handle })).posts],
  ["community overview", (await ok(bob, "communityOverview", { slug: lab.id })).recent],
]) {
  assert.ok(!ids(list).includes(later.id), `${label} must hide the scheduled post`);
  assert.ok(!ids(list).includes(soon.id), `${label} must hide the soon post`);
}
assert.match(await refused(bob, "getPostPage", { slug: lab.id, postId: later.id }), /unavailable/);
assert.match(await refused(bob, "toggleLike", later.id), /unavailable/);
const own = (await ok(alice, "getCommunityPage", { slug: lab.id })).posts.find((p) => p.id === later.id);
assert.ok(own && own.scheduled === true && own.publishAt, "the author sees their own scheduled post, marked");
assert.equal((await ok(alice, "getPostPage", { slug: lab.id, postId: later.id })).post.scheduled, true);
pass("scheduled posts: hidden from every list and page until due; the author sees them marked");

// ── Social graph, likes, comments, mentions, notifications ─────────────────
assert.deepEqual(await ok(bob, "toggleFollowProfile", alice.id), { following: true, requested: false });
await ok(bob, "toggleLike", art.id);
await ok(bob, "addComment", { postId: art.id, body: "Love the colours!" });
let items = await feedItems(alice);
const like = items.find((n) => n.kind === "like" && n.actorId === bob.id);
assert.ok(like, "like notification has the actor even during quiet hours");
assert.equal(like.actor.handle, bob.handle);
assert.equal(like.verb, "liked your post");
assert.equal(like.category, "social");
assert.equal(like.targetType, "post");
assert.equal(like.thumb, `/api/v1/media/post/${art.id}/0`);
const comment = items.find((n) => n.kind === "comment" && n.actorId === bob.id);
assert.equal(comment.snippet, "Love the colours!");
const follow = items.find((n) => n.kind === "follow" && n.actorId === bob.id);
assert.equal(follow.action, "followBack");
assert.equal(follow.actionTarget, bob.id);
assert.equal(follow.actorFollowed, false);
const mention = (await feedItems(carol)).find((n) => n.kind === "mention");
assert.ok(mention && mention.actorId === alice.id && mention.targetId === String(art.id), "carol was mentioned (public community)");
assert.ok((await feedItems(alice, "social")).every((n) => n.category === "social"));
pass("notifications: actor, verb, thumbnail, snippet, Follow Back, mentions, categories, quiet hours keep the list");

// Follow Back
assert.equal((await ok(alice, "toggleFollowProfile", bob.id)).following, true);
const followAgain = (await feedItems(alice)).find((n) => n.kind === "follow" && n.actorId === bob.id);
assert.equal(followAgain.actorFollowed, true);
assert.equal(followAgain.action, null);
const friends = await ok(bob, "followLists", { handle: alice.handle, kind: "friends" });
assert.ok(friends.people.some((p) => p.userId === bob.id));
assert.equal(friends.counts.friends, 1);
const followers = await ok(carol, "followLists", { handle: alice.handle, kind: "followers" });
assert.ok(followers.people.some((p) => p.userId === bob.id && p.followsYou === false));
pass("Follow Back, friends (mutual follows) and follower lists");

// Older notification rows without an actor still display.
const achievementRow = (await feedItems(alice, "community")).find((n) => n.actor === null);
if (achievementRow) assert.equal(achievementRow.verb, "");
assert.ok((await feedItems(alice, "community")).every((n) => n.category === "community"));

// ── Events: next event card and reminders ───────────────────────────────────
await ok(owner, "createEvent", { slug: lab.id, title: "Talent Show", body: "Bring your best", kind: "event", startsAt: new Date(Date.now() + 3600_000).toISOString() });
let home = await ok(alice, "homeOverview", {});
assert.equal(home.liveEvent?.title, "Talent Show");
assert.equal(home.liveEvent.going, false);
await ok(alice, "rsvpEvent", { slug: lab.id, eventId: home.liveEvent.id });
home = await ok(alice, "homeOverview", {});
assert.equal(home.liveEvent.going, true);
assert.ok(home.liveEvent.faces.some((f) => f.userId === alice.id));
const reminder = (await feedItems(alice, "events")).find((n) => n.kind === "event");
assert.ok(reminder && reminder.event?.title === "Talent Show" && reminder.action === "open", "an event reminder appears without any timer");
assert.equal((await feedItems(alice, "events")).filter((n) => n.kind === "event").length, 1, "only one reminder per event");
pass("events: next event card with going state, reminders (once) in the Events tab");

// ── Home ────────────────────────────────────────────────────────────────────
const anonHome = await ok(null, "homeOverview", undefined);
assert.equal(anonHome.heroes.length, 4);
assert.ok(anonHome.heroes.every((h) => h.title && h.art && h.href && h.cta));
assert.equal(anonHome.streak.week.length, 7);
assert.ok(anonHome.recommended.length > 0 && anonHome.trending.length > 0);
assert.ok(anonHome.liveRooms.length > 0, "sample voice rooms are live");
await ok(alice, "checkIn", {});
home = await ok(alice, "homeOverview", {});
assert.equal(home.streak.checkedInToday, true);
assert.ok(home.streak.days >= 1 && home.streak.week.filter(Boolean).length >= 1);
assert.ok(home.recommended.every((c) => !c.joined));
assert.ok(home.featuredCreators.every((c) => c.userId !== alice.id));
const gamingHome = await ok(alice, "homeOverview", { interest: "gaming" });
assert.ok(gamingHome.recommended.every((c) => ["Games", "Tabletop", "Gaming"].includes(c.category) || c.topics.some((t) => /gaming/i.test(t))));
pass("home: heroes, streak card, recommended, trending, creators, live rooms, chip filter");

// ── Feed tabs ───────────────────────────────────────────────────────────────
const following = await ok(bob, "feed", { tab: "following" });
assert.ok(following.posts.some((p) => p.id === art.id && p.communityName));
assert.ok(following.posts.every((p) => p.author.userId === alice.id));
const communities = await ok(bob, "feed", { tab: "communities" });
assert.ok(communities.posts.some((p) => p.id === secret.id), "members-only posts show to members");
const anonFeed = await ok(null, "feed", { tab: "forYou" });
assert.ok(anonFeed.posts.length > 0);
assert.ok(!anonFeed.posts.some((p) => p.id === secret.id));
if (anonFeed.next) assert.ok((await ok(null, "feed", { tab: "forYou", cursor: anonFeed.next })).posts.length > 0);
assert.deepEqual(await ok(null, "feed", { tab: "following" }), { posts: [], next: null });
pass("feed: For You (ranked, pages), Following, Communities");

// ── Communities: overview, topics, invites, live rooms ─────────────────────
assert.deepEqual((await ok(owner, "setCommunityTopics", { slug: lab.id, topics: ["Fan Art", "#Sketch", "fan art", "Ink"] })).topics, ["Fan Art", "Sketch", "Ink"]);
assert.match(await refused(bob, "setCommunityTopics", { slug: lab.id, topics: ["Nope"] }), /leaders/);
await ok(owner, "featurePost", { slug: lab.id, postId: art.id });
let overview = await ok(bob, "communityOverview", { slug: lab.id });
assert.deepEqual(overview.community.topics, ["Fan Art", "Sketch", "Ink"]);
assert.equal(overview.community.joined, true);
assert.ok([1, 5, 10, 25, 50, 100].includes(overview.rankPercent));
const lead = overview.moderators.find((m) => m.userId === owner.id);
assert.deepEqual([lead.badge, lead.label], ["leader", "Leader"]);
assert.ok(overview.featured.some((p) => p.id === art.id));
assert.ok(overview.media.some((m) => m.postId === art.id && m.url === `/api/v1/media/post/${art.id}/0`));
assert.ok(overview.events.some((e) => e.title === "Talent Show"));
assert.ok(overview.onlineCount >= 1 && overview.onlineFaces.length >= 1, "people active right now count as online");
assert.ok(overview.rooms.some((r) => r.kind === "public"), "the lobby is listed");
const privateHall = await ok(owner, "createCommunity", { name: `Hidden Lab ${stamp}`, tagline: "x", description: "x", category: "Art", visibility: "private", ageGate: 13, rules: "x" });
const lockedView = await ok(carol, "communityOverview", { slug: privateHall.id });
assert.equal(lockedView.locked, true);
assert.equal(lockedView.recent.length, 0);
pass("community overview: topics (leaders only), rank badge, moderators, featured, media, events, rooms, locked");

assert.deepEqual(await ok(owner, "inviteToCommunity", { slug: lab.id, userId: carol.id }), { ok: true, already: false });
assert.equal((await ok(owner, "inviteToCommunity", { slug: lab.id, userId: carol.id })).already, true);
const invite = (await feedItems(carol, "community")).find((n) => n.kind === "invite");
assert.equal(invite.action, "join");
assert.equal(invite.actionTarget, lab.id);
assert.equal(invite.community.id, lab.id);
assert.ok(invite.community.memberCount >= 3);
assert.equal(invite.verb, "invited you to join");
pass("community invites: notification with a Join button and the community's details");

const live = await ok(alice, "startLiveRoom", { slug: lab.id, name: "Late Night Vibes", topic: "Music" });
assert.ok(live.roomId > 0);
assert.match(await refused(carol, "startLiveRoom", { slug: lab.id, name: "Not a member" }), /Join/);
const bobLive = await ok(bob, "liveRooms", { scope: "joined" });
const card = bobLive.find((r) => r.roomId === live.roomId);
assert.ok(card && card.liveCount >= 1 && card.topic === "Music" && card.joined === true && card.color.startsWith("#"));
const liveNote = (await feedItems(bob, "events")).find((n) => n.kind === "live");
assert.ok(liveNote && liveNote.live === true && liveNote.room.name === "Late Night Vibes" && liveNote.actorId === alice.id);
pass("live rooms: start one, followers in the community are told, cards show who is in");

// ── Explore and search ─────────────────────────────────────────────────────
const explore = await ok(alice, "exploreOverview", {});
assert.equal(explore.banners.length, 3);
assert.ok(explore.joined.some((c) => c.id === lab.id));
assert.ok(explore.newest.length > 0);
assert.ok(Array.isArray(explore.trendingTags) && explore.trendingTags.every((t) => t.tag && t.count > 0));
const artExplore = await ok(null, "exploreOverview", { category: "art" });
assert.ok(artExplore.recommended.length > 0 && !artExplore.recommended.some((c) => c.id === "pixel-realms"), "the Art chip leaves out game communities");

let found = await ok(alice, "searchEverything", { q: `Zephyrine Lab ${stamp}` });
assert.ok(found.communities.some((c) => c.id === lab.id));
assert.equal(found.fuzzy, false);
found = await ok(alice, "searchEverything", { q: "Zephyrne", kind: "communities" });
assert.ok(found.communities.some((c) => c.id === lab.id), "a typo still finds the community");
assert.equal(found.fuzzy, true);
assert.equal(found.people.length, 0, "only the asked kind is filled");
found = await ok(alice, "searchEverything", { q: bob.handle, kind: "people" });
assert.ok(found.people.some((p) => p.userId === bob.id && p.following === true && p.followsYou === true));
found = await ok(alice, "searchEverything", { q: "#sketch" });
assert.ok(found.posts.some((p) => p.id === art.id));
assert.ok(found.tags.some((t) => t.tag === "sketch"));
found = await ok(bob, "searchEverything", { q: "Late Night", kind: "rooms" });
assert.ok(found.rooms.some((r) => r.roomId === live.roomId));
found = await ok(bob, "searchEverything", { q: "Talent", kind: "events" });
assert.ok(found.events.some((e) => e.title === "Talent Show"));
found = await ok(null, "searchEverything", { q: "ink", kind: "communities", safe: true });
assert.ok(!found.communities.some((c) => c.ageGate >= 16), "safe search leaves out 16+ communities");
found = await ok(null, "searchEverything", { q: "", kind: "communities", sort: "members", minMembers: 2 });
assert.ok(found.communities.every((c) => c.memberCount >= 2));
const recent = await ok(alice, "recentSearches", undefined);
assert.equal(recent[0].query, "#sketch", "newest first");
assert.ok(recent.some((r) => r.query === "Zephyrne"));
assert.equal(new Set(recent.map((r) => r.query.toLowerCase())).size, recent.length, "no repeats");
await ok(alice, "clearRecentSearches", undefined);
assert.equal((await ok(alice, "recentSearches", undefined)).length, 0);
pass("explore and search: banners, rows, typo tolerance, kinds, tags, rooms, events, filters, recent searches");

// ── Site owner: blue ticks and Creator ──────────────────────────────────────
assert.match(await refused(bob, "adminSetVerified", { userId: alice.id, verified: true }), /site owner/);
assert.deepEqual(await ok(owner, "adminSetVerified", { handle: alice.handle, verified: true, creator: true }), { userId: alice.id, verified: true, creator: true });
assert.equal((await ok(owner, "adminSetCommunityVerified", { slug: lab.id, verified: true })).verified, true);
assert.match(await refused(bob, "adminSetCommunityVerified", { slug: lab.id, verified: false }), /site owner/);
const ticked = (await ok(bob, "feed", { tab: "following" })).posts.find((p) => p.id === art.id);
assert.equal(ticked.authorVerified, true);
pass("site owner sets verified / Creator (people and communities); others cannot");

// ── Profile overview ───────────────────────────────────────────────────────
const prof = await ok(bob, "profileOverview", { handle: alice.handle });
assert.equal(prof.profile.headline, "Digital Artist");
assert.equal(prof.profile.verified, true);
assert.equal(prof.profile.creator, true);
assert.equal(prof.profile.online, true);
assert.deepEqual(prof.profile.profileCategories.map((c) => c.label), ["My Art", "Daily Life"]);
assert.equal(prof.profile.quietStart, null, "private settings are not shown to others");
assert.deepEqual(prof.profile.interests, []);
assert.equal(prof.following, true);
assert.equal(prof.followsYou, true);
assert.equal(prof.stats.friends, 1);
assert.ok(prof.stats.posts >= 2);
assert.ok(prof.recentPosts.length >= 1 && prof.recentPosts.length <= 3);
assert.ok(prof.communities.some((c) => c.id === lab.id));
assert.ok(prof.categoryCounts.art >= 1);
assert.ok(prof.streak.days >= 1);
assert.ok(Array.isArray(prof.badges) && Array.isArray(prof.showcase));
const self = await ok(alice, "profileOverview", { handle: alice.handle });
assert.equal(self.isSelf, true);
assert.equal(self.profile.quietStart, hourNow);
const artOnly = await ok(bob, "profilePosts", { handle: alice.handle, tag: "art" });
assert.ok(artOnly.posts.length >= 1 && artOnly.posts.every((p) => p.hashtags.includes("art")));
pass("profile overview: header, badges, counts, follow state, streak, posts, communities, category counts");

// ── Private accounts and follow requests ──────────────────────────────────
await ok(carol, "updateSettings", { privateAccount: true });
assert.deepEqual(await ok(dave, "toggleFollowProfile", carol.id), { following: false, requested: true });
let locked = await ok(dave, "profileOverview", { handle: carol.handle });
assert.equal(locked.locked, true);
assert.equal(locked.requested, true);
assert.equal(locked.recentPosts.length + locked.badges.length + locked.communities.length, 0);
assert.equal(locked.profile.displayName, carol.name);
assert.equal((await ok(dave, "getPublicProfile", carol.handle)).locked, true);
assert.equal((await ok(dave, "followLists", { handle: carol.handle, kind: "following" })).locked, true);
assert.deepEqual(await ok(eve, "toggleFollowProfile", carol.id), { following: false, requested: true });
assert.deepEqual(await ok(eve, "toggleFollowProfile", carol.id), { following: false, requested: false }, "asking again cancels");
assert.deepEqual(await ok(bob, "toggleFollowProfile", carol.id), { following: false, requested: true });
const requests = await ok(carol, "followRequests", undefined);
assert.deepEqual(requests.map((r) => r.userId).sort(), [bob.id, dave.id].sort());
assert.ok((await feedItems(carol, "social")).some((n) => n.kind === "follow_request" && n.actorId === dave.id));
await ok(carol, "answerFollowRequest", { userId: dave.id, accept: true });
await ok(carol, "answerFollowRequest", { userId: bob.id, accept: false });
assert.match(await refused(carol, "answerFollowRequest", { userId: bob.id, accept: true }), /no longer/);
locked = await ok(dave, "profileOverview", { handle: carol.handle });
assert.equal(locked.locked, false);
assert.equal(locked.following, true);
assert.equal((await ok(bob, "profileOverview", { handle: carol.handle })).locked, true);
assert.ok((await feedItems(dave)).some((n) => n.kind === "follow_accept" && n.actorId === carol.id));
pass("private accounts: requests, cancel, approve, decline; non-followers only see the header");

// ── Message requests, read receipts, typing ────────────────────────────────
const strangerRoom = (await ok(dave, "openDm", alice.id)).roomId;
await ok(dave, "sendMessage", { roomId: strangerRoom, body: "Hi Alice, love your art!" });
let chats = await ok(alice, "chatsOverview", undefined);
let row = chats.rooms.find((r) => r.id === strangerRoom);
assert.ok(row && row.isRequest === true && row.unread === 0, "a stranger's DM is a request with no unread badge");
assert.equal(chats.requests, 1);
assert.equal((await ok(alice, "listRooms", {})).find((r) => r.id === strangerRoom).unread, 0);
assert.equal((await chatNotes(alice, strangerRoom)).length, 0, "requests send no notification");
assert.equal((await ok(dave, "chatsOverview", undefined)).rooms.find((r) => r.id === strangerRoom).awaitingAccept, true);
await ok(alice, "acceptMessageRequest", strangerRoom);
row = (await ok(alice, "chatsOverview", undefined)).rooms.find((r) => r.id === strangerRoom);
assert.equal(row.isRequest, false);
await ok(dave, "sendMessage", { roomId: strangerRoom, body: "Thanks for accepting" });
assert.ok((await chatNotes(alice, strangerRoom)).length > 0, "once accepted, messages notify again");
assert.ok(!(await feedItems(alice)).some((n) => n.kind === "chat"), "the Notifications list leaves chat messages to the Chats tab");
assert.equal((await ok(alice, "chatsOverview", undefined)).rooms.find((r) => r.id === strangerRoom).unread, 1);

const spamRoom = (await ok(eve, "openDm", alice.id)).roomId;
await ok(eve, "sendMessage", { roomId: spamRoom, body: "Buy my stuff" });
await ok(alice, "declineMessageRequest", { roomId: spamRoom });
assert.ok(!(await ok(alice, "chatsOverview", undefined)).rooms.some((r) => r.id === spamRoom));
assert.ok(!(await ok(alice, "listRooms", {})).some((r) => r.id === spamRoom));
assert.match(await refused(alice, "acceptMessageRequest", { roomId: 999999 }), /no longer/);

const friendRoom = (await ok(bob, "openDm", alice.id)).roomId; // bob shares a community and is followed: no request
assert.equal((await ok(alice, "chatsOverview", undefined)).rooms.find((r) => r.id === friendRoom)?.isRequest ?? false, false);
const sent = await ok(bob, "sendMessage", { roomId: friendRoom, body: "Hey!" });
chats = await ok(bob, "chatsOverview", undefined);
row = chats.rooms.find((r) => r.id === friendRoom);
assert.deepEqual([row.lastAuthor, row.lastKind, row.isGroup, row.peerVerified, row.peerOnline], ["You", "text", false, true, true]);
assert.ok(chats.rooms.some((r) => r.isGroup && r.communityName), "community chats are groups");
pass("message requests: strangers wait in Requests (no badge, no notification); accept, decline; chat rows");

assert.equal((await ok(alice, "markRoomRead", { roomId: friendRoom, lastId: sent.id + 1000 })).lastReadId, sent.id);
let receipts = await ok(bob, "roomReceipts", { roomId: friendRoom });
assert.deepEqual(receipts.seenBy.map((s) => [s.userId, s.lastReadId]), [[alice.id, sent.id]]);
await ok(alice, "updateSettings", { showReadReceipts: false });
assert.equal((await ok(bob, "roomReceipts", { roomId: friendRoom })).seenBy.length, 0, "receipts off: not shown");
assert.equal((await ok(alice, "roomReceipts", { roomId: friendRoom })).seenBy.length, 0, "and you don't see others'");
await ok(alice, "updateSettings", { showReadReceipts: true });
assert.match(await refused(carol, "markRoomRead", { roomId: friendRoom, lastId: 1 }), /not in this room/);
await ok(bob, "setTyping", { roomId: friendRoom });
const typing = await ok(alice, "typingIn", { roomId: friendRoom });
assert.deepEqual(typing.userIds, [bob.id]);
assert.equal((await ok(bob, "typingIn", { roomId: friendRoom })).names.length, 0, "you never see yourself typing");
assert.match(await refused(carol, "setTyping", { roomId: friendRoom }), /not in this room/);
pass("read receipts (respecting the setting both ways) and typing");

// ── Post page helpers ─────────────────────────────────────────────────────
const c2 = await ok(alice, "addComment", { postId: art.id, body: "Thank you!" });
assert.equal(c2.held, false);
let comments = await ok(bob, "listComments", { postId: art.id, sort: "newest" });
assert.equal(comments[0].body, "Thank you!");
const bobs = comments.find((c) => c.body === "Love the colours!");
await ok(alice, "toggleCommentLike", bobs.id);
comments = await ok(bob, "listComments", { postId: art.id, sort: "top" });
assert.equal(comments[0].id, bobs.id);
assert.equal(comments[0].mine, true);
assert.equal(comments.find((c) => c.body === "Thank you!").authorVerified, true);
assert.match(await refused(carol, "listComments", { postId: secret.id }), /unavailable/);
const tags = await ok(alice, "suggestTags", { text: "A new sketch of the lighthouse at night", slug: lab.id });
assert.ok(Array.isArray(tags) && tags.length > 0 && tags.length <= 6);
assert.ok(tags.includes("sketch"));
pass("comments (newest / top) and tag suggestions");

// ── Deleting comments ─────────────────────────────────────────────────────
const countOf = async (postId) => (await ok(owner, "getPostPage", { slug: lab.id, postId })).post.commentCount;
const before = await countOf(art.id);
const doomed = await ok(bob, "addComment", { postId: art.id, body: "This one will be deleted" });
const doomedId = (await ok(bob, "listComments", { postId: art.id })).find((c) => c.body === "This one will be deleted").id;
assert.equal(doomed.held, false);
await ok(alice, "toggleCommentLike", doomedId);
assert.equal(await countOf(art.id), before + 1);
assert.match(await refused(carol, "deleteComment", { commentId: doomedId }), /only delete your own comments/);
assert.match(await refused(alice, "deleteComment", { commentId: doomedId }), /only delete your own comments/, "the post's author is not a moderator");
assert.equal((await call(null, "deleteComment", { commentId: doomedId })).status, 401);
assert.deepEqual(await ok(bob, "deleteComment", { commentId: doomedId }), { ok: true });
assert.equal(await countOf(art.id), before, "the count goes back down");
assert.ok(!(await ok(alice, "listComments", { postId: art.id })).some((c) => c.id === doomedId));
assert.match(await refused(bob, "deleteComment", { commentId: doomedId }), /already gone/);
// Moderators: the leader, and a curator, may delete anyone's comment in their community.
await ok(alice, "addComment", { postId: art.id, body: "Leader will tidy this" });
await ok(bob, "addComment", { postId: art.id, body: "Curator will tidy this" });
let listed = await ok(owner, "listComments", { postId: art.id });
const byLeader = listed.find((c) => c.body === "Leader will tidy this").id;
const byCurator = listed.find((c) => c.body === "Curator will tidy this").id;
assert.equal(await countOf(art.id), before + 2);
await ok(owner, "deleteComment", { commentId: byLeader });
await ok(owner, "setMemberRole", { slug: lab.id, userId: bob.id, action: "curator" });
await ok(bob, "deleteComment", { commentId: byCurator });
await ok(owner, "setMemberRole", { slug: lab.id, userId: bob.id, action: "member" });
assert.equal(await countOf(art.id), before, "moderator deletions keep the count right");
// A comment held by the safety check was never counted, so deleting it leaves the count alone.
const heldComment = await ok(alice, "addComment", { postId: art.id, body: "fake ids for sale cheap" });
assert.equal(heldComment.held, true);
assert.equal(await countOf(art.id), before);
const heldFlag = (await ok(owner, "listSafetyFlags", { slug: lab.id })).find((f) => f.targetType === "comment" && f.status === "open" && /fake ids/.test(f.excerpt));
assert.ok(heldFlag, "the held comment is in the safety queue");
await ok(owner, "deleteComment", { commentId: Number(heldFlag.targetId) });
assert.equal(await countOf(art.id), before, "deleting a held comment does not lower the count");
const settled = (await ok(owner, "listSafetyFlags", { slug: lab.id })).find((f) => f.id === heldFlag.id);
assert.equal(settled.status, "removed", "a moderator's deletion settles the open flag");
pass("deleting comments: author, leader and curator may; others get a kind no; count and likes stay right");

// ── Muting people ─────────────────────────────────────────────────────────
const mia = await signUp("mia");
const noah = await signUp("noah");
const olive = await signUp("olive");
for (const who of [mia, noah, olive]) await ok(who, "joinCommunity", { slug: lab.id });
await ok(mia, "toggleFollowProfile", noah.id);
await ok(mia, "toggleFollowProfile", olive.id);
const miaPost = await ok(mia, "createPost", { slug: lab.id, type: "blog", title: "Mia's garden diary", body: "Tomatoes are in" });
const noahPost = await ok(noah, "createPost", { slug: lab.id, type: "blog", title: "Noah loud post", body: "So many opinions #mutecheck" });
await ok(noah, "addComment", { postId: miaPost.id, body: "Noah was here" });
const noahRoom = (await ok(noah, "openDm", mia.id)).roomId;
await ok(noah, "sendMessage", { roomId: noahRoom, body: "Hi Mia" });
assert.ok(ids((await ok(mia, "feed", { tab: "following" })).posts).includes(noahPost.id), "before muting, noah's post is in mia's feed");
assert.ok((await chatNotes(mia, noahRoom)).length > 0);
assert.equal((await ok(mia, "chatsOverview", undefined)).rooms.find((r) => r.id === noahRoom).isRequest, false);

assert.match(await refused(mia, "mutePerson", { userId: mia.id, muted: true }), /yourself/);
assert.match(await refused(mia, "mutePerson", { userId: "nobody-at-all", muted: true }), /not found/);
assert.deepEqual(await ok(mia, "mutePerson", { userId: noah.id, muted: true }), { muted: true });
assert.deepEqual(await ok(mia, "mutePerson", { userId: noah.id, muted: true }), { muted: true }, "muting twice is fine");
const mutedList = await ok(mia, "listMutedPeople", undefined);
assert.deepEqual(mutedList.map((p) => p.userId), [noah.id]);
assert.ok(mutedList[0].handle === noah.handle && mutedList[0].mutedAt);
assert.equal((await ok(noah, "listMutedPeople", undefined)).length, 0);
assert.equal((await call(null, "listMutedPeople", undefined)).status, 401);

// Their posts and comments leave mia's lists ...
for (const [label, list] of [
  ["following tab", (await ok(mia, "feed", { tab: "following" })).posts],
  ["communities tab", (await ok(mia, "feed", { tab: "communities" })).posts],
  ["for you", (await ok(mia, "feed", { tab: "forYou" })).posts],
  ["community page", (await ok(mia, "getCommunityPage", { slug: lab.id })).posts],
  ["community overview", (await ok(mia, "communityOverview", { slug: lab.id })).recent],
  ["home feed", (await ok(mia, "homeFeed", {})).latest],
  ["search", (await ok(mia, "searchEverything", { q: "Noah loud post", kind: "posts" })).posts],
  ["old search", (await ok(mia, "searchAll", "Noah loud post")).posts],
]) assert.ok(!ids(list).includes(noahPost.id), `${label} must hide a muted person's post`);
assert.ok(!(await ok(mia, "listComments", { postId: miaPost.id })).some((c) => c.author.userId === noah.id));
assert.ok(!(await ok(mia, "getPostPage", { slug: lab.id, postId: miaPost.id })).comments.some((c) => c.author.userId === noah.id));
assert.ok(!(await ok(mia, "homeOverview", {})).featuredCreators.some((c) => c.userId === noah.id));
// ... but not other people's, and not on purpose: search still finds them, and their own profile shows their posts.
assert.ok((await ok(bob, "listComments", { postId: miaPost.id })).some((c) => c.author.userId === noah.id));
assert.ok(ids((await ok(bob, "getCommunityPage", { slug: lab.id })).posts).includes(noahPost.id));
assert.ok((await ok(mia, "searchEverything", { q: noah.handle, kind: "people" })).people.some((p) => p.userId === noah.id));
const noahProfile = await ok(mia, "profileOverview", { handle: noah.handle });
assert.equal(noahProfile.muted, true);
assert.equal(noahProfile.locked, false);
assert.ok(ids(noahProfile.recentPosts).includes(noahPost.id));
assert.ok(ids((await ok(mia, "profilePosts", { handle: noah.handle })).posts).includes(noahPost.id));
assert.equal((await ok(noah, "profileOverview", { handle: mia.handle })).muted, false, "noah is never told");

// No notifications (old ones included) and no unread count from them.
assert.ok(!(await feedItems(mia)).some((n) => n.actorId === noah.id), "old notifications from a muted person are hidden");
const unreadBefore = (await ok(mia, "notificationsFeed", { filter: "all" })).unread;
await ok(noah, "toggleLike", miaPost.id);
await ok(noah, "addComment", { postId: miaPost.id, body: `Hey @${mia.handle} look` });
await ok(noah, "toggleFollowProfile", mia.id);
await ok(noah, "sendMessage", { roomId: noahRoom, body: "Still here" });
assert.ok(!(await feedItems(mia)).some((n) => n.actorId === noah.id));
assert.ok(!(await ok(mia, "listNotifications", {})).some((n) => n.actorId === noah.id));
assert.equal((await ok(mia, "notificationsFeed", { filter: "all" })).unread, unreadBefore);
assert.equal((await ok(mia, "bootstrap", {})).unread, unreadBefore);

// They can still see mia and message her; the conversation waits in her Requests, and noah is not told.
assert.equal((await ok(noah, "profileOverview", { handle: mia.handle })).locked, false);
assert.ok(ids((await ok(noah, "getCommunityPage", { slug: lab.id })).posts).includes(miaPost.id));
let miaRow = (await ok(mia, "chatsOverview", undefined)).rooms.find((r) => r.id === noahRoom);
assert.equal(miaRow.isRequest, true);
assert.equal(miaRow.unread, 0);
assert.equal((await ok(noah, "chatsOverview", undefined)).rooms.find((r) => r.id === noahRoom).awaitingAccept, false);
// A new conversation from someone muted (who would not otherwise be a request) also waits, quietly.
await ok(mia, "mutePerson", { userId: olive.id, muted: true });
const oliveRoom = (await ok(olive, "openDm", mia.id)).roomId;
await ok(olive, "sendMessage", { roomId: oliveRoom, body: "Hello from Olive" });
assert.equal((await ok(mia, "chatsOverview", undefined)).rooms.find((r) => r.id === oliveRoom).isRequest, true);
assert.equal((await ok(olive, "chatsOverview", undefined)).rooms.find((r) => r.id === oliveRoom).awaitingAccept, false);
assert.ok(!(await feedItems(mia)).some((n) => n.actorId === olive.id));

// Unmuting puts everything back.
assert.deepEqual(await ok(mia, "mutePerson", { userId: noah.id, muted: false }), { muted: false });
await ok(mia, "mutePerson", { userId: olive.id, muted: false });
assert.equal((await ok(mia, "listMutedPeople", undefined)).length, 0);
const chatsBack = await ok(mia, "chatsOverview", undefined);
assert.equal(chatsBack.rooms.find((r) => r.id === noahRoom).isRequest, false);
assert.equal(chatsBack.rooms.find((r) => r.id === oliveRoom).isRequest, false);
assert.ok(ids((await ok(mia, "feed", { tab: "following" })).posts).includes(noahPost.id));
assert.ok((await ok(mia, "listComments", { postId: miaPost.id })).some((c) => c.author.userId === noah.id));
assert.equal((await ok(mia, "profileOverview", { handle: noah.handle })).muted, false);
await ok(noah, "toggleLike", miaPost.id); // unlike
await ok(noah, "toggleLike", miaPost.id); // like again: notifies now
assert.ok((await feedItems(mia)).some((n) => n.actorId === noah.id && n.kind === "like"));
pass("muting people: hidden from feeds, lists and notifications; DMs wait quietly in Requests; unmute restores");

// ── Albums: a cover plus nine more pictures ───────────────────────────────
const PIXEL_B = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const bigAlbum = await ok(alice, "createPost", {
  slug: lab.id, type: "image", title: "Ten pictures", body: "A full album", cover: PIXEL, album: [...Array(8).fill(PIXEL), PIXEL_B],
});
const bigPage = await ok(bob, "getPostPage", { slug: lab.id, postId: bigAlbum.id });
assert.equal(bigPage.post.payload.albumCount, 9);
const lastPicture = await fetch(`${base}/api/v1/media/post/${bigAlbum.id}/9`, { headers: { authorization: `Bearer ${bob.token}` } });
assert.equal(lastPicture.status, 200);
assert.ok(Buffer.from(await lastPicture.arrayBuffer()).equals(Buffer.from(PIXEL_B.split(",")[1], "base64")), "the tenth picture comes back byte for byte");
assert.equal((await fetch(`${base}/api/v1/media/post/${bigAlbum.id}/10`, { headers: { authorization: `Bearer ${bob.token}` } })).status, 404);
assert.match(await refused(alice, "createPost", { slug: lab.id, type: "image", title: "Eleven", body: "x", cover: PIXEL, album: Array(10).fill(PIXEL) }), /10 pictures at most/);
const tenScenes = await ok(alice, "createPost", {
  slug: lab.id, type: "story", title: "Ten scenes", body: "", cover: PIXEL, album: Array(9).fill(PIXEL),
  payload: { captions: Array.from({ length: 11 }, (_, n) => `Scene ${n + 1}`) },
});
const scenes = (await ok(alice, "getPostPage", { slug: lab.id, postId: tenScenes.id })).post.payload;
assert.equal(scenes.albumCount, 9);
assert.equal(scenes.captions.length, 10, "one caption per picture, the eleventh is dropped");
assert.ok((await ok(bob, "communityOverview", { slug: lab.id })).media.some((m) => m.postId === bigAlbum.id && m.index === 9));
pass("albums: a cover plus nine more pictures (ten), stories with ten scenes; an eleventh is refused");

// ── Mark all read ─────────────────────────────────────────────────────────
assert.ok((await ok(alice, "notificationsFeed", { filter: "all" })).unread > 0);
await ok(alice, "markAllNotificationsRead", undefined);
assert.equal((await ok(alice, "notificationsFeed", { filter: "all" })).unread, 0);
assert.equal((await ok(alice, "bootstrap", {})).unread, 0);
pass("mark all notifications read");

// ── The scheduled post goes live by itself ─────────────────────────────────
const wait = soonAt - Date.now() + 2000;
if (wait > 0) {
  console.log(`(waiting ${Math.ceil(wait / 1000)} s for the scheduled post)`);
  await new Promise((resolve) => setTimeout(resolve, wait));
}
assert.ok(ids((await ok(bob, "getCommunityPage", { slug: lab.id })).posts).includes(soon.id));
assert.ok(ids((await ok(bob, "feed", { tab: "communities" })).posts).includes(soon.id));
const nowPage = await ok(bob, "getPostPage", { slug: lab.id, postId: soon.id });
assert.equal(nowPage.post.scheduled, false);
assert.ok(!ids((await ok(bob, "getCommunityPage", { slug: lab.id })).posts).includes(later.id), "the later one still waits");
pass("scheduled posts appear on their own when due (no timer needed)");

console.log(`\n${passed} social checks passed.`);
