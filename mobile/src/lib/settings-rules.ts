/**
 * Small rules behind the Settings screen (no React or network code, so they are unit tested in
 * settings-rules.test.ts).
 */

/** The phone's own time zone, such as "America/Vancouver" ("" when the phone can't tell). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/**
 * Quiet hours are checked on the server in the time zone saved on your profile. The app never sent one, so they ran
 * in UTC: 10 pm to 7 am in Kelowna became 3 pm to midnight. This returns the zone to save, or null when the saved one
 * is already right (or the phone can't tell).
 */
export function timeZoneToSave(saved: string | null | undefined, device: string): string | null {
  if (!device) return null;
  return (saved ?? "") === device ? null : device;
}

/** How long quiet hours last, in hours (they may run past midnight). 0 when they start and end together. */
export function quietLength(start: number, end: number): number {
  return (((end - start) % 24) + 24) % 24;
}

export type ColorSchemeChoice = "system" | "light" | "dark";

/** Reads a stored appearance choice; anything unknown means "follow the phone". */
export function parseColorScheme(value: string | null | undefined): ColorSchemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

/** A safe file name for a data export made on a given day: kamino-data-2026-10-15.json. */
export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `kamino-data-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** Friendly words for privacy choices that the server stores as codes. */
export const AUDIENCE_LABEL: Record<string, string> = { everyone: "Everyone", following: "People I follow", none: "No one" };
export const SENSITIVE_LABEL: Record<string, string> = { blur: "Blur it", hide: "Hide it", show: "Show it" };
export const TEXT_SIZE_LABEL: Record<string, string> = { standard: "Standard", large: "Large", largest: "Largest" };
export const LANGUAGE_LABEL: Record<string, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  pt: "Português",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  hi: "हिन्दी",
  ar: "العربية",
};
export const PEOPLE_KIND_LABEL: Record<string, string> = { favorite: "Favourite", close_friend: "Close friend", restrict: "Restricted", mute: "Muted" };

/** Checks a new password before it is sent (the server checks again). Returns a message, or null when it's fine. */
export function newPasswordProblem(current: string, next: string, repeat: string): string | null {
  if (!current) return "Enter your current password.";
  if (next.length < 8) return "Use at least 8 characters for the new password.";
  if (next.length > 128) return "That password is too long.";
  if (next === current) return "Choose a password different from the current one.";
  if (next !== repeat) return "The two new passwords don't match.";
  return null;
}
