import { createHmac, timingSafeEqual } from "node:crypto";

// Pin the API shape; newer webhook versions are safe because events trigger a fresh API read.
export const STRIPE_API_VERSION = "2025-02-24.acacia";
export const CHECKOUT_KINDS = [
  "membership",
  "premium",
  "tip",
  "gift",
  "ticket",
  "marketplace",
] as const;
export type BillingConfig = {
  enabled: boolean;
  mode: "disabled" | "test" | "live";
  origin: string;
  secretKey: string;
  webhookSecret: string;
  reason: string;
};
export type StripeObject = Record<string, unknown>;
export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: StripeObject };
};
export type BillingOrderSnapshot = {
  id: string;
  buyerId: string;
  beneficiaryId: string;
  priceMinor: number;
  currency: string;
  mode: "payment" | "subscription";
};

export function billingConfig(env: Record<string, string | undefined>): BillingConfig {
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "",
    webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  let origin = "";
  try {
    const url = new URL(env.KAMINO_BILLING_ORIGIN ?? "");
    if (
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    )
      origin = url.origin;
  } catch {
    /* An absent origin keeps billing disabled. */
  }
  // Live mode requires the explicit opt-in flag on top of a live key: a pasted sk_live_ key alone
  // must never switch the whole platform to real money.
  const live =
    env.KAMINO_PAYMENTS_ENABLED === "true" &&
    env.KAMINO_BILLING_MODE === "live" &&
    /^sk_live_[A-Za-z0-9]{16,}$/.test(secretKey) &&
    /^whsec_[A-Za-z0-9]{16,}$/.test(webhookSecret) &&
    Boolean(origin);
  const test =
    env.KAMINO_PAYMENTS_ENABLED === "true" &&
    /^sk_test_[A-Za-z0-9]{16,}$/.test(secretKey) &&
    /^whsec_[A-Za-z0-9]{16,}$/.test(webhookSecret) &&
    Boolean(origin);
  const enabled = test || live;
  return {
    enabled,
    mode: enabled ? (live ? "live" : "test") : "disabled",
    origin,
    secretKey,
    webhookSecret,
    reason: enabled
      ? live
        ? "Live Stripe mode: real money. Creator payouts are enabled."
        : "Stripe test mode only. No real money or creator payouts."
      : "Payments are disabled until the Stripe checkout and signed webhook are configured. No charge was made.",
  };
}

export function verifyStripeEvent(
  rawBody: string,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  live = false,
): StripeEvent {
  if (
    Buffer.byteLength(rawBody) > 1024 * 1024 ||
    signature.length > 2048 ||
    !secret.startsWith("whsec_")
  )
    throw new Error("Invalid webhook.");
  const parts = signature.split(",").map((part) => part.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "t").map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0] ?? ""))
    throw new Error("Invalid webhook signature.");
  const timestamp = Number(timestamps[0]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300)
    throw new Error("Webhook signature expired.");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const valid = parts
    .filter(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/.test(value ?? ""))
    .some(([, value]) => timingSafeEqual(expected, Buffer.from(value!, "hex")));
  if (!valid) throw new Error("Invalid webhook signature.");
  const event = JSON.parse(rawBody) as Partial<StripeEvent>;
  if (
    !/^evt_[A-Za-z0-9]+$/.test(event.id ?? "") ||
    !/^[a-z_]+(?:\.[a-z_]+)+$/.test(event.type ?? "") ||
    !Number.isSafeInteger(event.created) ||
    event.livemode !== live ||
    !event.data?.object ||
    typeof event.data.object !== "object" ||
    Array.isArray(event.data.object)
  )
    throw new Error(live ? "Invalid live payment event." : "Invalid test-mode payment event.");
  return event as StripeEvent;
}

export function object(value: unknown): StripeObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as StripeObject) : {};
}
export function stripeId(value: unknown, prefix: string): string {
  const id = typeof value === "string" ? value : object(value).id;
  if (typeof id !== "string" || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(id))
    throw new Error("Invalid Stripe identifier.");
  return id;
}

function assertMetadata(remote: StripeObject, order: BillingOrderSnapshot, live = false) {
  const metadata = object(remote.metadata);
  if (
    remote.livemode !== live ||
    metadata.kamino_order_id !== order.id ||
    metadata.kamino_buyer_id !== order.buyerId ||
    metadata.kamino_beneficiary_id !== order.beneficiaryId
  )
    throw new Error("Payment does not match this order.");
}

export function assertCheckoutMatches(
  remote: StripeObject,
  order: BillingOrderSnapshot,
  live = false,
): void {
  assertMetadata(remote, order, live);
  if (
    remote.client_reference_id !== order.id ||
    remote.mode !== order.mode ||
    remote.amount_total !== order.priceMinor ||
    remote.currency !== order.currency
  )
    throw new Error("Checkout does not match this order.");
}

export function assertPaidCheckout(
  remote: StripeObject,
  order: BillingOrderSnapshot,
  live = false,
): void {
  assertCheckoutMatches(remote, order, live);
  if (remote.payment_status !== "paid" || remote.status !== "complete")
    throw new Error("Checkout has not been fully paid for this order.");
}

export function assertPaymentIntentMatches(
  remote: StripeObject,
  order: BillingOrderSnapshot,
  live = false,
): void {
  assertMetadata(remote, order, live);
  if (remote.amount !== order.priceMinor || remote.currency !== order.currency)
    throw new Error("Payment does not match this order's amount.");
}

export function subscriptionAccessUntil(
  subscription: StripeObject,
  invoice: StripeObject,
  order: BillingOrderSnapshot,
  nowSeconds = Math.floor(Date.now() / 1000),
  live = false,
): string | null {
  assertMetadata(subscription, order, live);
  if (
    order.mode !== "subscription" ||
    subscription.status !== "active" ||
    subscription.pause_collection
  )
    return null;
  const items = object(subscription.items).data;
  if (!Array.isArray(items) || items.length !== 1)
    throw new Error("Subscription items do not match this order.");
  const item = object(items[0]),
    price = object(item.price),
    recurring = object(price.recurring);
  if (
    item.quantity !== 1 ||
    price.unit_amount !== order.priceMinor ||
    price.currency !== order.currency ||
    recurring.interval !== "month" ||
    recurring.interval_count !== 1
  )
    throw new Error("Subscription price does not match this order.");
  if (
    invoice.livemode !== live ||
    invoice.id !== stripeId(subscription.latest_invoice, "in") ||
    invoice.status !== "paid" ||
    invoice.paid !== true ||
    invoice.paid_out_of_band === true ||
    invoice.currency !== order.currency ||
    invoice.amount_paid !== order.priceMinor
  )
    return null;
  if (
    stripeId(invoice.subscription, "sub") !== stripeId(subscription, "sub") ||
    stripeId(invoice.customer, "cus") !== stripeId(subscription.customer, "cus")
  )
    throw new Error("Invoice does not match this subscription.");
  const end = Number(item.current_period_end ?? subscription.current_period_end);
  return Number.isSafeInteger(end) && end > nowSeconds ? new Date(end * 1000).toISOString() : null;
}

export function trustedStripeRedirect(value: unknown): string {
  if (typeof value !== "string") throw new Error("Checkout is unavailable.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("Checkout is unavailable.");
  return url.href;
}
