/** Plain-language billing labels shared by the purchases screens. Pure: safe in the browser and in tests. */

const STATUS: Record<string, string> = {
  pending: "Waiting for payment",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
  disputed: "Disputed",
  cancelled: "Cancelled",
  expired: "Checkout expired",
};

export function orderStatusLabel(status: string): string {
  return STATUS[status] ?? "Processing";
}

export function formatPrice(priceMinor: number, currency: string): string {
  const amount = priceMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function day(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** One line describing what a purchase gives right now: renewing, ending, or already over. */
export function accessLabel(access: { active: boolean; expiresAt: string | null; renews: boolean | null }): string {
  if (!access.active) return "Ended";
  if (!access.expiresAt) return "Active";
  if (access.renews === true) return `Active · renews ${day(access.expiresAt)}`;
  if (access.renews === false) return `Active · ends ${day(access.expiresAt)}`;
  return `Active until ${day(access.expiresAt)}`;
}

export function checkoutButtonLabel(kind: string, mode: "disabled" | "test" | "live"): string {
  if (mode === "disabled") return "Payments unavailable";
  const verb = kind === "membership" || kind === "premium" ? "Subscribe" : kind === "tip" ? "Send tip" : "Buy";
  return mode === "test" ? `${verb} (test checkout)` : verb;
}
