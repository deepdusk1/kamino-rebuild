import assert from "node:assert/strict";
import { test } from "node:test";
import { ageOn, checkBirthDate } from "./age.ts";

const today = new Date(Date.UTC(2026, 8, 29)); // 29 September 2026

test("counts whole years and respects the birthday", () => {
  assert.equal(ageOn(2013, 9, 29, today), 13); // birthday is today
  assert.equal(ageOn(2013, 9, 30, today), 12); // birthday is tomorrow
  assert.equal(ageOn(2013, 10, 1, today), 12);
  assert.equal(ageOn(2000, 1, 1, today), 26);
});

test("accepts real dates and reports the age", () => {
  assert.deepEqual(checkBirthDate(1990, 2, 28, today), { ok: true, age: 36 });
  assert.deepEqual(checkBirthDate(2008, 9, 29, today), { ok: true, age: 18 });
});

test("rejects impossible or future dates", () => {
  for (const [y, m, d] of [[2010, 2, 30], [2011, 13, 1], [2011, 0, 5], [2027, 1, 1], [1800, 1, 1], [2010, 4, 31], [Number.NaN, 1, 1]] as const) {
    assert.deepEqual(checkBirthDate(y, m, d, today), { ok: false, reason: "invalid" }, `${y}-${m}-${d}`);
  }
});

test("leap day exists only in leap years", () => {
  assert.equal(checkBirthDate(2004, 2, 29, today).ok, true);
  assert.equal(checkBirthDate(2005, 2, 29, today).ok, false);
});
