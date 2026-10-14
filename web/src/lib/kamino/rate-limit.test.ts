import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { hit, resetRateLimits, spamGuard, RateLimitError } from "./rate-limit.server.ts";

beforeEach(() => resetRateLimits());

test("allows up to the limit, then says how long to wait", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i += 1) assert.equal(hit("k", 3, 10_000, t0 + i), 0);
  const wait = hit("k", 3, 10_000, t0 + 5);
  assert.ok(wait >= 9 && wait <= 10, `expected about 10 seconds, got ${wait}`);
});

test("the window slides: old hits stop counting", () => {
  const t0 = 2_000_000;
  for (let i = 0; i < 3; i += 1) hit("k", 3, 10_000, t0);
  assert.ok(hit("k", 3, 10_000, t0 + 5_000) > 0);
  assert.equal(hit("k", 3, 10_000, t0 + 10_001), 0);
});

test("a refused hit is not counted, so waiting really helps", () => {
  const t0 = 3_000_000;
  hit("k", 1, 10_000, t0);
  for (let i = 0; i < 50; i += 1) hit("k", 1, 10_000, t0 + 100 + i);
  assert.equal(hit("k", 1, 10_000, t0 + 10_001), 0);
});

test("people are counted separately", () => {
  const t0 = 4_000_000;
  hit("a", 1, 10_000, t0);
  assert.ok(hit("a", 1, 10_000, t0 + 1) > 0);
  assert.equal(hit("b", 1, 10_000, t0 + 1), 0);
});

test("spamGuard throws a 429 error with a friendly message", () => {
  for (let i = 0; i < 6; i += 1) spamGuard("u1", "community");
  assert.throws(
    () => spamGuard("u1", "community"),
    (error: unknown) => error instanceof RateLimitError && error.status === 429 && /too fast/.test(error.message),
  );
});
