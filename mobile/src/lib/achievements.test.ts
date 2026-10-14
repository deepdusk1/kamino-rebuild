import assert from "node:assert/strict";
import { test } from "node:test";
import { TIER_LOOK, achievementIcon, achievementMedal, byCategory, progressShare, toggleShowcase } from "./achievements.ts";

const base = { id: "posts-10", name: "Storyteller", desc: "", icon: "pen", category: "Creating", tier: "silver" as const, progress: 4, target: 10, unlocked: false, unlockedAt: null };

test("every tier has two colours and readable text", () => {
  for (const look of Object.values(TIER_LOOK)) {
    assert.equal(look.colors.length, 2);
    assert.match(look.text, /^#[0-9a-f]{6}$/);
  }
});

test("icons map to coloured medals, unknown ones fall back to a violet medal", () => {
  assert.deepEqual(achievementMedal("heart"), { icon: "heart", tone: "pink" });
  assert.deepEqual(achievementMedal("crown"), { icon: "ribbon", tone: "orange" });
  assert.deepEqual(achievementMedal("nope"), { icon: "medal", tone: "violet" });
  assert.equal(achievementIcon("pen"), "brush-outline");
  assert.equal(achievementIcon("nope"), "medal-outline");
});

test("progress is a share between 0 and 1, full when unlocked", () => {
  assert.equal(progressShare(base), 0.4);
  assert.equal(progressShare({ ...base, unlocked: true }), 1);
  assert.equal(progressShare({ ...base, progress: 50 }), 1);
});

test("achievements group by category in order", () => {
  const groups = byCategory([base, { ...base, id: "a", category: "Chat" }, { ...base, id: "b" }]);
  assert.deepEqual(groups.map((g) => [g.category, g.items.length]), [["Creating", 2], ["Chat", 1]]);
});

test("the showcase holds at most three, newest choice wins", () => {
  assert.deepEqual(toggleShowcase(["a", "b", "c"], "d"), ["b", "c", "d"]);
  assert.deepEqual(toggleShowcase(["a", "b"], "a"), ["b"]);
});
