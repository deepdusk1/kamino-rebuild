/**
 * How long ago something happened, the way lists and posts show it: "just now", "2m ago", "3h ago", "1d ago",
 * or a short date ("Mar 4") for anything older than a week. Pass `{ short: true }` to drop the " ago"
 * (chat lists: "2m", "1h").
 */
export function timeAgo(iso: string | null | undefined, now = Date.now(), options: { short?: boolean } = {}): string {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const ago = options.short ? "" : " ago";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m${ago}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h${ago}`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d${ago}`;
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The short form of `timeAgo` for chat lists: "2m", "1h", "3d". */
export function shortTimeAgo(iso: string | null | undefined, now = Date.now()): string {
  return timeAgo(iso, now, { short: true });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Short numbers for counts: 999 → "999", 1,234 → "1.2K", 12,400 → "12.4K", 245,000 → "245K", 1,300,000 → "1.3M".
 * One decimal below 100K / 100M, none above; a trailing ".0" is dropped.
 */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(Math.round(n));
  const fmt = (x: number, unit: string) => {
    const text = x >= 100 ? String(Math.floor(x)) : (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return `${sign}${text}${unit}`;
  };
  if (v < 1000) return `${sign}${v}`;
  if (v < 1_000_000) return fmt(v / 1000, "K");
  if (v < 1_000_000_000) return fmt(v / 1_000_000, "M");
  return fmt(v / 1_000_000_000, "B");
}

/** Old name for `compactNumber` (same output). */
export const compactCount = compactNumber;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "2026-10-31 19:30" (local time) → an ISO timestamp the server understands, or null when the
 * text isn't a real date. A 24-hour clock is used so there is no AM/PM to get wrong.
 */
export function parseLocalDateTime(text: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute);
  // Reject things like 2026-02-31, which JavaScript would quietly roll into March.
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute;
  return real ? date.toISOString() : null;
}

/** Turns markdown into a short plain-text preview for list cards: no **, #, > or list dashes. */
export function plainPreview(markdown: string): string {
  return markdown
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
