import assert from "node:assert/strict";
import { test } from "node:test";
import { HOME_TOOLS, hubShortcuts } from "./home-shortcuts.ts";

test("live rooms come first, each kind is capped at three and a live chat shows once", () => {
  const items = hubShortcuts({
    live: [{ id: 7, name: "Movie night", listeners: 4 }],
    chats: [
      { id: 7, name: "Movie night" },
      { id: 1, name: "AA", is_dm: true, peer_user_id: "u1", peer_hue: 30, peer_avatar_v: 2, latest: "2026-10-15T10:00:00Z" },
      { id: 2, name: "Group" },
      { id: 3, name: "Fourth" },
      { id: null, name: "No id" },
    ],
    events: [{ id: 9, title: "Meetup", community_id: "art", starts_at: "2026-10-20T18:00:00Z" }, { id: 10, title: "No community" }],
    visits: [{ id: "art", name: "Art Club" }],
  });
  assert.deepEqual(items.map((i) => i.key), ["live-7", "chat-1", "chat-2", "event-9", "visit-art"]);
  assert.equal(items[0]!.label, "4 listening");
  assert.equal(items[0]!.live, true);
  assert.deepEqual(items[1]!.person, { name: "AA", hue: 30, userId: "u1", avatarV: 2 }, "a direct chat shows the other person's face");
  assert.equal(items[1]!.label, "Message");
  assert.equal(items[1]!.at, "2026-10-15T10:00:00.000Z");
  assert.equal(items[2]!.person, null, "a group chat keeps the chat icon");
  assert.equal(items[3]!.href, "/community/art/events");
  assert.equal(items[4]!.href, "/community/art");
});

test("missing data gives no cards and bad dates are ignored", () => {
  assert.deepEqual(hubShortcuts(undefined), []);
  assert.deepEqual(hubShortcuts({}), []);
  assert.deepEqual(hubShortcuts({ chats: [{ id: 5, latest: "not a date" }] }).map((i) => [i.title, i.at]), [["Chat", null]]);
  assert.equal(hubShortcuts({ live: [{ id: 1, name: "Room", listeners: 0 }] })[0]!.label, "", "no listener count when nobody is in yet");
});

test("the tools tiles point at real screens", () => {
  assert.deepEqual(HOME_TOOLS.map((t) => t.href), ["/tools?tab=discovery", "/saved", "/tools?tab=creator"]);
});
