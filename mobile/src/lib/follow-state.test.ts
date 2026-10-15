import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFollow, followLabel, wantsFollow } from "./follow-state.ts";

const FOLLOWING = { following: true, requested: false };
const REQUESTED = { following: false, requested: true };
const NONE = { following: false, requested: false };

test("button words and what a tap asks for", () => {
  assert.equal(followLabel(FOLLOWING), "Following");
  assert.equal(followLabel(REQUESTED), "Requested");
  assert.equal(followLabel(NONE), "Follow");
  assert.equal(wantsFollow(NONE), true);
  // A waiting request is "stop" (cancel), not "follow again" — the old toggle got this wrong.
  assert.equal(wantsFollow(REQUESTED), false);
  assert.equal(wantsFollow(FOLLOWING), false);
});

test("a profile page gets the new state and its follower count moves by one", () => {
  const page = { profile: { userId: "u1", handle: "mika" }, following: false, requested: false, stats: { followers: 4, following: 9, posts: 2 } };
  const after = applyFollow(page, "u1", FOLLOWING);
  assert.equal(after.following, true);
  assert.equal(after.stats.followers, 5);
  assert.equal(after.stats.following, 9, "their own following count is a number about them, not you");
  const back = applyFollow(after, "u1", NONE);
  assert.equal(back.stats.followers, 4);
  assert.equal(page.following, false, "the original is not changed");
});

test("a request doesn't change the follower count", () => {
  const page = { profile: { userId: "u1" }, following: false, requested: false, stats: { followers: 4 } };
  const after = applyFollow(page, "u1", REQUESTED);
  assert.deepEqual([after.following, after.requested, after.stats.followers], [false, true, 4]);
});

test("people cards anywhere inside a page are updated; others keep their identity", () => {
  const other = { userId: "u2", following: false, requested: false, followers: 1 };
  const home = { featuredCreators: [{ userId: "u1", following: false, requested: false, followers: 10 }, other], streak: { days: 3 } };
  const after = applyFollow(home, "u1", FOLLOWING);
  assert.equal(after.featuredCreators[0]!.following, true);
  assert.equal(after.featuredCreators[0]!.followers, 11);
  assert.equal(after.featuredCreators[1], other);
  assert.equal(after.streak, home.streak);
});

test("infinite-query pages (follow lists) are updated", () => {
  const lists = { pages: [{ people: [{ userId: "u1", following: true, requested: false, followsYou: true }] }], pageParams: [null] };
  const after = applyFollow(lists, "u1", NONE);
  assert.equal(after.pages[0]!.people[0]!.following, false);
  assert.equal(after.pages[0]!.people[0]!.followsYou, true);
});

test("a community page's followingIds and requestedIds follow along", () => {
  const page = { followingIds: ["a", "u1"], requestedIds: [] as string[], members: [] };
  const unfollowed = applyFollow(page, "u1", NONE);
  assert.deepEqual(unfollowed.followingIds, ["a"]);
  const asked = applyFollow(unfollowed, "u1", REQUESTED);
  assert.deepEqual(asked.requestedIds, ["u1"]);
  assert.deepEqual(asked.followingIds, ["a"]);
});

test("nothing to change returns the very same object (no needless re-renders)", () => {
  const data = { posts: [{ id: 1, author: { userId: "u1", nickname: "Mika" } }], followingIds: ["u1"] };
  assert.equal(applyFollow(data, "u1", FOLLOWING), data);
  assert.equal(applyFollow(undefined, "u1", FOLLOWING), undefined);
  assert.equal(applyFollow("text", "u1", FOLLOWING), "text");
});
