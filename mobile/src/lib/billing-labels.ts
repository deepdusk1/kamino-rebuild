/**
 * Plain-language billing labels for the purchases screen. Pure, so it is unit tested.
 * Kept in step with web/src/lib/kamino/billing-labels.ts.
 */

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

/**
 * Purchases are made on the Kamino website, never inside the app: app stores require their own
 * billing for digital goods. The phone only says where to go, without a link to a payment page.
 */
export function phonePurchaseNote(mode: "disabled" | "test" | "live" | undefined): string {
  if (mode === "live") return "Purchases and subscriptions are made on the Kamino website. Anything you buy there shows up here.";
  if (mode === "test") return "Purchases are in test mode on the Kamino website. No real money moves.";
  return "Purchases are unavailable for now.";
}

/** What to say about managing a subscription on the phone. */
export function manageSubscriptionNote(renews: boolean | null): string | null {
  if (renews === true) return "To cancel, sign in on the Kamino website and open Purchases & subscriptions. You keep access until the end of the month you paid for.";
  if (renews === false) return "Cancelled. You keep access until the date shown, then it won't renew.";
  return null;
}

/** Receipts only ever open on Stripe's own receipt pages. */
export function isStripeReceipt(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["pay.stripe.com", "invoice.stripe.com"].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
