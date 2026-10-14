import {fixtureAuthFetch} from "./fixture-auth.mjs";
/**
 * Integration test for the mobile API bridge and the community tools added for
 * the native apps. Talks to a RUNNING dev server over plain HTTP, exactly like
 * the phone app does (JSON + bearer token).
 *
 *   npm run dev            (in one terminal)
 *   npm run test:mobile    (in another)
 *
 * Against a production build instead: TEST_ORIGIN=http://localhost:3100 TEST_AUTH_ORIGIN=<your BETTER_AUTH_URL>
 *
 * It creates throwaway accounts and a throwaway community in the dev database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const base = process.env.TEST_ORIGIN ?? "http://localhost:8080";
let passed = 0;
const pass = (name) => {
  passed += 1;
  console.log(`PASS ${name}`);
};

/** Call a server function the way the mobile app does. Returns `{ result }` or `{ error }`. */
async function call(token, name, data) {
  const res = await fetch(`${base}/api/v1/rpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: res.status, ...(await res.json()) };
}
/** Same, but the call must succeed. */
async function ok(token, name, data) {
  const r = await call(token, name, data);
  assert.equal(r.error, undefined, `${name} failed: ${r.error?.message}`);
  return r.result;
}
/** Same, but the call must be refused; returns the error message. */
async function refused(token, name, data) {
  const r = await call(token, name, data);
  assert.ok(r.error, `${name} should have been refused`);
  return r.error.message;
}

async function signUp(label, { confirmAge = true, bootstrapFirst = true } = {}) {
  // Production servers rate-limit sign-ups (HTTP 429); wait as long as the server asks, then retry.
  let res;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    res = await fixtureAuthFetch(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: process.env.TEST_AUTH_ORIGIN ?? base },
      body: JSON.stringify({
        name: `Mobile ${label}`,
        email: `mobile-${label}-${randomBytes(6).toString("hex")}@example.test`,
        password: randomBytes(16).toString("hex"),
      }),
    });
    if (res.status !== 429) break;
    const wait = Number(res.headers.get("x-retry-after") ?? 10);
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(wait) ? wait : 10) * 1000 + 250));
  }
  assert.equal(res.status, 200);
  const token = res.headers.get("set-auth-token");
  assert.ok(token, "sign-up must return a bearer token in the set-auth-token header");
  const body = await res.json();
  if (bootstrapFirst) await ok(token, "bootstrap", {}); // creates the profile
  if (confirmAge) await ok(token, "confirmMinimumAge", { year: 1990, month: 1, day: 1 }); // the 13+ birthday check
  return { token, id: body.user.id };
}

// ── Bridge basics ──────────────────────────────────────────────────────────
assert.equal((await call(null, "noSuchFunction", {})).status, 404);
assert.equal((await call(null, "getMe", {})).status, 401);
assert.equal((await call(null, "issueMute", {})).status, 401);
assert.equal((await call(null, "internals", {})).status, 404, "helpers must not be callable");
assert.ok((await ok(null, "listDiscover", {})).communities.length > 0);
pass("bridge: unknown names 404, private calls need a token, helpers are not exposed, public reads work");

const owner = await signUp("owner");
const member = await signUp("member");
const other = await signUp("other");
const hall = await ok(owner.token, "createCommunity", {
  name: `Mobile Lab ${Date.now()}`, tagline: "QA", description: "Mobile API QA",
  category: "Art", visibility: "public", ageGate: 13, rules: "Be kind.",
});
await ok(member.token, "joinCommunity", { slug: hall.id, nickname: "Member" });
await ok(other.token, "joinCommunity", { slug: hall.id, nickname: "Other" });
pass("bridge: sign-up token authenticates create/join calls");

// ── Push tokens ────────────────────────────────────────────────────────────
const pushToken = `ExponentPushToken[${randomBytes(8).toString("hex")}]`;
assert.match(await refused(member.token, "registerPushToken", { token: "not-a-token", platform: "ios" }), /valid push token/);
await ok(member.token, "registerPushToken", { token: pushToken, platform: "ios" });
await ok(other.token, "registerPushToken", { token: pushToken, platform: "android" }); // moves to the new account
await ok(other.token, "unregisterPushToken", pushToken);
pass("push: tokens validate, move between accounts, and can be removed");

// ── Mutes and appeals ──────────────────────────────────────────────────────
assert.match(await refused(member.token, "issueMute", { slug: hall.id, userId: other.id, hours: 2, reason: "x" }), /moderators/);
assert.match(await refused(owner.token, "issueMute", { slug: hall.id, userId: member.id, hours: 0, reason: "spam" }), /between 1 hour/);
await ok(owner.token, "issueMute", { slug: hall.id, userId: member.id, hours: 2, reason: "Off-topic spam" });
assert.match(await refused(member.token, "createPost", { slug: hall.id, type: "blog", title: "Muted post", body: "hello" }), /muted/);
const standing = await ok(member.token, "getMyStanding", hall.id);
assert.ok(standing.mute, "member sees the mute");
await ok(member.token, "fileAppeal", { slug: hall.id, kind: "mute", message: "I did not mean to spam, sorry." });
assert.match(await refused(member.token, "fileAppeal", { slug: hall.id, kind: "mute", message: "Another appeal here please." }), /already/);
assert.match(await refused(other.token, "listAppeals", hall.id), /leaders/);
const appeals = await ok(owner.token, "listAppeals", hall.id);
assert.equal(appeals[0].status, "open");
await ok(owner.token, "resolveAppeal", { slug: hall.id, appealId: appeals[0].id, decision: "overturned", note: "Fair enough." });
await ok(member.token, "createPost", { slug: hall.id, type: "blog", title: "Unmuted post", body: "I can write again" });
pass("mutes: enforced on posting, appealable, leader decision lifts it");

// strikes -> ban -> appeal -> reinstated
for (const reason of ["one", "two", "three"]) await ok(owner.token, "issueStrike", { slug: hall.id, userId: other.id, reason: `Strike ${reason}` });
assert.equal((await ok(other.token, "getMyStanding", hall.id)).status, "banned");
await ok(other.token, "fileAppeal", { slug: hall.id, kind: "ban", message: "Please reconsider my removal." });
const banAppeal = (await ok(owner.token, "listAppeals", hall.id)).find((a) => a.kind === "ban");
await ok(owner.token, "resolveAppeal", { slug: hall.id, appealId: banAppeal.id, decision: "overturned" });
assert.equal((await ok(other.token, "getMyStanding", hall.id)).status, "active");
pass("appeals: an overturned ban restores membership");

// ── Wiki categories and proposals ──────────────────────────────────────────
assert.match(await refused(member.token, "setWikiCategories", { slug: hall.id, paths: ["Nope"] }), /leaders/);
assert.match(await refused(owner.token, "setWikiCategories", { slug: hall.id, paths: ["Bad<>Name"] }), /letters/);
await ok(owner.token, "setWikiCategories", { slug: hall.id, paths: ["Characters", "Characters/Heroes", "Lore"] });
assert.deepEqual(await ok(null, "getWikiCategories", hall.id), ["Characters", "Characters/Heroes", "Lore"]);
assert.match(await refused(owner.token, "createPost", { slug: hall.id, type: "wiki", title: "Bad cat", body: "x", payload: { category: "Random" } }), /categories/);
const wiki = await ok(owner.token, "createPost", { slug: hall.id, type: "wiki", title: "Hero guide", body: "Original text", payload: { category: "Characters/Heroes" } });
await ok(owner.token, "submitWiki", wiki.id);
await ok(owner.token, "reviewWiki", { postId: wiki.id, decision: "approved" });
assert.match(await refused(owner.token, "proposeWikiEdit", { postId: wiki.id, title: "Hero guide", body: "Mine" }), /directly/);
await ok(member.token, "proposeWikiEdit", { postId: wiki.id, title: "Hero guide", body: "Original text plus a better tip", note: "Added a tip" });
const proposals = await ok(owner.token, "listWikiProposals", wiki.id);
assert.equal(proposals.canReview, true);
assert.equal(proposals.proposals[0].status, "open");
assert.equal((await ok(other.token, "listWikiProposals", wiki.id)).proposals.length, 0, "strangers cannot read others' proposals");
assert.match(await refused(other.token, "resolveWikiProposal", { proposalId: proposals.proposals[0].id, decision: "accepted" }), /author or a moderator/);
await ok(owner.token, "resolveWikiProposal", { proposalId: proposals.proposals[0].id, decision: "accepted" });
const contributors = await ok(null, "getWikiContributors", wiki.id);
assert.equal(contributors.length, 1);
const updated = (await ok(null, "getWiki", hall.id)).entries.find((e) => e.id === wiki.id);
assert.equal(updated.body, "Original text plus a better tip");
assert.equal(updated.wikiStatus, "approved", "a moderator's acceptance keeps the page approved");
assert.ok((await ok(owner.token, "listWikiRevisions", wiki.id)).length >= 1, "old text is kept as a revision");
pass("wiki: leader categories, proposals from other members, accept credits the contributor and keeps history");

// ── Feeds ──────────────────────────────────────────────────────────────────
assert.match(await refused(member.token, "addFeed", { slug: hall.id, url: "https://example.com/feed.xml" }), /leaders/);
for (const url of ["http://example.com/feed.xml", "https://localhost/feed.xml", "https://127.0.0.1/feed.xml", "https://10.0.0.5/rss", "https://169.254.169.254/latest", "not a url"]) {
  await refused(owner.token, "addFeed", { slug: hall.id, url });
}
assert.deepEqual(await ok(null, "listFeeds", hall.id), []);
assert.deepEqual((await ok(null, "readFeeds", hall.id)).items, []);
pass("feeds: leader-only, and http / private / loopback / metadata addresses are refused");

// ── Chat media stream (video-style byte ranges) ─────────────────────────────
const page = await ok(owner.token, "getCommunityPage", { slug: hall.id });
const room = page.rooms[0];
assert.ok(room, "a new community starts with a chat room");
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const sent = await ok(owner.token, "sendMessage", { roomId: room.id, body: "", media: { kind: "image", dataUrl: `data:image/png;base64,${png}` } });
const mediaUrl = `${base}/api/v1/media/message/${room.id}/${sent.id}`;
const asMember = await fetch(mediaUrl, { headers: { authorization: `Bearer ${owner.token}` } });
assert.equal(asMember.status, 200);
assert.equal(asMember.headers.get("content-type"), "image/png");
assert.equal(Buffer.from(await asMember.arrayBuffer()).toString("base64"), png);
const partial = await fetch(mediaUrl, { headers: { authorization: `Bearer ${owner.token}`, range: "bytes=0-7" } });
assert.equal(partial.status, 206);
assert.equal(partial.headers.get("content-range")?.startsWith("bytes 0-7/"), true);
assert.equal((await partial.arrayBuffer()).byteLength, 8);
assert.equal((await fetch(mediaUrl)).status, 401, "no token, no media");
const stranger = await signUp("stranger");
assert.equal((await fetch(mediaUrl, { headers: { authorization: `Bearer ${stranger.token}` } })).status, 404, "non-members cannot fetch it");
pass("media: members stream attachments with byte ranges; anonymous and non-members are refused");

// ── Profile photos ─────────────────────────────────────────────────────────
const photo = `data:image/png;base64,${png}`;
assert.match(await refused(owner.token, "setAvatar", { dataUrl: "data:text/html;base64,PGI+" }), /JPEG, PNG or WebP/);
assert.match(await refused(owner.token, "setAvatar", { dataUrl: `data:image/png;base64,${"A".repeat(300_001)}` }), /too large/);
assert.equal((await call(null, "setAvatar", { dataUrl: photo })).status, 401, "photos need sign-in to change");
assert.equal((await fetch(`${base}/api/v1/media/avatar/${owner.id}`)).status, 404, "no photo yet");
await ok(owner.token, "setAvatar", { dataUrl: photo });
const withPhoto = await ok(owner.token, "getMe", {});
assert.ok(withPhoto.profile.avatarVersion > 0, "profile reports a photo version");
const photoResponse = await fetch(`${base}/api/v1/media/avatar/${owner.id}?v=${withPhoto.profile.avatarVersion}`);
assert.equal(photoResponse.status, 200);
assert.equal(photoResponse.headers.get("content-type"), "image/png");
assert.equal(Buffer.from(await photoResponse.arrayBuffer()).toString("base64"), png);
const photoPost = await ok(owner.token, "createPost", { slug: hall.id, type: "blog", title: "Post with a photo author", body: "hi" });
const photoPage = await ok(null, "getPostPage", { slug: hall.id, postId: photoPost.id });
assert.equal(photoPage.post.author.avatarV, withPhoto.profile.avatarVersion, "authors carry the photo version");
const roster = await ok(null, "getCommunityPage", { slug: hall.id });
assert.equal(roster.members.find((m) => m.userId === owner.id)?.avatarV, withPhoto.profile.avatarVersion, "member lists carry it too");
await ok(owner.token, "removeAvatar", {});
assert.equal((await ok(owner.token, "getMe", {})).profile.avatarVersion, 0);
assert.equal((await fetch(`${base}/api/v1/media/avatar/${owner.id}`)).status, 404, "removed photos are gone");
pass("profile photos: validated, versioned, served publicly as images, shown on authors, removable");

// ── Global search ──────────────────────────────────────────────────────────
const needle = `zzfind${Date.now()}`;
const found = await ok(owner.token, "createPost", { slug: hall.id, type: "blog", title: `Searchable ${needle}`, body: `Body with #${needle}tag inside`, payload: { format: "markdown" } });
const hiddenPost = await ok(owner.token, "createPost", { slug: hall.id, type: "blog", title: `Hidden ${needle}`, body: "secret" });
await ok(owner.token, "setPostFlags", { slug: hall.id, postId: hiddenPost.id, hidden: true });
const byWord = await ok(null, "searchAll", needle);
assert.ok(byWord.posts.some((p) => p.id === found.id), "finds a post by a word in its title");
assert.ok(!byWord.posts.some((p) => p.id === hiddenPost.id), "hidden posts never appear");
assert.equal(byWord.posts.find((p) => p.id === found.id).communityName.length > 0, true);
const byTag = await ok(null, "searchAll", `#${needle}tag`);
assert.ok(byTag.posts.some((p) => p.id === found.id), "finds a post by hashtag");
assert.equal(byTag.communities.length + byTag.people.length, 0, "hashtag searches return posts only");
const hallName = (await ok(null, "getCommunityPage", { slug: hall.id })).community.name;
const byName = await ok(null, "searchAll", hallName.slice(0, 12));
assert.ok(byName.communities.some((c) => c.id === hall.id), "finds a community by name");
const byPerson = await ok(null, "searchAll", "Mobile owner");
assert.ok(byPerson.people.some((p) => p.userId === owner.id) && byPerson.people.every((p) => "avatarV" in p), "finds people, with photo versions");
assert.deepEqual((await ok(null, "searchAll", "a")).posts, [], "one-letter searches are ignored");
assert.equal((await ok(null, "searchAll", "%%")).communities.length, 0, "wildcards are not special");
await ok(member.token, "blockUser", owner.id);
assert.ok(!(await ok(member.token, "searchAll", needle)).posts.some((p) => p.id === found.id), "blocked authors are filtered out");
await ok(member.token, "blockUser", owner.id); // toggle back
pass("search: communities, posts, #hashtags and people; hidden posts, wildcards and blocked people handled");

// ── Shapes the phone relies on ──────────────────────────────────────────────
const board = (await ok(owner.token, "weeklyRank", hall.id)).rank;
assert.ok(board.length >= 2, "the leaderboard lists members");
for (let i = 1; i < board.length; i += 1) {
  assert.ok(board[i - 1].weekScore >= board[i].weekScore, `leaderboard is ordered by the score it shows (${board[i - 1].weekScore} before ${board[i].weekScore})`);
}
const mine = await ok(owner.token, "getMe", {});
assert.ok(mine.joined.length > 0 && mine.joined.every((j) => typeof j.community?.id === "string" && typeof j.community?.name === "string" && typeof j.nickname === "string"), "getMe lists communities as { community, nickname, role }");
pass("leaderboard order and 'my communities' shape match what the app shows");

// ── Check-ins, leaderboards and challenges ─────────────────────────────────
const arena = await ok(owner.token, "createCommunity", {
  name: `Arena ${Date.now()}`, tagline: "QA", description: "Engagement QA", category: "Art", visibility: "public", ageGate: 13, rules: "Be kind.",
});
const alice = await signUp("alice");
const bob = await signUp("bob");
const outsider = await signUp("outsider");
await ok(alice.token, "joinCommunity", { slug: arena.id, nickname: "Alice" });
await ok(bob.token, "joinCommunity", { slug: arena.id, nickname: "Bob" });

assert.match(await refused(outsider.token, "checkInCommunity", { slug: arena.id }), /Join/i, "only members check in");
const c1 = await ok(alice.token, "checkInCommunity", { slug: arena.id });
assert.deepEqual([c1.already, c1.streak, c1.rep], [false, 1, 5]);
const c2 = await ok(alice.token, "checkInCommunity", { slug: arena.id });
assert.deepEqual([c2.already, c2.streak, c2.rep], [true, 1, 5], "a second check-in the same day changes nothing");
const race = await Promise.all([ok(bob.token, "checkInCommunity", { slug: arena.id }), ok(bob.token, "checkInCommunity", { slug: arena.id })]);
assert.equal(race.filter((r) => !r.already).length, 1, "two taps at once count once");
const aliceMember = (await ok(alice.token, "getCommunityPage", { slug: arena.id })).member;
assert.equal(aliceMember.checkedInToday, true);
assert.equal(aliceMember.streak, 1);
pass("community check-in: members only, once per UTC day, atomic, keeps a streak");

const streakBoard = await ok(null, "communityRank", { slug: arena.id, by: "streak" });
assert.equal(streakBoard.by, "streak");
assert.ok(streakBoard.rank[0].score >= 1, "a checked-in member leads the streak board");
assert.equal(streakBoard.rank.find((r) => r.nickname === "Alice").score, 1);
for (const by of ["activity", "quiz"]) for (const period of ["week", "month", "all"]) {
  const b = await ok(null, "communityRank", { slug: arena.id, by, period });
  assert.equal(b.period, period);
  assert.ok(b.rank.every((r) => typeof r.score === "number"));
}
const fallback = await ok(null, "communityRank", { slug: arena.id, by: "; drop table posts", period: "forever" });
assert.equal(fallback.by, "activity", "unknown boards fall back safely");
assert.equal(fallback.period, "week");
const privateHall = await ok(owner.token, "createCommunity", { name: `Secret ${Date.now()}`, tagline: "QA", description: "Private", category: "Art", visibility: "private", ageGate: 13, rules: "Be kind." });
assert.match(await refused(outsider.token, "communityRank", { slug: privateHall.id }), /private/i);
pass("leaderboards: activity / streak / quiz over week, month and all time; bad input falls back; private halls stay private");

const past = new Date(Date.now() - 3600_000).toISOString();
const soon = new Date(Date.now() + 3 * 3600_000).toISOString();
const future = new Date(Date.now() + 86400_000).toISOString();
const challenge = await ok(owner.token, "createEvent", { slug: arena.id, title: "Best sketch", body: "Draw a sketch", kind: "challenge", startsAt: past, endsAt: soon });
const early = await ok(owner.token, "createEvent", { slug: arena.id, title: "Not yet", body: "Later", kind: "challenge", startsAt: future });
const over = await ok(owner.token, "createEvent", { slug: arena.id, title: "Already over", body: "Done", kind: "challenge", startsAt: new Date(Date.now() - 7200_000).toISOString(), endsAt: past });
const party = await ok(owner.token, "createEvent", { slug: arena.id, title: "Movie night", body: "Popcorn", kind: "event", startsAt: past, endsAt: soon });
const alicePost = await ok(alice.token, "createPost", { slug: arena.id, type: "blog", title: "Alice sketch", body: "my entry" });
const bobPost = await ok(bob.token, "createPost", { slug: arena.id, type: "blog", title: "Bob sketch", body: "my entry" });
await ok(alice.token, "joinCommunity", { slug: hall.id, nickname: "Alice" });
const elsewhere = await ok(alice.token, "createPost", { slug: hall.id, type: "blog", title: "Wrong hall", body: "x" });

assert.match(await refused(alice.token, "enterChallenge", { eventId: party.id, postId: alicePost.id }), /not found/i, "plain events take no entries");
assert.match(await refused(alice.token, "enterChallenge", { eventId: challenge.id, postId: bobPost.id }), /your own/i, "cannot enter someone else's post");
assert.match(await refused(alice.token, "enterChallenge", { eventId: early.id, postId: alicePost.id }), /not started/i);
assert.match(await refused(alice.token, "enterChallenge", { eventId: over.id, postId: alicePost.id }), /ended/i);
assert.match(await refused(outsider.token, "enterChallenge", { eventId: challenge.id, postId: alicePost.id }), /Join/i);
assert.match(await refused(alice.token, "enterChallenge", { eventId: challenge.id, postId: elsewhere.id }), /your own/i, "posts from another hall do not count");
await ok(alice.token, "enterChallenge", { eventId: challenge.id, postId: alicePost.id });
await ok(bob.token, "enterChallenge", { eventId: challenge.id, postId: bobPost.id });
const alicePost2 = await ok(alice.token, "createPost", { slug: arena.id, type: "blog", title: "Alice sketch v2", body: "better" });
await ok(alice.token, "enterChallenge", { eventId: challenge.id, postId: alicePost2.id }); // swaps her entry
const listed = await ok(alice.token, "listEvents", arena.id);
const listedChallenge = listed.events.find((e) => e.id === challenge.id);
assert.equal(listedChallenge.entryCount, 2, "one entry per person");
assert.deepEqual(
  ["Best sketch", "Not yet", "Already over"].map((title) => listed.events.find((e) => e.title === title).phase),
  ["open", "upcoming", "closed"],
  "each challenge reports where it is in its life",
);
assert.equal(listedChallenge.myEntryPostId, alicePost2.id);
const entries = await ok(null, "listChallengeEntries", challenge.id);
assert.deepEqual(entries.entries.map((e) => e.title).sort(), ["Alice sketch v2", "Bob sketch"]);
assert.equal(entries.judged, false);
pass("challenges: entries need a real challenge, an open window, membership and your own post; re-entering swaps");

assert.match(await refused(alice.token, "judgeChallenge", { eventId: challenge.id, winners: [{ postId: alicePost2.id, place: 1 }] }), /Leaders/i);
assert.match(await refused(owner.token, "judgeChallenge", { eventId: challenge.id, winners: [] }), /between one and three/i);
assert.match(await refused(owner.token, "judgeChallenge", { eventId: challenge.id, winners: [{ postId: alicePost2.id, place: 1 }, { postId: bobPost.id, place: 1 }] }), /once/i);
assert.match(await refused(owner.token, "judgeChallenge", { eventId: challenge.id, winners: [{ postId: alicePost.id, place: 1 }] }), /not an entry/i, "a post that was swapped out is no longer an entry");
const repBefore = (await ok(bob.token, "getCommunityPage", { slug: arena.id })).member.rep;
await ok(owner.token, "judgeChallenge", { eventId: challenge.id, winners: [{ postId: bobPost.id, place: 1 }, { postId: alicePost2.id, place: 2 }] });
const repAfter = (await ok(bob.token, "getCommunityPage", { slug: arena.id })).member.rep;
assert.equal(repAfter - repBefore, 50, "first place earns 50 reputation");
assert.match(await refused(owner.token, "judgeChallenge", { eventId: challenge.id, winners: [{ postId: bobPost.id, place: 1 }] }), /already been judged/i, "judging happens once, so rewards cannot be repeated");
assert.match(await refused(alice.token, "enterChallenge", { eventId: challenge.id, postId: alicePost2.id }), /judged/i);
const judged = await ok(null, "listChallengeEntries", challenge.id);
assert.equal(judged.judged, true);
assert.equal((await ok(alice.token, "listEvents", arena.id)).events.find((e) => e.id === challenge.id).phase, "judged");
assert.deepEqual(judged.entries.map((e) => [e.title, e.placement]), [["Bob sketch", 1], ["Alice sketch v2", 2]], "winners are listed first");
assert.ok((await ok(bob.token, "listNotifications", {})).some((n) => /placed 1st/i.test(n.title)), "the winner is told");
pass("judging: leaders only, 1st/2nd/3rd once each, reputation awarded once, winners listed first and notified");

// ── Free cosmetics: avatar frames and chat bubble styles ──────────────────
const stylist = await signUp("stylist");
await ok(stylist.token, "joinCommunity", { slug: hall.id, nickname: "Stylist" });
assert.equal((await ok(stylist.token, "getMe", {})).profile.bubbleStyle, "soft", "the default bubble is soft");
await ok(stylist.token, "updateSettings", { frame: "aurora", bubbleStyle: "glass" });
let styled = (await ok(stylist.token, "getMe", {})).profile;
assert.equal(styled.frame, "aurora");
assert.equal(styled.bubbleStyle, "glass");
await ok(stylist.token, "updateSettings", { frame: "not-a-frame", bubbleStyle: "gold-plated" });
styled = (await ok(stylist.token, "getMe", {})).profile;
assert.equal(styled.frame, "aurora", "an unknown frame is ignored, not saved");
assert.equal(styled.bubbleStyle, "glass", "an unknown bubble style is ignored, not saved");
const styleRoom = await ok(owner.token, "createRoom", { slug: hall.id, name: "Style room", kind: "public" });
await ok(stylist.token, "sendMessage", { roomId: styleRoom.id, body: "Look at my bubble" });
const styleMessages = (await ok(stylist.token, "getRoom", { roomId: styleRoom.id })).messages;
assert.equal(styleMessages.at(-1).bubbleStyle, "glass", "chat messages carry the author's bubble style");
assert.equal((await ok(null, "getPublicProfile", styled.handle)).profile.frame, "aurora", "the public profile shows the frame");
pass("cosmetics: new frames and bubble styles are free, saved, validated, and shown to others");

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// ── Community look (theme editor) ──────────────────────────────────────────
const before = (await ok(null, "getCommunityPage", { slug: hall.id })).community;
assert.equal(before.themeStyle, "aurora", "the default style is aurora");
assert.equal(before.icon, "");
assert.match(await refused(stylist.token, "updateCommunityLook", { slug: hall.id, hue: 10 }), /Only leaders/);
assert.match(await refused(owner.token, "updateCommunityLook", { slug: hall.id, themeStyle: "glitter" }), /listed colour styles/);
assert.match(await refused(owner.token, "updateCommunityLook", { slug: hall.id, cover: "/covers/../../etc/passwd" }), /listed banners/);
assert.match(await refused(owner.token, "updateCommunityLook", { slug: hall.id, name: "ab" }), /at least 3/);
assert.match(await refused(owner.token, "updateCommunityLook", { slug: hall.id, iconUpload: "data:text/html;base64,PGI+" }), /JPEG, PNG or WebP/);
assert.match(await refused(owner.token, "updateCommunityLook", { slug: hall.id, iconUpload: `data:image/png;base64,${"A".repeat(300_100)}` }), /too large/);
await ok(owner.token, "updateCommunityLook", { slug: hall.id, tagline: "A fresh tagline", description: "New about text", rules: "1. Be kind", hue: 999, themeStyle: "night", cover: "/covers/keep.jpg" });
let look = (await ok(null, "getCommunityPage", { slug: hall.id })).community;
assert.equal(look.hue, 360, "the colour is kept inside 0-360");
assert.equal(look.themeStyle, "night");
assert.equal(look.tagline, "A fresh tagline");
assert.equal(look.cover, "/covers/keep.jpg");
assert.equal(look.name, before.name, "fields that were not sent stay as they were");
const uploaded = await ok(owner.token, "updateCommunityLook", { slug: hall.id, coverUpload: PIXEL, iconUpload: PIXEL });
assert.match(uploaded.cover, new RegExp(`^/api/v1/media/community/${hall.id}/cover\\?v=\\d+$`));
assert.match(uploaded.icon, new RegExp(`^/api/v1/media/community/${hall.id}/icon\\?v=\\d+$`));
for (const kind of ["cover", "icon"]) {
  const res = await fetch(`${base}/api/v1/media/community/${hall.id}/${kind}`);
  assert.equal(res.status, 200, kind);
  assert.equal(res.headers.get("content-type"), "image/png");
}
look = (await ok(null, "getCommunityPage", { slug: hall.id })).community;
assert.equal(look.icon, uploaded.icon);
await ok(owner.token, "updateCommunityLook", { slug: hall.id, iconUpload: null, cover: "/covers/hero.jpg" });
look = (await ok(null, "getCommunityPage", { slug: hall.id })).community;
assert.equal(look.icon, "", "removing the icon clears it");
assert.equal(look.cover, "/covers/hero.jpg", "choosing a built-in banner replaces an uploaded one");
assert.equal((await fetch(`${base}/api/v1/media/community/${hall.id}/icon`)).status, 404, "and the file is gone");
assert.equal((await fetch(`${base}/api/v1/media/community/${hall.id}/cover`)).status, 404);
assert.equal((await fetch(`${base}/api/v1/media/community/${hall.id}/secret`)).status, 404, "only cover and icon exist");
assert.ok((await ok(owner.token, "getModeration", hall.id)).audit.some((a) => a.action === "community:look"), "changes are written to the audit log");
pass("community look: leaders only, validated, colour style and hue kept in range, uploaded banner/icon served publicly and removable, audited");

// ── Image albums ───────────────────────────────────────────────────────────
const album = await ok(stylist.token, "createPost", {
  slug: hall.id, type: "image", title: "Trip photos", body: "Three pictures", cover: PIXEL, album: [PIXEL, PIXEL], payload: { albumCount: 99 },
});
const albumPost = (await ok(null, "getPostPage", { slug: hall.id, postId: album.id })).post;
assert.equal(albumPost.payload.albumCount, 2, "the server counts the pictures itself; the client's number is ignored");
assert.equal((await ok(null, "getPostImage", { postId: album.id, position: 2 })).dataUrl, PIXEL);
assert.match(await refused(null, "getPostImage", { postId: album.id, position: 3 }), /not found/i);
const albumRes = await fetch(`${base}/api/v1/media/post/${album.id}/1`);
assert.equal(albumRes.status, 200);
assert.equal(albumRes.headers.get("content-type"), "image/png");
assert.equal((await albumRes.arrayBuffer()).byteLength, Buffer.from(PIXEL.split(",")[1], "base64").length, "the picture is served as a real file");
assert.equal((await fetch(`${base}/api/v1/media/post/${album.id}/0`)).status, 200, "position 0 is the cover picture");
assert.equal((await fetch(`${base}/api/v1/media/post/${album.id}/-1`)).status, 400);
assert.match(await refused(stylist.token, "createPost", { slug: hall.id, type: "blog", title: "Not an image", body: "x", album: [PIXEL] }), /Only image posts/);
assert.match(await refused(stylist.token, "createPost", { slug: hall.id, type: "image", title: "Ten extras", body: "x", cover: PIXEL, album: Array(10).fill(PIXEL) }), /10 pictures at most/);
assert.match(await refused(stylist.token, "createPost", { slug: hall.id, type: "image", title: "No cover", body: "x", album: [PIXEL] }), /cover/i);
assert.match(await refused(stylist.token, "createPost", { slug: hall.id, type: "image", title: "Bad file", body: "x", cover: PIXEL, album: ["data:text/html;base64,PGI+"] }), /PNG, JPEG/);
const secret = await ok(stylist.token, "createCommunity", { name: `Private Album ${Date.now()}`, tagline: "QA", description: "Private", category: "Art", visibility: "private", ageGate: 13, rules: "Be kind." });
const secretPost = await ok(stylist.token, "createPost", { slug: secret.id, type: "image", title: "Members only", body: "x", cover: PIXEL, album: [PIXEL] });
assert.equal((await fetch(`${base}/api/v1/media/post/${secretPost.id}/1`)).status, 404, "a private community's album is not public");
const privateRes = await fetch(`${base}/api/v1/media/post/${secretPost.id}/1`, { headers: { authorization: `Bearer ${stylist.token}` } });
assert.equal(privateRes.status, 200, "but its members can see it");
await ok(stylist.token, "deletePost", { slug: hall.id, postId: album.id });
assert.match(await refused(null, "getPostImage", { postId: album.id, position: 1 }), /unavailable|not found/i, "deleting a post removes its album");
pass("albums: up to 6 pictures, server-counted, real image files, private communities protected, deleted with the post");

// ── Shared folders ─────────────────────────────────────────────────────────
await ok(stylist.token, "addShared", { slug: hall.id, title: "Starter guide", url: "https://example.com/guide", folder: "  Guides // Newcomers " });
await ok(stylist.token, "addShared", { slug: hall.id, title: "Loose note", note: "top level" });
assert.match(await refused(stylist.token, "addShared", { slug: hall.id, title: "Sneaky lock", minLevel: 5 }), /Only leaders/);
await ok(owner.token, "addShared", { slug: hall.id, title: "Veterans map", url: "https://example.com/map", note: "for regulars", folder: "Guides/../Maps", minLevel: 5 });
const shared = await ok(stylist.token, "listShared", hall.id);
const byTitle = Object.fromEntries(shared.items.map((i) => [i.title, i]));
assert.equal(byTitle["Starter guide"].folder, "Guides/Newcomers", "folder names are tidied");
assert.equal(byTitle["Loose note"].folder, "", "no folder means the top level");
assert.equal(byTitle["Veterans map"].folder, "Guides/Maps", "a folder path can not climb out with ..");
assert.equal(byTitle["Veterans map"].locked, true, "a level-5 file is locked for a level-1 member");
assert.equal(byTitle["Veterans map"].url, "", "a locked item does not reveal its link");
assert.equal(byTitle["Veterans map"].note, "", "or its note");
assert.equal(byTitle["Veterans map"].minLevel, 5);
const ownerView = (await ok(owner.token, "listShared", hall.id)).items.find((i) => i.title === "Veterans map");
assert.equal(ownerView.locked, false, "leaders see everything");
assert.equal(ownerView.url, "https://example.com/map");
assert.equal((await ok(null, "listShared", hall.id)).items.find((i) => i.title === "Veterans map").locked, true, "signed-out visitors are level 1 too");
assert.match(await refused(member.token, "moveShared", { slug: hall.id, id: byTitle["Starter guide"].id, folder: "Elsewhere" }), /can.t move/i);
await ok(stylist.token, "moveShared", { slug: hall.id, id: byTitle["Starter guide"].id, folder: "Guides" });
assert.equal((await ok(stylist.token, "listShared", hall.id)).items.find((i) => i.title === "Starter guide").folder, "Guides");
assert.match(await refused(stylist.token, "moveShared", { slug: hall.id, id: byTitle["Starter guide"].id, folder: "Guides", minLevel: 9 }), /Only leaders/);
pass("shared folders: tidy nested paths, level locks that hide the link, leaders only, movable by the author");

// ── Import an exported copy of your data ───────────────────────────────────
const exporter = await signUp("exporter");
await ok(exporter.token, "joinCommunity", { slug: hall.id, nickname: "Exporter" });
await ok(exporter.token, "createPost", { slug: hall.id, type: "poll", title: "Best snack?", body: "Vote", payload: { options: ["Chips", "Fruit"] } });
await ok(exporter.token, "createPost", { slug: hall.id, type: "image", title: "My album", body: "pics", cover: PIXEL, album: [PIXEL] });
const archive = await ok(exporter.token, "exportMyData", {});
const parsedArchive = JSON.parse(archive.json);
assert.equal(parsedArchive.formatVersion, 4);
assert.equal(parsedArchive.postImages.length, 1, "the export includes album pictures");
assert.match(await refused(exporter.token, "importMyData", { json: "not json at all" }), /Kamino data file/);
assert.match(await refused(exporter.token, "importMyData", { json: "{}" }), /Kamino data file/);
assert.match(await refused(null, "importMyData", { json: archive.json }), /./);
const imported = await ok(exporter.token, "importMyData", { json: archive.json });
assert.equal(imported.imported, 2, "both posts come back as drafts");
const draftsBack = await ok(exporter.token, "listDrafts", hall.id);
assert.deepEqual(draftsBack.map((d) => d.content.title).sort(), ["Best snack?", "My album"]);
assert.equal(draftsBack.find((d) => d.content.title === "My album").content.album.length, 1, "album pictures come back too");
assert.deepEqual(draftsBack.find((d) => d.content.title === "Best snack?").content.opts.slice(0, 2), ["Chips", "Fruit"]);
const again = await ok(exporter.token, "importMyData", { json: archive.json });
assert.equal(again.imported, 0, "importing the same file twice makes no duplicates");
assert.equal(again.skipped >= 2, true);
const nonMember = await signUp("nonMember");
const notMember = await ok(nonMember.token, "importMyData", { json: archive.json });
assert.equal(notMember.imported, 0, "a person can not import into communities they are not in");
assert.equal((await ok(null, "getCommunityPage", { slug: hall.id })).posts.filter((p) => p.title === "Best snack?").length, 1, "an import never publishes anything");
pass("import: your archive returns as private drafts, safe to repeat, never publishes, only into your communities");

// ── 13+ age gate ───────────────────────────────────────────────────────────
const newcomer = await signUp("newcomer", { confirmAge: false });
assert.equal((await ok(newcomer.token, "getMe", {})).profile.minAgeConfirmed, false, "a fresh account starts unconfirmed");
assert.match(await refused(newcomer.token, "joinCommunity", { slug: hall.id }), /confirm your age/i, "cannot join before the check");
assert.match(await refused(newcomer.token, "createPost", { slug: hall.id, type: "blog", title: "Too early", body: "x" }), /confirm your age/i);
assert.match(await refused(newcomer.token, "confirmMinimumAge", { year: 2010, month: 2, day: 30 }), /real date/i, "impossible dates are refused");
assert.match(await refused(newcomer.token, "confirmMinimumAge", { year: 2999, month: 1, day: 1 }), /real date/i, "future dates are refused");
assert.equal((await ok(newcomer.token, "confirmMinimumAge", { year: 1995, month: 6, day: 15 })).ok, true);
const confirmed = (await ok(newcomer.token, "getMe", {})).profile;
assert.equal(confirmed.minAgeConfirmed, true);
assert.equal(confirmed.ageConfirmed, true, "an adult birthday also unlocks 16+/18+ communities");
assert.equal(JSON.stringify(confirmed).includes("1995"), false, "the birth date is never stored or returned");
await ok(newcomer.token, "joinCommunity", { slug: hall.id });
assert.equal((await ok(newcomer.token, "confirmMinimumAge", { year: 2020, month: 1, day: 1 })).ok, true, "a second check is ignored, so it can never erase a member");
// The apps send the birthday as the very first call after sign-up, so it must create the profile with the sign-up name.
const first = await signUp("first", { confirmAge: false, bootstrapFirst: false });
assert.equal((await ok(first.token, "confirmMinimumAge", { year: 1995, month: 6, day: 15 })).ok, true);
assert.equal((await ok(first.token, "getMe", {})).profile.displayName, "Mobile first", "profile keeps the name from sign-up");
const teen = await signUp("teen", { confirmAge: false });
assert.equal((await ok(teen.token, "confirmMinimumAge", { year: 2010, month: 6, day: 15 })).ok, true, "13 to 17 is allowed in");
assert.equal((await ok(teen.token, "getMe", {})).profile.ageConfirmed, false, "a teenager still ticks the 16+ box in Settings themselves");
const child = await signUp("child", { confirmAge: false });
const childAnswer = await ok(child.token, "confirmMinimumAge", { year: new Date().getUTCFullYear() - 9, month: 1, day: 1 });
assert.equal(childAnswer.ok, false, "under 13 is turned away");
assert.equal((await call(child.token, "getMe", {})).status, 401, "and the account is erased immediately");
pass("age gate: birthday checked once, never stored, 13+ only, adults unlock 16+ halls, under-13 accounts erased");

// ── Quiz pictures, timed quizzes, multi-scene stories ─────────────────────
const PIXEL2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const timed = await ok(owner.token, "createPost", {
  slug: hall.id, type: "quiz", title: "Timed picture quiz", body: "Look closely",
  payload: {
    timeLimitSec: 10,
    questions: [
      { q: "Which colour?", choices: ["Red", "Blue"], answer: 1, hasImage: true },
      { q: "No picture here", choices: ["A", "B"], answer: 0 },
    ],
  },
  questionImages: [PIXEL, ""],
});
const timedPage = await ok(newcomer.token, "getPostPage", { slug: hall.id, postId: timed.id });
assert.equal(timedPage.post.payload.timeLimitSec, 10);
assert.deepEqual(timedPage.post.payload.questions.map((q) => Boolean(q.hasImage)), [true, false], "the server decides which questions have pictures");
assert.ok(timedPage.post.payload.questions.every((q) => q.answer === -1), "answers stay hidden");
assert.equal(timedPage.quizRun, null);
assert.match(await refused(newcomer.token, "getPostImage", { postId: timed.id, position: 100 }), /Start the quiz/, "pictures stay hidden until the clock is started");
assert.equal((await ok(owner.token, "getPostImage", { postId: timed.id, position: 100 })).dataUrl, PIXEL, "the author can always see them");
assert.match(await refused(newcomer.token, "submitQuiz", { postId: timed.id, answers: [1, 0] }), /Start the quiz first/);
const quizRun = await ok(newcomer.token, "startQuiz", { postId: timed.id });
assert.equal(quizRun.timeLimitSec, 10);
const restarted = await ok(newcomer.token, "startQuiz", { postId: timed.id });
assert.equal(restarted.startedAt, quizRun.startedAt, "starting again keeps the first start (no restarting the clock)");
assert.equal((await ok(newcomer.token, "getPostImage", { postId: timed.id, position: 100 })).dataUrl, PIXEL);
assert.equal((await ok(newcomer.token, "getPostPage", { slug: hall.id, postId: timed.id })).quizRun.startedAt, quizRun.startedAt, "an unfinished run is remembered");
const onTime = await ok(newcomer.token, "submitQuiz", { postId: timed.id, answers: [1, 0], timeMs: 1 });
assert.deepEqual({ score: onTime.score, total: onTime.total, timedOut: onTime.timedOut }, { score: 2, total: 2, timedOut: false });
const quizBoard = (await ok(newcomer.token, "getPostPage", { slug: hall.id, postId: timed.id })).quizBoard;
assert.ok(quizBoard[0].timeMs > 0, "the recorded time is measured by the server, not taken from the phone");
assert.match(await refused(newcomer.token, "startQuiz", { postId: timed.id }), /already took/);
assert.match(await refused(owner.token, "createPost", { slug: hall.id, type: "quiz", title: "Too fast", body: "x", payload: { timeLimitSec: 5, questions: [{ q: "q", choices: ["a", "b"], answer: 0 }] } }), /time limit/i);
assert.match(await refused(owner.token, "createPost", { slug: hall.id, type: "blog", title: "Not a quiz", body: "x", questionImages: [PIXEL] }), /Only quizzes/);
assert.match(await refused(owner.token, "createPost", { slug: hall.id, type: "quiz", title: "Bad file", body: "x", payload: { questions: [{ q: "q", choices: ["a", "b"], answer: 0 }] }, questionImages: ["data:text/html;base64,PGI+"] }), /PNG, JPEG/);
// A player who lets the clock run out and only then sends answers scores nothing.
const slowQuiz = await ok(owner.token, "createPost", { slug: hall.id, type: "quiz", title: "Slow", body: "x", payload: { timeLimitSec: 10, questions: [{ q: "q", choices: ["a", "b"], answer: 0 }] } });
await ok(stylist.token, "startQuiz", { postId: slowQuiz.id });
await new Promise((resolve) => setTimeout(resolve, 13_500));
const late = await ok(stylist.token, "submitQuiz", { postId: slowQuiz.id, answers: [0] });
assert.deepEqual({ score: late.score, timedOut: late.timedOut }, { score: 0, timedOut: true }, "answers sent long after the limit do not count");
// A story with scenes and captions.
const sceneStory = await ok(stylist.token, "createPost", {
  slug: hall.id, type: "story", title: "Three scenes", body: "", cover: PIXEL, album: [PIXEL2, PIXEL],
  payload: { captions: ["  First  ", "", "Third", "a fourth one that is ignored"], albumCount: 99 },
});
const scenePage = await ok(newcomer.token, "getPostPage", { slug: hall.id, postId: sceneStory.id });
assert.equal(scenePage.post.payload.albumCount, 2, "the scene count comes from the pictures, not from the client");
assert.deepEqual(scenePage.post.payload.captions, ["First", "", "Third"], "captions are trimmed and match the scenes");
assert.equal((await ok(newcomer.token, "getPostImage", { postId: sceneStory.id, position: 1 })).dataUrl, PIXEL2);
assert.ok(scenePage.post.expiresAt, "stories still expire after 24 hours");
pass("quiz pictures and timers: server clock, hidden until started, late answers score 0; stories: scenes and captions");

// ── Live calls: what the phone app needs from the server ──────────────────
const peerOf = (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
const callRoom = `k-live-${styleRoom.id}`;
async function rtcGet(token, room, peer, name, since = 0) {
  const qs = new URLSearchParams({ room, peer, name, since: String(since) });
  const res = await fetch(`${base}/api/rtc?${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json() };
}
async function rtcPost(token, body) {
  const res = await fetch(`${base}/api/rtc`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
const ice = await ok(owner.token, "getIceServers", undefined);
assert.ok(Array.isArray(ice) && ice.length >= 1 && ice.every((s) => s.urls), "the phone gets a list of network servers for calls");
assert.equal((await ok(owner.token, "toggleVoice", { roomId: styleRoom.id, on: true })).inVoice, true, "joining the call marks you as present");
assert.equal((await ok(stylist.token, "toggleVoice", { roomId: styleRoom.id, on: true })).inVoice, true);
const ownerPeer = peerOf(owner.id);
const stylistPeer = peerOf(stylist.id);
assert.equal((await rtcGet(null, callRoom, ownerPeer, "Owner")).status, 401, "the call service needs the sign-in token");
const firstPoll = await rtcGet(owner.token, callRoom, ownerPeer, "Owner");
assert.equal(firstPoll.status, 200, "the phone's sign-in token works on the call service");
assert.deepEqual(firstPoll.body.peers.map((p) => p.id), [ownerPeer]);
const secondPoll = await rtcGet(stylist.token, callRoom, stylistPeer, "Stylist");
assert.deepEqual(secondPoll.body.peers.map((p) => p.id).sort(), [ownerPeer, stylistPeer].sort(), "the second person sees the first");
const offerSent = await rtcPost(stylist.token, { op: "signal", room: callRoom, from: stylistPeer, to: ownerPeer, kind: "offer", payload: { type: "offer", sdp: "v=0" } });
assert.equal(offerSent.status, 200);
const inbox = await rtcGet(owner.token, callRoom, ownerPeer, "Owner", 0);
assert.equal(inbox.body.signals.length, 1, "the offer reaches its addressee");
assert.deepEqual({ from: inbox.body.signals[0].from, kind: inbox.body.signals[0].kind }, { from: stylistPeer, kind: "offer" });
assert.equal((await rtcGet(owner.token, callRoom, ownerPeer, "Owner", inbox.body.signals[0].id)).body.signals.length, 0, "signals are delivered once");
assert.equal((await rtcGet(stylist.token, callRoom, ownerPeer, "Owner")).status, 403, "nobody can join a call under someone else's name");
assert.equal((await rtcGet(nonMember.token, callRoom, peerOf(nonMember.id), "Outsider")).status, 403, "people outside the room cannot join its call");
assert.equal((await rtcPost(nonMember.token, { op: "signal", room: callRoom, from: peerOf(nonMember.id), to: ownerPeer, kind: "offer", payload: {} })).status, 403);
assert.equal((await rtcGet(owner.token, "k-live-999999", ownerPeer, "Owner")).status, 403, "a room that does not exist is refused");
await ok(owner.token, "ringCall", styleRoom.id);
const ringing = await ok(stylist.token, "listIncomingCalls", undefined);
assert.ok(ringing.some((c) => c.href === `/chats/${styleRoom.id}?call=1`), "the other person's phone sees the call ringing");
await ok(stylist.token, "endCall", styleRoom.id);
assert.equal((await ok(stylist.token, "listIncomingCalls", undefined)).some((c) => c.href === `/chats/${styleRoom.id}?call=1`), false, "hanging up stops the ringing");
assert.equal((await rtcPost(stylist.token, { op: "leave", room: callRoom, peer: stylistPeer })).status, 200);
assert.deepEqual((await rtcGet(owner.token, callRoom, ownerPeer, "Owner")).body.peers.map((p) => p.id), [ownerPeer], "leaving removes you from the roster");
await ok(owner.token, "toggleVoice", { roomId: styleRoom.id, on: false });
await ok(stylist.token, "toggleVoice", { roomId: styleRoom.id, on: false });
pass("live calls: sign-in token works on the call service, only room members join under their own name, offers are delivered once, ringing and hang-up");

// ── Without AI keys: the built-in rules still protect, and stories work without the storyteller ──
const noAi = await ok(null, "getAiStatus", undefined);
assert.deepEqual([noAi.moderation, noAi.storyteller, noAi.repliesLeft], [false, false, 0], "this test server has no AI keys");
const rulesHeld = await ok(stylist.token, "createPost", { slug: hall.id, type: "blog", title: "Garage sale", body: "selling glock switches cheap" });
assert.equal(rulesHeld.held, true, "the built-in rules hold weapon sales with no AI at all");
assert.ok((await ok(owner.token, "listSafetyFlags", { slug: hall.id })).some((f) => f.targetId === String(rulesHeld.id) && f.action === "hold"));
const plainScene = await ok(stylist.token, "createScene", {
  slug: hall.id, title: "Tea party", source: "", premise: "A calm tea party where the hatter is late.", characters: [{ name: "Alice" }, { name: "Hatter" }], playAs: "Alice",
});
assert.deepEqual([plainScene.held, plainScene.aiError], [false, null], "no storyteller: no opening, and no error either");
const plainTurn = await ok(stylist.token, "addTurn", { sceneId: plainScene.id, body: "Alice pours the tea." });
assert.equal(plainTurn.aiError, null, "turns work without the storyteller");
assert.deepEqual((await ok(owner.token, "getScene", { sceneId: plainScene.id })).turns.map((t) => t.kind), ["turn"]);
assert.match(await refused(stylist.token, "writeEnding", { sceneId: plainScene.id, direction: "everyone naps happily" }), /not set up/);
assert.match(await refused(stylist.token, "draftScene", { slug: hall.id, idea: "a tea party" }), /not set up/);
pass("without AI keys: built-in rules still hold illegal sales; stories are played by members; AI buttons explain themselves");

// ── Account deletion ───────────────────────────────────────────────────────
assert.match(await refused(other.token, "deleteMyAccount", { confirm: "yes" }), /DELETE/);
await ok(other.token, "createPost", { slug: hall.id, type: "blog", title: "About to vanish", body: "bye" });
await ok(other.token, "deleteMyAccount", { confirm: "DELETE" });
assert.equal((await call(other.token, "getMe", {})).status, 401, "the deleted account's token stops working");
const feed = await ok(null, "getCommunityPage", { slug: hall.id });
assert.ok(!feed.posts.some((p) => p.title === "About to vanish"), "deleted user's posts are gone");
pass("account deletion: needs typed confirmation, removes the account, its session and its posts");

console.log(`\n${passed} mobile integration groups passed`);
