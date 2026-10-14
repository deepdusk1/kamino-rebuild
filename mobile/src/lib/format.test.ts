import assert from "node:assert/strict";
import { test } from "node:test";
import { compactCount, compactNumber, parseLocalDateTime, plainPreview, plural, shortTimeAgo, timeAgo } from "./format.ts";

const now = Date.parse("2026-09-28T12:00:00Z");
test("timeAgo picks a readable unit", () => {
  assert.equal(timeAgo("2026-09-28T11:59:40Z", now), "just now");
  assert.equal(timeAgo("2026-09-28T11:58:00Z", now), "2m ago");
  assert.equal(timeAgo("2026-09-28T11:55:00Z", now), "5m ago");
  assert.equal(timeAgo("2026-09-28T09:00:00Z", now), "3h ago");
  assert.equal(timeAgo("2026-09-27T12:00:00Z", now), "1d ago");
  assert.equal(timeAgo("2026-09-26T12:00:00Z", now), "2d ago");
  assert.equal(timeAgo(null, now), "");
  assert.equal(timeAgo("not a date", now), "");
});
test("shortTimeAgo drops the ago", () => {
  assert.equal(shortTimeAgo("2026-09-28T11:58:00Z", now), "2m");
  assert.equal(shortTimeAgo("2026-09-28T11:00:00Z", now), "1h");
  assert.equal(shortTimeAgo("2026-09-28T11:59:50Z", now), "just now");
});
test("compactNumber abbreviates like the mockups", () => {
  assert.equal(compactNumber(0), "0");
  assert.equal(compactNumber(999), "999");
  assert.equal(compactNumber(1000), "1K");
  assert.equal(compactNumber(1234), "1.2K");
  assert.equal(compactNumber(12_400), "12.4K");
  assert.equal(compactNumber(24_500), "24.5K");
  assert.equal(compactNumber(245_000), "245K");
  assert.equal(compactNumber(999_999), "999K");
  assert.equal(compactNumber(1_300_000), "1.3M");
  assert.equal(compactNumber(2_000_000), "2M");
  assert.equal(compactNumber(-1500), "-1.5K");
  assert.equal(compactNumber(Number.NaN), "0");
  assert.equal(compactCount(1200), "1.2K");
});
test("plural handles one and many", () => {
  assert.equal(plural(1, "member"), "1 member");
  assert.equal(plural(3, "member"), "3 members");
});

test("parseLocalDateTime accepts real dates only", () => {
  const parsed = parseLocalDateTime("2026-10-31 19:30");
  assert.ok(parsed && !Number.isNaN(Date.parse(parsed)));
  assert.equal(new Date(parsed!).getHours(), 19);
  assert.equal(parseLocalDateTime("2026-02-31 10:00"), null);
  assert.equal(parseLocalDateTime("31/10/2026"), null);
  assert.equal(parseLocalDateTime("2026-10-31 25:00"), null);
});

test("plainPreview removes markdown marks but keeps the words", () => {
  assert.equal(plainPreview("## Say hello!\nMeet **everyone** and read [the rules](https://x.test)\n- be kind"), "Say hello! Meet everyone and read the rules be kind");
});
