import assert from "node:assert/strict";
import { test } from "node:test";
import { afterCheckIn, eventWhen, heroHref, weekdayIndex } from "./homeData.ts";

test("weekdayIndex counts Monday as 0 and Sunday as 6 (UTC)", () => {
  assert.equal(weekdayIndex(new Date("2026-09-28T12:00:00Z")), 0); // Monday
  assert.equal(weekdayIndex(new Date("2026-10-04T12:00:00Z")), 6); // Sunday
});

test("afterCheckIn ticks today and adds a day", () => {
  const now = new Date("2026-10-02T12:00:00Z"); // Friday
  const next = afterCheckIn({ days: 4, week: [true, true, true, true, false, false, false], checkedInToday: false, best: 3 }, now);
  assert.equal(next.days, 5);
  assert.equal(next.best, 5);
  assert.equal(next.checkedInToday, true);
  assert.deepEqual(next.week, [true, true, true, true, true, false, false]);
});

test("afterCheckIn leaves an already checked-in streak alone", () => {
  const streak = { days: 2, week: [false, false, false, false, true, false, false], checkedInToday: true, best: 9 };
  assert.equal(afterCheckIn(streak), streak);
});

test("eventWhen says today / tomorrow, otherwise a short date", () => {
  const now = new Date(2026, 9, 2, 10, 0);
  assert.equal(eventWhen(new Date(2026, 9, 2, 20, 0).toISOString(), now), "Today at 8:00 PM");
  assert.equal(eventWhen(new Date(2026, 9, 3, 18, 30).toISOString(), now), "Tomorrow at 6:30 PM");
  assert.match(eventWhen(new Date(2026, 9, 10, 19, 0).toISOString(), now), /^Sat, Oct 10 at 7:00 PM$/);
  assert.equal(eventWhen("nope", now), "");
});

test("heroHref maps website links to phone screens", () => {
  assert.equal(heroHref("/explore"), "/explore");
  assert.equal(heroHref("/me"), "/me");
  assert.equal(heroHref("/chats"), "/chats");
  assert.equal(heroHref("/c/anime-haven"), "/community/anime-haven");
  assert.equal(heroHref("/u/lunasketch"), "/profile/lunasketch");
  assert.equal(heroHref("/somewhere"), "/explore");
});
