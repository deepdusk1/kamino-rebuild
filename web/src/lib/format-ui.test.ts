import assert from "node:assert/strict";
import { test } from "node:test";
import { compactNumber, monthYear, timeAgo } from "./format-ui.ts";

test("compactNumber shortens counts like the mockups", () => {
  assert.equal(compactNumber(0), "0");
  assert.equal(compactNumber(7), "7");
  assert.equal(compactNumber(999), "999");
  assert.equal(compactNumber(1000), "1K");
  assert.equal(compactNumber(1234), "1.2K");
  assert.equal(compactNumber(1299), "1.2K", "rounds down so a count never looks bigger than it is");
  assert.equal(compactNumber(12_400), "12K");
  assert.equal(compactNumber(245_000), "245K");
  assert.equal(compactNumber(999_999), "999K", "never shows 1000K");
  assert.equal(compactNumber(1_000_000), "1M");
  assert.equal(compactNumber(1_300_000), "1.3M");
  assert.equal(compactNumber(2_000_000_000), "2B");
  assert.equal(compactNumber(-1500), "-1.5K");
  assert.equal(compactNumber(Number.NaN), "0");
});

test("timeAgo gives short friendly ages", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(timeAgo(ago(10_000), { now }), "now");
  assert.equal(timeAgo(ago(2 * 60_000), { now }), "2m ago");
  assert.equal(timeAgo(ago(3 * 3_600_000), { now }), "3h ago");
  assert.equal(timeAgo(ago(26 * 3_600_000), { now }), "1d ago");
  assert.equal(timeAgo(ago(15 * 86_400_000), { now }), "2w ago");
  assert.equal(timeAgo(ago(2 * 60_000), { now, short: true }), "2m");
  assert.equal(timeAgo("2026-03-04T10:00:00Z", { now }), "Mar 4");
  assert.equal(timeAgo("2024-03-04T10:00:00Z", { now }), "Mar 4, 2024");
  assert.equal(timeAgo("not a date", { now }), "");
  assert.equal(timeAgo(new Date(now + 60_000), { now }), "now", "a clock a little ahead is not negative");
});

test("monthYear formats join dates", () => {
  assert.equal(monthYear("2022-03-15T00:00:00Z"), "Mar 2022");
  assert.equal(monthYear("nope"), "");
});
