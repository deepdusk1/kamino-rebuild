/**
 * Small pure helpers for the Home screen (no React Native imports, so they can be unit-tested with Node).
 */

/** Shape of the home streak (same as `StreakInfo` from the API). */
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

/** "Today at 8:00 PM", "Tomorrow at 6:30 PM", "Sat, Oct 4 at 7:00 PM" (local time). */
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

/**
 * Hero banners link with website addresses ("/explore", "/me", "/c/anime-haven"). Turn them into phone
 * screens; unknown addresses fall back to the Communities tab.
 */
export function heroHref(href: string): string {
  const community = /^\/c\/([^/?#]+)/.exec(href);
  if (community) return `/community/${community[1]}`;
  const profile = /^\/u\/([^/?#]+)/.exec(href);
  if (profile) return `/profile/${profile[1]}`;
  if (href.startsWith("/chats")) return "/chats";
  if (["/", "/explore", "/me", "/create", "/notifications"].includes(href)) return href;
  if (href === "/new") return "/create";
  return "/explore";
}
