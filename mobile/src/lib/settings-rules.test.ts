import assert from "node:assert/strict";
import { test } from "node:test";
import { exportFileName, newPasswordProblem, parseColorScheme, quietLength, timeZoneToSave } from "./settings-rules.ts";

test("the phone's time zone is saved when the profile's is missing or different", () => {
  assert.equal(timeZoneToSave("", "America/Vancouver"), "America/Vancouver", "older accounts have none, so quiet hours ran in UTC");
  assert.equal(timeZoneToSave("UTC", "America/Vancouver"), "America/Vancouver");
  assert.equal(timeZoneToSave("America/Vancouver", "America/Vancouver"), null);
  assert.equal(timeZoneToSave("UTC", ""), null, "a phone that can't tell leaves it alone");
});

test("quiet-hour lengths", () => {
  assert.equal(quietLength(22, 7), 9, "past midnight");
  assert.equal(quietLength(1, 6), 5);
  assert.equal(quietLength(8, 8), 0);
});

test("appearance choice", () => {
  assert.equal(parseColorScheme("dark"), "dark");
  assert.equal(parseColorScheme("light"), "light");
  assert.equal(parseColorScheme(null), "system");
  assert.equal(parseColorScheme("purple"), "system");
});

test("export file names", () => {
  assert.equal(exportFileName(new Date(2026, 9, 5)), "kamino-data-2026-10-05.json");
});

test("new password checks", () => {
  assert.match(newPasswordProblem("", "longenough", "longenough")!, /current/);
  assert.match(newPasswordProblem("old-pass-1", "short", "short")!, /8 characters/);
  assert.match(newPasswordProblem("same-pass-1", "same-pass-1", "same-pass-1")!, /different/);
  assert.match(newPasswordProblem("old-pass-1", "new-pass-12", "new-pass-13")!, /match/);
  assert.equal(newPasswordProblem("old-pass-1", "new-pass-12", "new-pass-12"), null);
});
