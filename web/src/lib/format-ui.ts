/**
 * Small display helpers shared by the redesigned screens.
 * Plain functions (no React) so they are easy to test and reuse anywhere.
 */

/**
 * Short number for counts: 999 → "999", 1,234 → "1.2K", 245,000 → "245K", 1,300,000 → "1.3M".
 * One decimal below 10 of a unit (1.2K, 9.9M), none above (12K, 245K). Rounds down, so a
 * count never looks bigger than it is (999,999 → "999K", never "1000K").
 */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(Math.trunc(value));
  if (n < 1000) return `${sign}${n}`;
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (n < size) continue;
    const scaled = n / size;
    // One decimal for small values (1.2K); whole numbers from 10 up (12K, 245K).
    const rounded = scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled);
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${sign}${text}${suffix}`;
  }
  return `${sign}${n}`;
}

/**
 * Friendly age of a time: "now", "2m ago", "3h ago", "1d ago", "3w ago", then a short date
 * ("Mar 4" this year, "Mar 4, 2024" otherwise). Pass `short: true` for lists that want "2m".
 * `now` is a parameter so tests (and server renders) can pin the clock.
 */
export function timeAgo(
  input: string | number | Date,
  { now = Date.now(), short = false }: { now?: number; short?: boolean } = {},
): string {
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (Number.isNaN(t)) return "";
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  const tail = short ? "" : " ago";
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m${tail}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${tail}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d${tail}`;
  if (days < 28) return `${Math.floor(days / 7)}w${tail}`;
  const date = new Date(t);
  const sameYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "Joined Mar 2022" style month + year. */
export function monthYear(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" });
}
