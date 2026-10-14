import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collapseChats,
  dayGroup,
  eventWhen,
  followButtonLabel,
  groupByDay,
  hourLabel,
  joinedLabel,
  normalizeWebsite,
  notificationKind,
  notificationRoute,
  postKindIcon,
  pronounsLabel,
  toggleLimited,
  websiteLabel,
} from "./helpers.ts";

const now = new Date(2026, 9, 3, 15, 0); // Oct 3 2026, 3 PM local

test("notification kinds pick the right badge", () => {
  assert.equal(notificationKind({ kind: "like" }), "like");
  assert.equal(notificationKind({ kind: "comment" }), "comment");
  assert.equal(notificationKind({ kind: "chat" }), "comment");
  assert.equal(notificationKind({ kind: "follow_request" }), "follow");
  assert.equal(notificationKind({ kind: "mention" }), "mention");
  assert.equal(notificationKind({ kind: "live" }), "live");
  assert.equal(notificationKind({ kind: "event" }), "event");
  assert.equal(notificationKind({ kind: "invite", category: "community" }), "community");
  assert.equal(notificationKind({ kind: "something" }), "other");
});

test("notifications group into Today, Yesterday and Earlier", () => {
  assert.equal(dayGroup(new Date(2026, 9, 3, 0, 5).toISOString(), now), "Today");
  assert.equal(dayGroup(new Date(2026, 9, 2, 23, 0).toISOString(), now), "Yesterday");
  assert.equal(dayGroup(new Date(2026, 9, 1, 12, 0).toISOString(), now), "Earlier");
  const groups = groupByDay(
    [
      { id: 1, createdAt: new Date(2026, 9, 3, 14).toISOString() },
      { id: 2, createdAt: new Date(2026, 8, 20).toISOString() },
      { id: 3, createdAt: new Date(2026, 9, 3, 9).toISOString() },
    ],
    now,
  );
  assert.deepEqual(groups.map((g) => [g.title, g.data.map((d) => d.id)]), [["Today", [1, 3]], ["Earlier", [2]]]);
});

test("notification links open the right phone screen", () => {
  const fallback = (h: string) => `fallback:${h}`;
  assert.equal(notificationRoute("/c/anime-haven/events", fallback), "/community/anime-haven/events");
  assert.equal(notificationRoute("/c/anime-haven/p/2", fallback), "fallback:/c/anime-haven/p/2");
});

test("event times read naturally", () => {
  assert.equal(eventWhen(new Date(2026, 9, 3, 20, 0).toISOString(), now), "Starts today at 8:00 PM");
  assert.equal(eventWhen(new Date(2026, 9, 4, 9, 30).toISOString(), now), "Starts tomorrow at 9:30 AM");
  assert.equal(eventWhen(new Date(2026, 9, 12, 18, 0).toISOString(), now), "Starts Oct 12 at 6:00 PM");
  assert.equal(eventWhen(new Date(2026, 9, 3, 12, 0).toISOString(), now), "Happening now");
});

test("profile labels", () => {
  assert.equal(pronounsLabel("she/her"), "She/Her");
  assert.equal(pronounsLabel(" they / them "), "They/Them");
  assert.equal(websiteLabel("https://www.linktr.ee/lunasketch/"), "linktr.ee/lunasketch");
  assert.equal(joinedLabel(new Date(2022, 2, 14).toISOString()), "Joined Mar 2022");
  assert.equal(postKindIcon("image"), "image-outline");
  assert.equal(postKindIcon("blog"), "document-text-outline");
});

test("websites get https and bad ones are refused", () => {
  assert.equal(normalizeWebsite(""), "");
  assert.equal(normalizeWebsite("linktr.ee/luna"), "https://linktr.ee/luna");
  assert.equal(normalizeWebsite("http://example.com"), "http://example.com");
  assert.equal(normalizeWebsite("not a link"), null);
  assert.equal(normalizeWebsite("hello"), null);
});

test("profile categories stop at the limit", () => {
  assert.deepEqual(toggleLimited(["a", "b"], "c", 3), ["a", "b", "c"]);
  assert.deepEqual(toggleLimited(["a", "b", "c"], "d", 3), ["a", "b", "c"]);
  assert.deepEqual(toggleLimited(["a", "b", "c"], "b", 3), ["a", "c"]);
});

test("hours and follow buttons", () => {
  assert.equal(hourLabel(0), "12 AM");
  assert.equal(hourLabel(12), "12 PM");
  assert.equal(hourLabel(22), "10 PM");
  assert.equal(followButtonLabel({ following: true, requested: false, privateAccount: false }), "Following");
  assert.equal(followButtonLabel({ following: false, requested: true, privateAccount: true }), "Requested");
  assert.equal(followButtonLabel({ following: false, requested: false, privateAccount: true }), "Request");
  assert.equal(followButtonLabel({ following: false, requested: false, privateAccount: false, followsYou: true }), "Follow Back");
});

test("chat notifications collapse to one row per chat", () => {
  const rows = collapseChats([
    { id: 1, category: "messages", room: { id: 7 } },
    { id: 2, category: "social", room: null },
    { id: 3, category: "messages", room: { id: 7 } },
    { id: 4, category: "messages", room: { id: 8 } },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.count]), [[1, 2], [2, 1], [4, 1]]);
});
