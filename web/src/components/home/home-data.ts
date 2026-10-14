/**
 * Small pure helpers for the Home and onboarding pages (no React, so they can be unit-tested with
 * Node). Same rules as the phone app's `src/components/home/homeData.ts`.
 */

import type { AvatarPerson } from "@/components/k/media";
import type { AuthorChip } from "@/lib/kamino/types";

/** A member chip from the server as an avatar the kit can draw. */
export function personFromChip(c: AuthorChip): AvatarPerson {
  return { name: c.nickname || c.handle, hue: c.hue, userId: c.userId, avatarV: c.avatarV };
}

/** Shape of the home streak (same as `StreakInfo` from the server). */
export type Streak = { days: number; week: boolean[]; checkedInToday: boolean; best: number };

/** Monday = 0 … Sunday = 6, in UTC days like the server's `streak.week`. */
export function weekdayIndex(date = new Date()): number {
  return (date.getUTCDay() + 6) % 7;
}

/** What the streak looks like right after checking in today (shown at once, before the server answers). */
export function afterCheckIn(streak: Streak, now = new Date()): Streak {
  if (streak.checkedInToday) return streak;
  const week = Array.from({ length: 7 }, (_, i) => !!streak.week[i]);
  week[weekdayIndex(now)] = true;
  const days = streak.days + 1;
  return { days, week, checkedInToday: true, best: Math.max(streak.best, days) };
}

/**
 * "Today at 8:00 PM", "Tomorrow at 6:30 PM", "Sat, Oct 4 at 7:00 PM" in the viewer's own time zone.
 * Only call it in the browser (after the page has loaded): the server does not know the time zone.
 */
export function eventWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOf(date) - startOf(now)) / 86_400_000);
  if (dayDiff === 0) return `Today at ${time}`;
  if (dayDiff === 1) return `Tomorrow at ${time}`;
  if (dayDiff === -1) return `Yesterday at ${time}`;
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day} at ${time}`;
}

/** Puts a post into every loaded feed page (likes and saves change it in place). */
export function patchPages<P extends { id: number }>(
  pages: { posts: P[]; next: string | null }[],
  id: number,
  change: (post: P) => P,
): { posts: P[]; next: string | null }[] {
  return pages.map((page) => ({ ...page, posts: page.posts.map((p) => (p.id === id ? change(p) : p)) }));
}

/** Keeps the first copy of each post (a post can show up on two pages if new ones arrive while scrolling). */
export function uniqueById<P extends { id: number }>(posts: P[]): P[] {
  const seen = new Set<number>();
  return posts.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

// People who have not finished onboarding are sent there once per browser. Remember that here.
const shownKey = (userId: string) => `kamino:onboarding-shown:${userId}`;

export function markOnboardingShown(userId: string): void {
  try {
    window.localStorage.setItem(shownKey(userId), "1");
  } catch {
    /* private mode or storage blocked: they may see onboarding again, which is fine */
  }
}

export function wasOnboardingShown(userId: string): boolean {
  try {
    return window.localStorage.getItem(shownKey(userId)) === "1";
  } catch {
    return false;
  }
}
