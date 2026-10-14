import assert from "node:assert/strict";
import { test } from "node:test";
import { QUIZ_IMAGE_BASE, formatClock, remainingMs, usedSoFarMs } from "./quiz.ts";

test("the clock shows minutes and seconds and never goes negative", () => {
  assert.equal(formatClock(65_000), "1:05");
  assert.equal(formatClock(59_100), "1:00");
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(-5000), "0:00");
});

test("time left counts what the server already used plus what this phone counted since", () => {
  assert.equal(remainingMs(60, 10_000, 5_000), 45_000);
  assert.equal(remainingMs(60, 0, 61_000), -1_000);
});

test("time used so far comes from the server's two timestamps", () => {
  assert.equal(usedSoFarMs("2026-09-29T10:00:00.000Z", "2026-09-29T10:00:12.500Z"), 12_500);
  assert.equal(usedSoFarMs("2026-09-29T10:00:05.000Z", "2026-09-29T10:00:00.000Z"), 0);
  assert.equal(usedSoFarMs("nonsense", "2026-09-29T10:00:00.000Z"), 0);
});

test("quiz pictures start at position 100, matching the server", () => {
  assert.equal(QUIZ_IMAGE_BASE, 100);
});
