import assert from "node:assert/strict";
import { test } from "node:test";
import { ACHIEVEMENTS, MAX_SHOWCASE, achievementStates, cleanShowcase, earnedIds, emptyMetrics, unlockMessage } from "./achievements.ts";

test("there is an achievement for nearly everything, each with a unique id and a clear description", () => {
  assert.ok(ACHIEVEMENTS.length >= 70, `only ${ACHIEVEMENTS.length}`);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name.length > 2 && a.desc.length > 5, a.id);
    assert.ok(a.target >= 1, a.id);
  }
  assert.ok(new Set(ACHIEVEMENTS.map((a) => a.category)).size >= 6);
});

test("tiers climb within a family: bronze, silver, gold, legend", () => {
  const posts = ACHIEVEMENTS.filter((a) => a.metric === "posts");
  assert.deepEqual(posts.map((a) => a.tier), ["bronze", "silver", "gold", "legend"]);
  assert.deepEqual(posts.map((a) => a.target), [1, 10, 50, 200]);
  assert.equal(ACHIEVEMENTS.find((a) => a.id === "leading-1")!.tier, "gold", "one-step achievements are gold");
});

test("counts earn achievements, with progress bars towards the rest", () => {
  const metrics = { ...emptyMetrics(), posts: 12, streak: 7 };
  const earned = earnedIds(metrics);
  assert.ok(earned.includes("posts-1") && earned.includes("posts-10"));
  assert.ok(!earned.includes("posts-50"));
  assert.ok(earned.includes("streak-3") && earned.includes("streak-7"));
  const states = achievementStates(metrics);
  const fifty = states.find((s) => s.id === "posts-50")!;
  assert.deepEqual([fifty.unlocked, fifty.progress, fifty.target], [false, 12, 50]);
  assert.equal(states.find((s) => s.id === "posts-10")!.progress, 10, "the bar is capped at the target");
  assert.equal(earnedIds(emptyMetrics()).length, 0);
});

test("an unlocked achievement is never taken away", () => {
  const states = achievementStates(emptyMetrics(), new Map([["posts-10", "2026-09-01T00:00:00.000Z"]]));
  const ten = states.find((s) => s.id === "posts-10")!;
  assert.deepEqual([ten.unlocked, ten.unlockedAt], [true, "2026-09-01T00:00:00.000Z"]);
});

test("showcase keeps up to three unlocked, distinct ids", () => {
  const unlocked = new Set(["posts-1", "posts-10", "streak-3", "rep-100"]);
  assert.deepEqual(cleanShowcase(["posts-1", "posts-1", "nope", "posts-10", "streak-3", "rep-100"], unlocked), ["posts-1", "posts-10", "streak-3"]);
  assert.equal(cleanShowcase(["posts-50"], unlocked).length, 0, "locked achievements cannot be shown off");
  assert.deepEqual(cleanShowcase("posts-1", unlocked), []);
  assert.equal(MAX_SHOWCASE, 3);
});

test("unlock notifications name one achievement or count several", () => {
  assert.deepEqual(unlockMessage(["posts-1"]), { title: "Achievement unlocked: First Words", body: "Publish your first post" });
  assert.match(unlockMessage(["posts-1", "comments-1", "streak-3", "rep-100"])!.title, /4 achievements/);
  assert.equal(unlockMessage(["unknown"]), null);
});
