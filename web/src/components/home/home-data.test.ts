import { strict as assert } from "node:assert";
import { test } from "node:test";
import { afterCheckIn, eventWhen, hubShortcuts, patchPages, uniqueById, weekdayIndex } from "./home-data.ts";

test("weekdayIndex counts Monday as 0 and Sunday as 6 (UTC)", () => {
  assert.equal(weekdayIndex(new Date("2026-09-28T12:00:00Z")), 0); // Monday
  assert.equal(weekdayIndex(new Date("2026-10-04T12:00:00Z")), 6); // Sunday
});

test("afterCheckIn ticks today and adds a day once", () => {
  const before = { days: 6, week: [true, true, true, true, true, true, false], checkedInToday: false, best: 6 };
  const after = afterCheckIn(before, new Date("2026-10-04T12:00:00Z"));
  assert.deepEqual(after.week, [true, true, true, true, true, true, true]);
  assert.equal(after.days, 7);
  assert.equal(after.best, 7);
  assert.equal(after.checkedInToday, true);
  assert.equal(afterCheckIn(after), after, "a second check-in changes nothing");
});

test("eventWhen says Today / Tomorrow / a date", () => {
  const now = new Date(2026, 9, 3, 10, 0);
  assert.match(eventWhen(new Date(2026, 9, 3, 20, 0).toISOString(), now), /^Today at 8:00\sPM$/);
  assert.match(eventWhen(new Date(2026, 9, 4, 18, 30).toISOString(), now), /^Tomorrow at 6:30\sPM$/);
  assert.match(eventWhen(new Date(2026, 9, 10, 19, 0).toISOString(), now), /^Sat, Oct 10 at 7:00\sPM$/);
  assert.equal(eventWhen("not a date", now), "");
});

test("patchPages and uniqueById", () => {
  const pages = [
    { posts: [{ id: 1, liked: false }, { id: 2, liked: false }], next: "x" },
    { posts: [{ id: 2, liked: false }, { id: 3, liked: false }], next: null },
  ];
  const patched = patchPages(pages, 2, (p) => ({ ...p, liked: true }));
  assert.equal(patched[0]!.posts[1]!.liked, true);
  assert.equal(patched[1]!.posts[0]!.liked, true);
  assert.equal(pages[0]!.posts[1]!.liked, false, "the original is not changed");
  assert.deepEqual(uniqueById(patched.flatMap((p) => p.posts)).map((p) => p.id), [1, 2, 3]);
});

test("hubShortcuts orders live rooms first, caps each kind at three and shows a live chat once", () => {
  const items = hubShortcuts({
    live: [{ id: 7, name: "Movie night", listeners: 4 }],
    chats: [
      { id: 7, name: "Movie night" },
      { id: 1, name: "AA", is_dm: true, peer_user_id: "u1", peer_hue: 30, peer_avatar_v: 2, latest: "2026-10-15T10:00:00Z" },
      { id: 2, name: "Group" },
      { id: 3, name: "Fourth" },
      { id: null, name: "No id" },
    ],
    events: [{ id: 9, title: "Meetup", community_id: "art", starts_at: "2026-10-20T18:00:00Z" }, { id: 10, title: "Orphan" }],
    visits: [{ id: "art", name: "Art Club" }],
  });
  assert.deepEqual(items.map((i) => i.key), ["live-7", "chat-1", "chat-2", "event-9", "visit-art"]);
  assert.equal(items[0]!.kind, "Live · 4 listening");
  assert.equal(items[0]!.live, true);
  assert.deepEqual(items[1]!.person, { name: "AA", hue: 30, userId: "u1", avatarV: 2 });
  assert.equal(items[1]!.kind, "Message");
  assert.equal(items[1]!.at, "2026-10-15T10:00:00.000Z");
  assert.equal(items[2]!.person, null);
  assert.equal(items[3]!.href, "/c/art/events");
  assert.equal(items[4]!.href, "/c/art");
});

test("hubShortcuts is empty without data and tolerates missing lists", () => {
  assert.deepEqual(hubShortcuts(undefined), []);
  assert.deepEqual(hubShortcuts({}), []);
  assert.deepEqual(hubShortcuts({ chats: [{ id: 5, latest: "not a date" }] }).map((i) => [i.title, i.at]), [["Chat", null]]);
});
