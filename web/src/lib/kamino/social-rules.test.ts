import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanInterests,
  cleanProfileCategories,
  cleanTopics,
  cleanWebsite,
  communityActivityScore,
  compactNumber,
  forYouScore,
  fuzzyScore,
  inQuietHours,
  interestsForCommunity,
  isMessageRequest,
  messageRequestFor,
  muteSilences,
  MUTE_SILENCED_KINDS,
  canDeleteComment,
  localHour,
  mergeHashtags,
  moderatorBadge,
  normalizeTag,
  notificationCategory,
  notificationVerb,
  parseCursor,
  parseHref,
  parseNotifyPrefs,
  rankBucket,
  shouldPush,
  similarity,
  streakWeek,
  suggestTagsFrom,
  joinColor,
} from "./social-rules.ts";

test("compact numbers read like the mockups", () => {
  assert.equal(compactNumber(0), "0");
  assert.equal(compactNumber(999), "999");
  assert.equal(compactNumber(1234), "1.2K");
  assert.equal(compactNumber(12_400), "12.4K");
  assert.equal(compactNumber(245_000), "245K");
  assert.equal(compactNumber(1_300_000), "1.3M");
  assert.equal(compactNumber(1000), "1K");
  assert.equal(compactNumber(999_999), "1M");
  assert.equal(compactNumber(2_500_000_000), "2.5B");
});

test("For You ranking: fresher, busier and closer-to-you posts score higher", () => {
  const base = { ageHours: 2, likes: 3, comments: 1, interestMatch: false, joined: false };
  assert.ok(forYouScore(base) > forYouScore({ ...base, ageHours: 30 }), "newer wins");
  assert.ok(forYouScore({ ...base, likes: 10 }) > forYouScore(base), "more likes wins");
  assert.equal(forYouScore({ ...base, likes: 0, comments: 1 }), forYouScore({ ...base, likes: 2, comments: 0 }), "a comment counts double");
  assert.ok(forYouScore({ ...base, joined: true }) > forYouScore({ ...base, interestMatch: true }), "joined boost beats interest boost");
  assert.ok(forYouScore({ ...base, interestMatch: true }) > forYouScore(base));
  // freshness halves every 24 hours
  const a = forYouScore({ ...base, ageHours: 0 });
  const b = forYouScore({ ...base, ageHours: 24 });
  assert.ok(Math.abs(b / a - 0.5) < 1e-9);
  assert.ok(forYouScore({ ...base, ageHours: -5 }) <= forYouScore({ ...base, ageHours: 0 }), "future dates are not boosted");
});

test("community rank buckets", () => {
  assert.equal(rankBucket(1, 400), 1);
  assert.equal(rankBucket(4, 400), 1);
  assert.equal(rankBucket(5, 400), 5);
  assert.equal(rankBucket(1, 10), 10);
  assert.equal(rankBucket(3, 10), 50);
  assert.equal(rankBucket(30, 100), 50);
  assert.equal(rankBucket(51, 100), 100);
  assert.equal(rankBucket(0, 0), 100);
  assert.equal(communityActivityScore({ posts: 2, comments: 3, checkins: 4, members: 10 }), 19);
});

test("community categories map to interests (old names, new names and topics)", () => {
  assert.deepEqual(interestsForCommunity("Music").sort(), ["kpop", "music"]);
  assert.deepEqual(interestsForCommunity("Games"), ["gaming"]);
  assert.deepEqual(interestsForCommunity("K-Pop"), ["kpop"]);
  assert.deepEqual(interestsForCommunity("Pets"), ["pets"]);
  assert.ok(interestsForCommunity("Lifestyle").includes("food"));
  assert.ok(interestsForCommunity("Art", ["Photography", "random"]).includes("photography"));
  assert.deepEqual(interestsForCommunity("Unknown thing"), []);
});

test("interests, profile categories and topics are cleaned", () => {
  assert.deepEqual(cleanInterests(["anime", "ANIME", "nope", "kpop", 3]), ["anime", "kpop"]);
  assert.deepEqual(cleanInterests("anime"), []);
  assert.equal(cleanProfileCategories(["art", "daily", "gaming", "growth", "qa", "milestones", "music"]).length, 6);
  assert.deepEqual(cleanProfileCategories(["art", "bogus", "art"]), ["art"]);
  assert.deepEqual(cleanTopics(["  #Fan Art ", "fan art", "", "x".repeat(40), 5]), ["Fan Art", "x".repeat(24)]);
  assert.equal(cleanTopics(Array.from({ length: 12 }, (_, i) => `t${i}`)).length, 8);
});

test("notification categories and words", () => {
  for (const k of ["like", "comment", "mention", "follow", "wall"]) assert.equal(notificationCategory(k), "social", k);
  for (const k of ["invite", "join", "announcement", "broadcast", "mod", "safety", "achievement"]) assert.equal(notificationCategory(k), "community", k);
  for (const k of ["event", "live", "call"]) assert.equal(notificationCategory(k), "events", k);
  assert.equal(notificationCategory("chat"), "messages");
  assert.equal(notificationCategory("something-new"), "community");
  assert.equal(notificationVerb("follow"), "started following you");
  assert.equal(notificationVerb("achievement"), "");
});

test("quiet hours, time zones and push decisions", () => {
  assert.equal(inQuietHours(23, 22, 7), true);
  assert.equal(inQuietHours(3, 22, 7), true);
  assert.equal(inQuietHours(7, 22, 7), false);
  assert.equal(inQuietHours(12, 22, 7), false);
  assert.equal(inQuietHours(13, 13, 15), true);
  assert.equal(inQuietHours(15, 13, 15), false);
  assert.equal(inQuietHours(5, null, 7), false);
  assert.equal(inQuietHours(5, 5, 5), false);
  const noonUtc = new Date("2026-06-01T12:00:00Z");
  assert.equal(localHour(noonUtc, ""), 12);
  assert.equal(localHour(noonUtc, "America/Vancouver"), 5); // PDT is UTC-7
  assert.equal(localHour(noonUtc, "Not/AZone"), 12);
  const prefs = parseNotifyPrefs("{}");
  assert.deepEqual(prefs, { social: true, community: true, events: true, messages: true, digest: false });
  assert.equal(parseNotifyPrefs('{"social":false}').social, false);
  assert.equal(parseNotifyPrefs("not json").events, true);
  assert.equal(shouldPush({ kind: "like", prefs, quietStart: null, quietEnd: null, timezone: "", now: noonUtc }), true);
  assert.equal(shouldPush({ kind: "like", prefs: { ...prefs, social: false }, quietStart: null, quietEnd: null, timezone: "", now: noonUtc }), false);
  assert.equal(shouldPush({ kind: "event", prefs: { ...prefs, social: false }, quietStart: null, quietEnd: null, timezone: "", now: noonUtc }), true);
  // 5 am in Vancouver falls inside 22 -> 7 quiet hours
  assert.equal(shouldPush({ kind: "like", prefs, quietStart: 22, quietEnd: 7, timezone: "America/Vancouver", now: noonUtc }), false);
  assert.equal(shouldPush({ kind: "like", prefs, quietStart: 22, quietEnd: 7, timezone: "", now: noonUtc }), true);
});

test("message requests: only strangers land in Requests", () => {
  assert.equal(isMessageRequest({ recipientFollowsSender: false, sharesCommunity: false }), true);
  assert.equal(isMessageRequest({ recipientFollowsSender: true, sharesCommunity: false }), false);
  assert.equal(isMessageRequest({ recipientFollowsSender: false, sharesCommunity: true }), false);
});

test("message requests: a muted sender always lands in Requests, quietly", () => {
  // Only the mute makes it a request: the sender is not told (viaMute).
  assert.deepEqual(messageRequestFor({ recipientFollowsSender: true, sharesCommunity: true, recipientMutedSender: true }), { request: true, viaMute: true });
  assert.deepEqual(messageRequestFor({ recipientFollowsSender: false, sharesCommunity: true, recipientMutedSender: true }), { request: true, viaMute: true });
  // A stranger is a normal request, muted or not.
  assert.deepEqual(messageRequestFor({ recipientFollowsSender: false, sharesCommunity: false, recipientMutedSender: true }), { request: true, viaMute: false });
  assert.deepEqual(messageRequestFor({ recipientFollowsSender: false, sharesCommunity: false, recipientMutedSender: false }), { request: true, viaMute: false });
  // Not muted, not a stranger: straight into chats.
  assert.deepEqual(messageRequestFor({ recipientFollowsSender: true, sharesCommunity: false, recipientMutedSender: false }), { request: false, viaMute: false });
});

test("personal mutes silence social notifications only", () => {
  for (const kind of ["like", "comment", "mention", "follow", "follow_request", "follow_accept", "wall", "tip", "chat", "call", "live", "invite"])
    assert.equal(muteSilences(kind), true, kind);
  for (const kind of ["mute", "strike", "ban", "safety", "support", "appeal", "report", "event", "achievement", "broadcast", "join", "title", "challenge"])
    assert.equal(muteSilences(kind), false, kind);
  assert.equal(new Set(MUTE_SILENCED_KINDS).size, MUTE_SILENCED_KINDS.length);
});

test("deleting a comment: its author, community moderators and site owners", () => {
  const base = { viewerId: "me", authorId: "them", viewerRole: "member", viewerStatus: "active", siteAdmin: false };
  assert.equal(canDeleteComment({ ...base, authorId: "me" }), true, "your own comment");
  assert.equal(canDeleteComment({ ...base, authorId: "me", viewerStatus: null, viewerRole: null }), true, "even after leaving");
  assert.equal(canDeleteComment(base), false, "someone else's");
  for (const role of ["agent", "leader", "curator"]) assert.equal(canDeleteComment({ ...base, viewerRole: role }), true, role);
  assert.equal(canDeleteComment({ ...base, viewerRole: "leader", viewerStatus: "banned" }), false, "a banned leader cannot");
  assert.equal(canDeleteComment({ ...base, viewerRole: null, viewerStatus: null, siteAdmin: true }), true, "site owner");
  assert.equal(canDeleteComment({ ...base, viewerId: "", authorId: "" }), false, "no viewer");
});

test("streak card week (Monday..Sunday, UTC days)", () => {
  const wed = new Date("2026-09-30T15:00:00Z"); // a Wednesday
  assert.deepEqual(streakWeek("2026-09-30", 3, wed), { days: 3, week: [true, true, true, false, false, false, false], checkedInToday: true });
  assert.deepEqual(streakWeek("2026-09-29", 10, wed).week, [true, true, false, false, false, false, false]);
  assert.equal(streakWeek("2026-09-29", 10, wed).checkedInToday, false);
  assert.deepEqual(streakWeek("2026-09-27", 5, wed), { days: 0, week: [false, false, false, false, false, false, false], checkedInToday: false });
  assert.equal(streakWeek(null, 0, wed).days, 0);
  const sunday = new Date("2026-10-04T10:00:00Z");
  assert.deepEqual(streakWeek("2026-10-04", 2, sunday).week, [false, false, false, false, false, true, true]);
});

test("hashtags: normalized, merged, capped at ten", () => {
  assert.equal(normalizeTag("#FanArt"), "fanart");
  assert.equal(normalizeTag("1abc"), null);
  assert.equal(normalizeTag("a"), null);
  assert.deepEqual(mergeHashtags(["Art", "#art", "bad tag", "music"], ["music", "ost"]), ["art", "music", "ost"]);
  assert.equal(mergeHashtags(Array.from({ length: 15 }, (_, i) => `tag${i}`), []).length, 10);
  assert.deepEqual(mergeHashtags("nope", ["x1"]), ["x1"]);
});

test("tag suggestions favour community topics, then popular tags, then words", () => {
  const tags = suggestTagsFrom({ text: "My new watercolor painting of a dragon, watercolor again #wip", topics: ["Fan Art", "Painting"], popular: ["dragon", "wip", "oc"] });
  assert.ok(tags.length <= 6);
  assert.equal(tags[0], "painting");
  assert.ok(tags.includes("dragon"));
  assert.ok(tags.includes("watercolor"));
  assert.ok(!tags.includes("wip"), "tags already in the text are skipped");
  assert.equal(suggestTagsFrom({ text: "", topics: [], popular: [] }).length, 0);
});

test("typo-tolerant matching", () => {
  assert.ok(similarity("anime", "anime") === 1);
  assert.ok(fuzzyScore("anmie", "Starlight Anime Club") < fuzzyScore("anime", "Starlight Anime Club"));
  assert.ok(fuzzyScore("starlite", "Starlight Frames") > 0.3);
  assert.ok(fuzzyScore("zzzz", "Starlight Frames") < 0.1);
});

test("websites must be http(s)", () => {
  assert.equal(cleanWebsite(""), "");
  assert.equal(cleanWebsite("example.com"), "https://example.com/");
  assert.equal(cleanWebsite("http://my.site/page"), "http://my.site/page");
  assert.throws(() => cleanWebsite("javascript:alert(1)"));
  assert.throws(() => cleanWebsite("ftp://files.example.com"));
  assert.throws(() => cleanWebsite("localhost"));
  assert.throws(() => cleanWebsite(`https://example.com/${"a".repeat(220)}`));
});

test("links, cursors, badges and colours", () => {
  assert.deepEqual(parseHref("/c/starlight/p/12"), { type: "post", id: "12", slug: "starlight" });
  assert.deepEqual(parseHref("/c/starlight/mod"), { type: "community", id: "starlight", slug: "starlight" });
  assert.deepEqual(parseHref("/chats/5?call=1"), { type: "room", id: "5", slug: "" });
  assert.deepEqual(parseHref("/u/mira"), { type: "profile", id: "mira", slug: "" });
  assert.equal(parseHref("/wallet").type, "");
  assert.deepEqual(parseCursor("o:20"), { offset: 20 });
  assert.deepEqual(parseCursor("2026-01-02T03:04:05.000Z|17"), { at: "2026-01-02T03:04:05.000Z", id: 17 });
  assert.equal(parseCursor("drop table"), null);
  assert.equal(moderatorBadge("agent").label, "Leader");
  assert.equal(moderatorBadge("leader").badge, "coleader");
  assert.equal(moderatorBadge("curator").badge, "moderator");
  assert.equal(joinColor(0), "#944FFB");
  assert.equal(joinColor(6), "#0099FE");
});

test("trending favours this week's posts and new members", async () => {
  const { trendingScore, scrubProfile, isOnlineNow, isCreator } = await import("./social-rules.ts");
  const quiet = { posts7: 0, posts30: 10, comments30: 5, checkins30: 0, newMembers14: 0 };
  const busy = { posts7: 5, posts30: 5, comments30: 0, checkins30: 0, newMembers14: 0 };
  assert.ok(trendingScore(busy) > trendingScore(quiet));
  assert.equal(trendingScore({ posts7: 1, posts30: 1, comments30: 1, checkins30: 1, newMembers14: 1 }), 8);
  const profile = {
    quietStart: 22, quietEnd: 7, timezone: "Europe/Paris", notifyPrefs: { social: false, community: true, events: true, messages: true, digest: true },
    interests: ["anime"], showOnline: false, lastSeenAt: new Date().toISOString(), showReadReceipts: false, handle: "x",
  };
  const seen = scrubProfile(profile, false);
  assert.equal(seen.quietStart, null);
  assert.equal(seen.timezone, "");
  assert.equal(seen.notifyPrefs.social, true);
  assert.deepEqual(seen.interests, []);
  assert.equal(seen.lastSeenAt, null);
  assert.equal(seen.handle, "x");
  assert.equal(scrubProfile(profile, true), profile);
  assert.equal(isOnlineNow(new Date().toISOString(), true), true);
  assert.equal(isOnlineNow(new Date().toISOString(), false), false);
  assert.equal(isOnlineNow(new Date(Date.now() - 6 * 60_000).toISOString(), true), false);
  assert.equal(isCreator(false, 999), false);
  assert.equal(isCreator(false, 1000), true);
  assert.equal(isCreator(true, 0), true);
});
