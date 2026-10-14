import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  collapseChats,
  dayGroup,
  followButtonLabel,
  groupByDay,
  hourLabel,
  joinedLabel,
  normalizeWebsite,
  notificationKind,
  pronounsLabel,
  toggleLimited,
  toggleShowcase,
  websiteLabel,
} from "./helpers.ts";

test("notificationKind maps server kinds to row badges", () => {
  assert.equal(notificationKind({ kind: "like" }), "like");
  assert.equal(notificationKind({ kind: "chat" }), "comment");
  assert.equal(notificationKind({ kind: "follow_request" }), "follow");
  assert.equal(notificationKind({ kind: "live" }), "live");
  assert.equal(notificationKind({ kind: "invite" }), "community");
});

test("dayGroup and groupByDay split by calendar day", () => {
  const now = new Date(2026, 9, 3, 15, 0);
  assert.equal(dayGroup(new Date(2026, 9, 3, 1, 0).toISOString(), now), "Today");
  assert.equal(dayGroup(new Date(2026, 9, 2, 23, 0).toISOString(), now), "Yesterday");
  assert.equal(dayGroup(new Date(2026, 8, 30).toISOString(), now), "Earlier");
  const groups = groupByDay([{ createdAt: new Date(2026, 8, 1).toISOString() }], now);
  assert.deepEqual(groups.map((g) => g.title), ["Earlier"]);
});

test("collapseChats keeps the newest row per chat and counts the rest", () => {
  const rows = [
    { id: 3, category: "messages", room: { id: 7 } },
    { id: 2, category: "messages", room: { id: 7 } },
    { id: 1, category: "social", room: null },
  ];
  const out = collapseChats(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.count, 2);
  assert.equal(out[0]!.id, 3);
});

test("profile labels", () => {
  assert.equal(pronounsLabel("she/her"), "She/Her");
  assert.equal(websiteLabel("https://www.linktr.ee/luna/"), "linktr.ee/luna");
  assert.equal(normalizeWebsite("linktr.ee/x"), "https://linktr.ee/x");
  assert.equal(normalizeWebsite("not a site"), null);
  assert.equal(normalizeWebsite(""), "");
  assert.equal(joinedLabel("2022-03-10T00:00:00Z"), "Joined Mar 2022");
  assert.equal(hourLabel(0), "12 AM");
  assert.equal(hourLabel(22), "10 PM");
});

test("follow button, limited toggles and showcase", () => {
  assert.equal(followButtonLabel({ following: false, requested: false, privateAccount: true }), "Request");
  assert.equal(followButtonLabel({ following: false, requested: false, privateAccount: false, followsYou: true }), "Follow Back");
  assert.deepEqual(toggleLimited(["a", "b"], "c", 2), ["a", "b"]);
  assert.deepEqual(toggleLimited(["a", "b"], "a", 2), ["b"]);
  assert.deepEqual(toggleShowcase(["a", "b", "c"], "d"), ["b", "c", "d"]);
});
