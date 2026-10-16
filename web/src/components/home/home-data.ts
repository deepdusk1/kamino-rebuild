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

/** One "Jump back in" card on Home. */
export type HubShortcut = {
  key: string;
  /** Small label above the title: "Chat", "Upcoming", "Visited", "Live · 3 listening". */
  kind: string;
  title: string;
  icon: "live" | "chat" | "event" | "community";
  tone: "violet" | "blue" | "pink" | "green";
  href: string;
  live: boolean;
  /** For direct chats: the other person, so the card shows their face. */
  person: AvatarPerson | null;
  /** ISO time of the latest activity, when known (chats and events). */
  at: string | null;
};

type HubRow = Record<string, unknown>;
const PER_KIND = 3;

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const t = new Date(value as string).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Turns the discovery hub into "Jump back in" cards: live rooms first, then your chats, upcoming
 * events and communities you visited. At most three of each, rows without an id are skipped, and a
 * live room that is also one of your chats shows once. Same rules as the phone app's JumpBackIn.
 */
export function hubShortcuts(
  hub: { live?: HubRow[]; chats?: HubRow[]; events?: HubRow[]; visits?: HubRow[] } | undefined,
): HubShortcut[] {
  if (!hub) return [];
  const list: HubShortcut[] = [];
  const seen = new Set<string>();
  const add = (rows: HubRow[] | undefined, prefix: string, make: (r: HubRow) => Omit<HubShortcut, "key"> | null) => {
    for (const r of (rows ?? []).slice(0, PER_KIND)) {
      if (r.id === null || r.id === undefined || r.id === "") continue;
      const item = make(r);
      if (!item || seen.has(item.href)) continue;
      seen.add(item.href);
      list.push({ key: `${prefix}-${String(r.id)}`, ...item });
    }
  };
  add(hub.live, "live", (r) => {
    const listeners = Number(r.listeners) || 0;
    return {
      kind: listeners > 0 ? `Live · ${listeners} listening` : "Live now",
      title: String(r.name || "Live room"),
      icon: "live",
      tone: "pink",
      href: `/chats/${String(r.id)}`,
      live: true,
      person: null,
      at: null,
    };
  });
  add(hub.chats, "chat", (r) => {
    const dm = r.is_dm === true && typeof r.peer_user_id === "string";
    const title = String(r.name || "Chat");
    return {
      kind: dm ? "Message" : "Chat",
      title,
      icon: "chat",
      tone: "violet",
      href: `/chats/${String(r.id)}`,
      live: false,
      person: dm
        ? { name: title, hue: Number(r.peer_hue) || 262, userId: String(r.peer_user_id), avatarV: Number(r.peer_avatar_v) || 0 }
        : null,
      at: isoOrNull(r.latest),
    };
  });
  add(hub.events, "event", (r) =>
    r.community_id
      ? {
          kind: "Upcoming",
          title: String(r.title || "Event"),
          icon: "event",
          tone: "blue",
          href: `/c/${String(r.community_id)}/events`,
          live: false,
          person: null,
          at: isoOrNull(r.starts_at),
        }
      : null,
  );
  add(hub.visits, "visit", (r) => ({
    kind: "Visited",
    title: String(r.name || "Community"),
    icon: "community",
    tone: "green",
    href: `/c/${String(r.id)}`,
    live: false,
    person: null,
    at: null,
  }));
  return list;
}
