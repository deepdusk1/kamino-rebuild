/**
 * Small pure helpers for the Notifications and Profile screens. No React here, so they are easy to test
 * (see `helpers.test.ts`).
 */
import type { NotificationKind } from "@/components/k";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// ── Notifications ───────────────────────────────────────────────────────────

/** Which small badge a notification row gets (heart, comment bubble, follow, @, community, live, event). */
export function notificationKind(item: { kind: string; live?: boolean; category?: string }): NotificationKind {
  switch (item.kind) {
    case "like":
    case "tip":
      return "like";
    case "comment":
    case "reply":
    case "wall":
    case "chat":
      return "comment";
    case "follow":
    case "follow_request":
    case "follow_accept":
      return "follow";
    case "mention":
      return "mention";
    case "live":
    case "call":
      return "live";
    case "event":
      return "event";
    default:
      return item.category === "community" ? "community" : "other";
  }
}

/** "Today", "Yesterday" or "Earlier", by the phone's own calendar day. */
export function dayGroup(iso: string, now = new Date()): "Today" | "Yesterday" | "Earlier" {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Earlier";
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at.getTime() >= start) return "Today";
  if (at.getTime() >= start - 24 * 60 * 60 * 1000) return "Yesterday";
  return "Earlier";
}

/** Splits a newest-first list into Today / Yesterday / Earlier sections (empty ones are left out). */
export function groupByDay<T extends { createdAt: string }>(items: readonly T[], now = new Date()): { title: string; data: T[] }[] {
  const order = ["Today", "Yesterday", "Earlier"] as const;
  const groups = new Map<string, T[]>(order.map((k) => [k, []]));
  for (const item of items) groups.get(dayGroup(item.createdAt, now))!.push(item);
  return order.map((title) => ({ title, data: groups.get(title)! })).filter((g) => g.data.length > 0);
}

/**
 * Turns the server's website-style link into a phone screen. Covers the pages `appHrefFromServerHref` does not
 * (community events, a community's rooms) and hands everything else to it.
 */
export function notificationRoute(href: string, fallback: (href: string) => string): string {
  const events = /^\/c\/([^/?#]+)\/events/.exec(href);
  if (events) return `/community/${events[1]}/events`;
  const wiki = /^\/c\/([^/?#]+)\/wiki/.exec(href);
  if (wiki) return `/community/${wiki[1]}/wiki`;
  return fallback(href);
}

/** "Starts today at 8:00 PM" / "Starts tomorrow at 9:30 AM" / "Starts Oct 12 at 6:00 PM" / "Started 2h ago". */
export function eventWhen(startsAt: string, now = new Date()): string {
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return "";
  const time = `${((at.getHours() + 11) % 12) + 1}:${String(at.getMinutes()).padStart(2, "0")} ${at.getHours() < 12 ? "AM" : "PM"}`;
  if (at.getTime() < now.getTime()) return "Happening now";
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = Math.floor((at.getTime() - startToday) / (24 * 60 * 60 * 1000));
  if (day === 0) return `Starts today at ${time}`;
  if (day === 1) return `Starts tomorrow at ${time}`;
  return `Starts ${MONTHS[at.getMonth()]} ${at.getDate()} at ${time}`;
}

// ── Profile ─────────────────────────────────────────────────────────────────

/** "she/her" → "She/Her". */
export function pronounsLabel(pronouns: string): string {
  return pronouns
    .trim()
    .split("/")
    .map((part) => part.trim().replace(/^\p{L}/u, (c) => c.toUpperCase()))
    .join("/");
}

/** "https://www.linktr.ee/luna/" → "linktr.ee/luna" (what the profile shows). */
export function websiteLabel(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}

/**
 * What a person typed as their website → a link the server accepts: "" stays "", "linktr.ee/x" gets "https://",
 * anything that still is not a web address returns null (show an error).
 */
export function normalizeWebsite(text: string): string | null {
  const t = text.trim();
  if (!t) return "";
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  if (/\s/.test(withScheme)) return null;
  if (!/^https?:\/\/[^/.]+\.[^/]+/i.test(withScheme) && !/^https?:\/\/[^/]+\.[a-z]{2,}$/i.test(withScheme)) return null;
  return withScheme;
}

/** "Joined Mar 2022". */
export function joinedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The little icon in the corner of a post picture on the profile ("Recent Posts"). */
export function postKindIcon(type: string): "image-outline" | "videocam-outline" | "book-outline" | "stats-chart-outline" | "help-circle-outline" | "link-outline" | "chatbubble-ellipses-outline" | "document-text-outline" {
  switch (type) {
    case "image":
      return "image-outline";
    case "video":
      return "videocam-outline";
    case "story":
      return "book-outline";
    case "poll":
      return "stats-chart-outline";
    case "quiz":
      return "help-circle-outline";
    case "link":
      return "link-outline";
    case "question":
      return "chatbubble-ellipses-outline";
    default:
      return "document-text-outline";
  }
}

/** Adds or removes a key, never going over `max` (adding when full does nothing). */
export function toggleLimited(list: readonly string[], key: string, max: number): string[] {
  if (list.includes(key)) return list.filter((k) => k !== key);
  if (list.length >= max) return [...list];
  return [...list, key];
}

/** 0–23 → "12 AM", "9 AM", "12 PM", "10 PM". */
export function hourLabel(hour: number): string {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  return `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
}

/** The main button on someone else's profile. */
export function followButtonLabel(state: { following: boolean; requested: boolean; privateAccount: boolean; followsYou?: boolean }): string {
  if (state.following) return "Following";
  if (state.requested) return "Requested";
  if (state.followsYou) return "Follow Back";
  return state.privateAccount ? "Request" : "Follow";
}

/**
 * Chat messages make one notification each; in the list, several from the same chat would crowd everything else
 * out. This keeps only the newest one per chat and counts how many there were (`count`). Other rows are untouched.
 */
export function collapseChats<T extends { category: string; room: { id: number } | null }>(items: readonly T[]): (T & { count: number })[] {
  const seen = new Map<number, T & { count: number }>();
  const out: (T & { count: number })[] = [];
  for (const item of items) {
    if (item.category === "messages" && item.room) {
      const first = seen.get(item.room.id);
      if (first) {
        first.count += 1;
        continue;
      }
      const row = { ...item, count: 1 };
      seen.set(item.room.id, row);
      out.push(row);
      continue;
    }
    out.push({ ...item, count: 1 });
  }
  return out;
}
