/** Quiz pictures are stored after the album pictures: question 1 is position 100, question 2 is 101 ... */
export const QUIZ_IMAGE_BASE = 100;

/** "1:05" for 65 seconds (rounded up, never below 0:00). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Time left in a timed quiz, for display. `usedAtJoinMs` is how much of the time the server had already counted
 * when this phone got the answer, `sinceJoinMs` how long this phone has been counting since. The server's own clock
 * decides the result; this only feeds the countdown.
 */
export function remainingMs(limitSec: number, usedAtJoinMs: number, sinceJoinMs: number): number {
  return limitSec * 1000 - usedAtJoinMs - sinceJoinMs;
}

/** Milliseconds between two ISO timestamps from the server (never negative, 0 when unreadable). */
export function usedSoFarMs(startedAt: string, serverNow: string): number {
  const used = new Date(serverNow).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(used) ? Math.max(0, used) : 0;
}
