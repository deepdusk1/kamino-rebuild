/**
 * Age check used at sign-up. Kamino is an adults-only platform: 18 and over.
 * The date of birth is only ever compared with today's date; it is never saved anywhere.
 */

export const MINIMUM_AGE = 18;
/** At this age the person is also marked as old enough for age-gated (16+/18+) communities. */
export const ADULT_AGE = 18;

export type BirthDateResult =
  | { ok: true; age: number }
  | { ok: false; reason: "invalid" };

/** Whole years between a birth date and `today` (both as year, month 1-12, day). */
export function ageOn(year: number, month: number, day: number, today: Date = new Date()): number {
  let age = today.getUTCFullYear() - year;
  const beforeBirthday = today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Validates a date typed as three numbers (a real calendar date, not in the future, after 1900). */
export function checkBirthDate(year: number, month: number, day: number, today: Date = new Date()): BirthDateResult {
  if (![year, month, day].every(Number.isInteger)) return { ok: false, reason: "invalid" };
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return { ok: false, reason: "invalid" };
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return { ok: false, reason: "invalid" };
  if (real.getTime() > today.getTime()) return { ok: false, reason: "invalid" };
  return { ok: true, age: ageOn(year, month, day, today) };
}
