import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePlatformFlag, platformFlagBucket } from "./platform-flag-rules.ts";

test("a disabled feature excludes every rollout cohort", () => {
  for (let i = 0; i < 200; i++)
    assert.equal(evaluatePlatformFlag(`member-${i}`, "discovery_assistant", false, 100), false);
});
test("zero and complete rollout have exact boundaries", () => {
  for (let i = 0; i < 200; i++) {
    assert.equal(evaluatePlatformFlag(`member-${i}`, "related_discovery", true, 0), false);
    assert.equal(evaluatePlatformFlag(`member-${i}`, "related_discovery", true, 100), true);
  }
});
test("assignment is stable and only expands when the percentage grows", () => {
  let included = 0,
    excluded = 0;
  for (let i = 0; i < 200; i++) {
    const user = `member-${i}`;
    assert.equal(
      platformFlagBucket(user, "discovery_assistant"),
      platformFlagBucket(user, "discovery_assistant"),
    );
    const early = evaluatePlatformFlag(user, "discovery_assistant", true, 25);
    const later = evaluatePlatformFlag(user, "discovery_assistant", true, 50);
    if (early) assert.equal(later, true);
    if (later) included++;
    else excluded++;
  }
  assert.ok(included > 0 && excluded > 0);
});
test("invalid percentages do not enable access and finite values are bounded", () => {
  assert.equal(evaluatePlatformFlag("member", "related_discovery", true, NaN), false);
  assert.equal(evaluatePlatformFlag("member", "related_discovery", true, Infinity), false);
  assert.equal(evaluatePlatformFlag("member", "related_discovery", true, -2), false);
  assert.equal(evaluatePlatformFlag("member", "related_discovery", true, 102), true);
});
