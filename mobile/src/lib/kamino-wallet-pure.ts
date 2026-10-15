/** Pure helpers for KAMINO tipping (no React Native imports, so they can be unit-tested). */

/** Short form of an address for display: "4Jpd…V2VMH". */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-5)}` : address;
}

/**
 * Asks `check` every few seconds until `done` says so, the time runs out, or `signal` is aborted. While the person
 * is in their wallet app this pauses (the phone suspends Kamino) and picks up again when they come back.
 */
export async function pollUntil<T>(
  check: () => Promise<T>,
  done: (value: T) => boolean,
  options: { everyMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T | null> {
  const every = options.everyMs ?? 3000;
  const until = Date.now() + (options.timeoutMs ?? 3 * 60_000);
  while (Date.now() < until) {
    if (options.signal?.aborted) return null;
    try {
      const value = await check();
      if (done(value)) return value;
    } catch {
      // A failed check (no signal for a moment) just means "try again".
    }
    await new Promise((resolve) => setTimeout(resolve, every));
  }
  return null;
}

/** Amounts people can type: digits with at most 6 decimals (KAMINO has 6). */
export function cleanAmountInput(text: string): string {
  const normalised = text.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = normalised.split(".");
  const fraction = rest.join("").slice(0, 6);
  return rest.length ? `${whole.slice(0, 9)}.${fraction}` : whole.slice(0, 9);
}
