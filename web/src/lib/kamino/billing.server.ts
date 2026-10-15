import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { paidResourceAccessSql, type PaidResourceKind } from "./billing-policy.ts";
import {
  STRIPE_API_VERSION,
  assertCheckoutMatches,
  assertPaidCheckout,
  assertPaymentIntentMatches,
  billingConfig,
  chargeOutcome,
  object,
  stripeId,
  subscriptionAccessUntil,
  subscriptionRenews,
  trustedReceiptUrl,
  trustedStripeRedirect,
  type BillingConfig,
  type BillingOrderSnapshot,
  type StripeEvent,
  type StripeObject,
} from "./billing-rules.ts";

type Row = Record<string, unknown>;
export type StripeRequest = (
  path: string,
  method?: "GET" | "POST" | "DELETE",
  data?: URLSearchParams,
  idempotencyKey?: string,
) => Promise<StripeObject>;
export function getBillingConfig(): BillingConfig {
  return billingConfig(process.env);
}
export function requireBillingConfig(): BillingConfig {
  const config = getBillingConfig();
  if (!config.enabled) throw new Error(config.reason);
  return config;
}
export function stripeRequest(config: BillingConfig): StripeRequest {
  return async (path, method = "GET", data, idempotencyKey) => {
    if (!config.enabled) throw new Error("Payments are disabled.");
    const keyIsRight =
      config.mode === "test"
        ? config.secretKey.startsWith("sk_test_")
        : config.mode === "live"
          ? config.secretKey.startsWith("sk_live_")
          : false;
    if (!keyIsRight) throw new Error("Payments are disabled.");
    if (
      !/^\/v1\/(?:checkout\/sessions|subscriptions|invoices|charges|payment_intents|billing_portal\/sessions|accounts|account_links|transfers|balance|identity\/verification_sessions)(?:\/[A-Za-z0-9_]+)?$/.test(
        path,
      )
    )
      throw new Error("Invalid payment operation.");
    const headers: Record<string, string> = {
      authorization: `Bearer ${config.secretKey}`,
      "stripe-version": STRIPE_API_VERSION,
    };
    if (data) headers["content-type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    if (method === "DELETE" && !/^\/v1\/subscriptions\/sub_[A-Za-z0-9]+$/.test(path))
      throw new Error("Invalid payment operation.");
    const response = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers,
      body: data,
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error("The payment provider could not complete this request. Please try again.");
    return object(await response.json());
  };
}

export async function assertPaidResourceAccess(
  sql: Sql,
  userId: string | null,
  kind: PaidResourceKind,
  targetId: string | number,
): Promise<void> {
  const rows = await sql.query<{ allowed: boolean }>(
    `select ${paidResourceAccessSql("$1", kind, "$2")} as allowed`,
    [userId ?? "", String(targetId)],
  );
  if (!rows[0]?.allowed)
    throw new Error(
      "This content requires an active paid offer. Payments may be unavailable while setup is pending.",
    );
}

const snapshot = (row: Row): BillingOrderSnapshot => ({
  id: String(row.id),
  buyerId: String(row.buyer_id),
  beneficiaryId: String(row.beneficiary_id),
  priceMinor: Number(row.price_minor),
  currency: String(row.currency),
  mode: row.checkout_mode === "subscription" ? "subscription" : "payment",
});
const orderById = async (sql: Sql, id: unknown) =>
  typeof id === "string"
    ? (await sql<Row>`select * from billing_orders where id=${id}`)[0]
    : undefined;
const terminal = (row: Row) => row.privacy_closed === true || ["refunded", "disputed", "cancelled"].includes(String(row.status));
type WriteLease = { eventId: string; claim: string; livemode?: boolean };

async function persist(
  sql: Sql,
  row: Row,
  status: string,
  expiresAt: string | null,
  lease: WriteLease,
  ids: {
    customer?: string | null;
    subscription?: string | null;
    paymentIntent?: string | null;
    renews?: boolean | null;
    /** The refunded or disputed charge, so only that charge's creator earnings are reversed. */
    reversedPayment?: string | null;
  } = {},
) {
  const active = status === "paid" && row.kind !== "tip";
  const testMode = lease.livemode !== true;
  const changed = await sql.query(
    `with changed as (
    update billing_orders set status=$2,stripe_customer_id=coalesce($6,stripe_customer_id),stripe_subscription_id=coalesce($7,stripe_subscription_id),
      stripe_payment_intent_id=coalesce($8,stripe_payment_intent_id),renews=case when $2='paid' then coalesce($12::boolean,renews) else false end,updated_at=now(),billing_revision=billing_revision+1 where id=$1 and billing_revision=$9 and privacy_closed=false
      and exists(select 1 from billing_webhook_events where event_id=$10 and claim_token=$11 and status='processing')
      and (status not in ('refunded','disputed','cancelled') or $2 in ('refunded','disputed','cancelled')) returning id,beneficiary_id,offer_id
  ), entitlement as (insert into billing_entitlements(order_id,beneficiary_id,offer_id,state,expires_at,test_mode)
    select id,beneficiary_id,offer_id,$3,$4::timestamptz,$5 from changed
    on conflict(order_id) do update set state=excluded.state,expires_at=excluded.expires_at,updated_at=now() returning order_id) select id from changed`,
    [
      String(row.id),
      status,
      active ? "active" : "revoked",
      expiresAt,
      testMode,
      ids.customer ?? null,
      ids.subscription ?? null,
      ids.paymentIntent ?? null,
      Number(row.billing_revision ?? 0),
      lease.eventId,
      lease.claim,
      ids.renews ?? null,
    ],
  );
  if (status === "paid" && changed.length) {
    // Failures are retried by the worker's reconcile pass (reconcileMissingEarnings), so a paid
    // order can never silently end up owing nothing.
    const { creditCreatorEarnings } = await import("./money.server.ts");
    await creditCreatorEarnings(sql, String(row.id), testMode).catch((error) => {
      console.error("[billing] earnings credit failed; the reconciliation pass will retry:", error);
    });
  }
  if ((status === "refunded" || status === "disputed") && changed.length) {
    const { reverseCreatorEarnings } = await import("./money.server.ts");
    await reverseCreatorEarnings(sql, String(row.id), ids.reversedPayment ?? null).catch((error) => {
      console.error("[billing] earnings reversal failed; the reconciliation pass will retry:", error);
    });
  }
  if (!changed.length) {
    if (
      !(
        await sql`select 1 from billing_webhook_events where event_id=${lease.eventId} and claim_token=${lease.claim} and status='processing'`
      ).length
    )
      throw new Error("The payment event claim changed. Retry processing.");
    const current = await orderById(sql, row.id);
    if (!current || terminal(current)) return;
    throw new Error("This order changed during processing. Retry the payment event.");
  }
}

async function updateSubscription(
  sql: Sql,
  subscription: StripeObject,
  api: StripeRequest,
  lease: WriteLease,
) {
  const orderId = object(subscription.metadata).kamino_order_id;
  const row = await orderById(sql, orderId);
  if (!row || terminal(row)) return;
  const order = snapshot(row),
    subId = stripeId(subscription, "sub");
  if (row.stripe_subscription_id && row.stripe_subscription_id !== subId)
    throw new Error("Subscription does not match the stored order.");
  if (!row.stripe_subscription_id) {
    if (!row.stripe_session_id)
      throw new Error(
        "The subscription checkout has not been linked yet. Retry the payment event.",
      );
    const session = await api(`/v1/checkout/sessions/${String(row.stripe_session_id)}`);
    assertPaidCheckout(session, order, lease.livemode === true);
    if (session.id !== row.stripe_session_id || stripeId(session.subscription, "sub") !== subId)
      throw new Error("Subscription does not match the stored checkout.");
  }
  const invoice = subscription.latest_invoice
    ? await api(`/v1/invoices/${stripeId(subscription.latest_invoice, "in")}`)
    : {};
  const until = subscriptionAccessUntil(subscription, invoice, order, Math.floor(Date.now() / 1000), lease.livemode === true);
  const paymentIntent = invoice.payment_intent ? stripeId(invoice.payment_intent, "pi") : null;
  await persist(
    sql,
    row,
    until ? "paid" : subscription.status === "canceled" ? "cancelled" : "failed",
    until,
    lease,
    {
      customer: subscription.customer ? stripeId(subscription.customer, "cus") : null,
      subscription: subId,
      paymentIntent,
      renews: subscriptionRenews(subscription),
    },
  );
}

/**
 * Stops Stripe billing a subscription whose access was taken away by a full refund or a dispute.
 * Without this the member keeps being charged every month while the refunded order stays closed.
 * Safe to repeat: an already-cancelled subscription is left alone.
 */
async function endSubscription(api: StripeRequest, subId: string) {
  const subscription = await api(`/v1/subscriptions/${subId}`);
  if (["canceled", "incomplete_expired"].includes(String(subscription.status))) return;
  await api(`/v1/subscriptions/${subId}`, "DELETE");
}

async function fulfillCheckout(
  sql: Sql,
  session: StripeObject,
  api: StripeRequest,
  lease: WriteLease,
) {
  const row = await orderById(sql, object(session.metadata).kamino_order_id);
  if (!row || terminal(row)) return;
  if (row.stripe_session_id !== session.id)
    throw new Error("Checkout does not match the stored session.");
  if (session.payment_status !== "paid" || session.status !== "complete") return;
  assertPaidCheckout(session, snapshot(row), lease.livemode === true);
  if (row.checkout_mode === "subscription") {
    await updateSubscription(
      sql,
      await api(`/v1/subscriptions/${stripeId(session.subscription, "sub")}`),
      api,
      lease,
    );
  } else {
    await persist(sql, row, "paid", null, lease, {
      customer: session.customer ? stripeId(session.customer, "cus") : null,
      paymentIntent: stripeId(session.payment_intent, "pi"),
    });
  }
}

async function revokeCharge(sql: Sql, charge: StripeObject, api: StripeRequest, lease: WriteLease) {
  if (typeof charge.livemode === "boolean" && charge.livemode !== (lease.livemode === true))
    throw new Error("The payment event does not match this server's billing mode.");
  let row: Row | undefined,
    invoiceSubscription: string | null = null;
  if (charge.payment_intent)
    row = (
      await sql<Row>`select * from billing_orders where stripe_payment_intent_id=${stripeId(charge.payment_intent, "pi")}`
    )[0];
  if (row?.privacy_closed === true) return;
  if (!row && charge.invoice) {
    const invoice = await api(`/v1/invoices/${stripeId(charge.invoice, "in")}`);
    if (invoice.subscription) {
      const subId = stripeId(invoice.subscription, "sub");
      invoiceSubscription = subId;
      row = (await sql<Row>`select * from billing_orders where stripe_subscription_id=${subId}`)[0];
      if (row?.privacy_closed === true) return;
      if (!row) {
        const subscription = await api(`/v1/subscriptions/${subId}`);
        row = await orderById(sql, object(subscription.metadata).kamino_order_id);
        if (row?.privacy_closed === true) return;
        if (row) {
          if (!row.stripe_session_id)
            throw new Error("The refunded subscription checkout is not linked yet.");
          const session = await api(`/v1/checkout/sessions/${String(row.stripe_session_id)}`);
          assertPaidCheckout(session, snapshot(row), lease.livemode === true);
          if (
            session.id !== row.stripe_session_id ||
            stripeId(session.subscription, "sub") !== subId
          )
            throw new Error("Refund does not match the subscription checkout.");
        }
      }
    }
  }
  if (!row && charge.payment_intent) {
    const paymentId = stripeId(charge.payment_intent, "pi"),
      payment = await api(`/v1/payment_intents/${paymentId}`);
    row = await orderById(sql, object(payment.metadata).kamino_order_id);
    if (row?.privacy_closed === true) return;
    if (row) {
      assertPaymentIntentMatches(payment, snapshot(row), lease.livemode === true);
      if (!row.stripe_session_id) throw new Error("The refunded checkout is not linked yet.");
      const session = await api(`/v1/checkout/sessions/${String(row.stripe_session_id)}`);
      assertPaidCheckout(session, snapshot(row), lease.livemode === true);
      if (
        session.id !== row.stripe_session_id ||
        stripeId(session.payment_intent, "pi") !== paymentId
      )
        throw new Error("Refund does not match the stored checkout.");
    }
  }
  if (!row) return;
  const outcome = chargeOutcome(charge);
  if (!outcome) return; // A partial refund is a goodwill credit: access stays.
  await persist(sql, row, outcome, null, lease, {
    reversedPayment: charge.payment_intent ? stripeId(charge.payment_intent, "pi") : null,
  });
  if (row.checkout_mode === "subscription") {
    const subId = row.stripe_subscription_id ? String(row.stripe_subscription_id) : invoiceSubscription;
    if (subId) await endSubscription(api, subId);
  }
}

/** Claim before processing; durable idempotency and retry leases also cover concurrent webhook delivery. */
export async function applyStripeEvent(
  sql: Sql,
  event: StripeEvent,
  rawBody: string,
  config: BillingConfig,
  api = stripeRequest(config),
): Promise<{ duplicate: boolean }> {
  if (!config.enabled)
    throw new Error("Payments are disabled.");
  if (event.livemode !== (config.mode === "live"))
    throw new Error(
      config.mode === "test"
        ? "Live payment events are not accepted; this server runs Stripe test mode."
        : "Test payment events are not accepted; this server runs Stripe live mode.",
    );
  const hash = createHash("sha256").update(rawBody).digest("hex"),
    claim = randomUUID();
  const rows =
    await sql<Row>`insert into billing_webhook_events(event_id,event_type,payload_hash,status,claim_token)
    values(${event.id},${event.type},${hash},'processing',${claim})
    on conflict(event_id) do update set claim_token=excluded.claim_token,started_at=now(),status='processing',error_code=''
      where billing_webhook_events.payload_hash=excluded.payload_hash and (billing_webhook_events.status='failed' or (billing_webhook_events.status='processing' and billing_webhook_events.started_at<now()-interval '1 minute')) returning event_id`;
  if (!rows.length) {
    const existing = (
      await sql<Row>`select status,payload_hash from billing_webhook_events where event_id=${event.id}`
    )[0];
    if (existing?.payload_hash !== hash)
      throw new Error("Payment event changed after its first delivery.");
    if (existing.status === "processed") return { duplicate: true };
    throw new Error("Payment event is already processing. Please retry.");
  }
  try {
    const lease = { eventId: event.id, claim, livemode: config.mode === "live" };
    const remote = event.data.object;
    if (
      ["identity.verification_session.verified", "identity.verification_session.failed"].includes(
        event.type,
      )
    ) {
      const { applyIdentityVerificationEvent } = await import("./age-verification.server.ts");
      await applyIdentityVerificationEvent(
        sql,
        stripeId(remote, "vs"),
        event.type.endsWith("verified") ? "verified" : "failed",
      );
      await sql`update billing_webhook_events set status='processed',processed_at=now() where event_id=${lease.eventId} and claim_token=${lease.claim}`;
      return { duplicate: false };
    }
    if (
      ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(
        event.type,
      )
    ) {
      await fulfillCheckout(
        sql,
        await api(`/v1/checkout/sessions/${stripeId(remote, lease.livemode ? "cs_live" : "cs_test")}`),
        api,
        lease,
      );
    } else if (
      ["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)
    ) {
      const session = await api(`/v1/checkout/sessions/${stripeId(remote, lease.livemode ? "cs_live" : "cs_test")}`),
        row = await orderById(sql, object(session.metadata).kamino_order_id);
      if (row && row.stripe_session_id === session.id && row.status === "pending") {
        assertCheckoutMatches(session, snapshot(row), lease.livemode === true);
        if (session.status === "complete" && session.payment_status === "paid")
          await fulfillCheckout(sql, session, api, lease);
        else if (session.status === "expired") await persist(sql, row, "expired", null, lease);
        else if (
          event.type === "checkout.session.async_payment_failed" &&
          session.status === "complete"
        )
          await persist(sql, row, "failed", null, lease);
      }
    } else if (
      [
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
      ].includes(event.type)
    ) {
      const invoice = event.type.startsWith("invoice.")
        ? await api(`/v1/invoices/${stripeId(remote, "in")}`)
        : null;
      const subId = invoice
        ? invoice.subscription
          ? stripeId(invoice.subscription, "sub")
          : ""
        : stripeId(remote, "sub");
      if (subId) await updateSubscription(sql, await api(`/v1/subscriptions/${subId}`), api, lease);
    } else if (event.type === "charge.refunded") {
      await revokeCharge(sql, await api(`/v1/charges/${stripeId(remote, "ch")}`), api, lease);
    } else if (event.type === "charge.dispute.created") {
      await revokeCharge(
        sql,
        await api(`/v1/charges/${stripeId(remote.charge, "ch")}`),
        api,
        lease,
      );
    }
    await sql`update billing_webhook_events set status='processed',processed_at=now() where event_id=${event.id} and claim_token=${claim}`;
    return { duplicate: false };
  } catch (error) {
    await sql`update billing_webhook_events set status='failed',error_code='processing_failed' where event_id=${event.id} and claim_token=${claim}`;
    throw error;
  }
}

export async function checkoutUrl(
  config: BillingConfig,
  order: BillingOrderSnapshot,
  offer: { title: string },
  api = stripeRequest(config),
) {
  const live = config.mode === "live";
  if (!config.enabled || config.mode === "disabled") throw new Error("Payments are disabled.");
  const body = new URLSearchParams({
    mode: order.mode,
    client_reference_id: order.id,
    success_url: `${config.origin}/marketplace?checkout=received`,
    cancel_url: `${config.origin}/marketplace?checkout=cancelled`,
    "line_items[0][price_data][currency]": order.currency,
    "line_items[0][price_data][unit_amount]": String(order.priceMinor),
    "line_items[0][price_data][product_data][name]": offer.title,
    "line_items[0][quantity]": "1",
    "payment_method_types[0]": "card",
  });
  const metadata = {
    kamino_order_id: order.id,
    kamino_buyer_id: order.buyerId,
    kamino_beneficiary_id: order.beneficiaryId,
  };
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
    body.set(
      `${order.mode === "subscription" ? "subscription_data" : "payment_intent_data"}[metadata][${key}]`,
      value,
    );
  }
  if (order.mode === "subscription")
    body.set("line_items[0][price_data][recurring][interval]", "month");
  const session = await api("/v1/checkout/sessions", "POST", body, `kamino-order-${order.id}`);
  assertCheckoutMatches(session, order, config.mode === "live");
  return { sessionId: stripeId(session, live ? "cs_live" : "cs_test"), url: trustedStripeRedirect(session.url) };
}

/** An open provider session remains the only checkout, regardless of the local order's age. */
export async function resumeCheckout(
  sql: Sql,
  config: BillingConfig,
  row: Row,
  api = stripeRequest(config),
): Promise<{ expired: true } | { expired: false; orderId: string; url: string; testMode: boolean }> {
  if (!config.enabled) throw new Error("Payments are disabled.");
  const live = config.mode === "live";
  if (row.status !== "pending") throw new Error("Check your purchase history before trying again.");
  const order = snapshot(row);
  const expire = async () => {
    const changed =
      await sql`update billing_orders set status='expired',updated_at=now(),billing_revision=billing_revision+1 where id=${order.id} and status='pending' and billing_revision=${Number(row.billing_revision ?? 0)} returning id`;
    if (!changed.length) throw new Error("This checkout changed. Please retry.");
    return { expired: true as const };
  };
  // A sandbox checkout left over from before real payments were switched on (or the other way round)
  // can never be paid with this server's keys, so it must not block a new purchase.
  if ((row.test_mode !== false) !== !live) return expire();
  if (row.stripe_session_id) {
    const session = await api(`/v1/checkout/sessions/${String(row.stripe_session_id)}`);
    assertCheckoutMatches(session, order, config.mode === "live");
    if (session.id !== row.stripe_session_id)
      throw new Error("Checkout does not match the stored session.");
    if (session.status === "expired") return expire();
    if (session.status !== "open")
      throw new Error(
        "Checkout is awaiting payment confirmation. Check your purchase history before trying again.",
      );
    return {
      expired: false,
      orderId: order.id,
      url: trustedStripeRedirect(session.url),
      testMode: !live,
    };
  }
  // No session was ever saved, so the buyer never received a checkout link. Within 24 hours the same
  // idempotency key returns the same session if Stripe did create one. After that, any session Stripe
  // made has expired unpaid (sessions last at most 24 hours and nobody had its link), so the order is
  // closed and a fresh one starts, instead of blocking this purchase forever.
  const created = new Date(String(row.created_at)).getTime();
  if (!Number.isFinite(created) || Date.now() - created >= 24 * 3600000) return expire();
  const checkout = await checkoutUrl(config, order, { title: String(row.title) }, api);
  const changed =
    await sql`update billing_orders set stripe_session_id=${checkout.sessionId},updated_at=now(),billing_revision=billing_revision+case when stripe_session_id is null then 1 else 0 end where id=${order.id} and status='pending' and (stripe_session_id is null or stripe_session_id=${checkout.sessionId}) returning id`;
  if (!changed.length) throw new Error("This checkout changed. Check your purchase history.");
  return { expired: false, orderId: order.id, url: checkout.url, testMode: !live };
}

/**
 * The Stripe receipt for one of the buyer's own orders. Read on demand so it always matches Stripe
 * (refunds included) and older orders get one too. Subscriptions show the latest charged month.
 */
export async function orderReceiptUrl(
  sql: Sql,
  config: BillingConfig,
  userId: string,
  orderId: string,
  api = stripeRequest(config),
): Promise<string> {
  if (!config.enabled) throw new Error("Payments are disabled.");
  const row = (
    await sql<Row>`select id,status,test_mode,stripe_payment_intent_id from billing_orders where id=${orderId} and buyer_id=${userId} and privacy_closed=false`
  )[0];
  if (!row || !["paid", "refunded", "disputed", "cancelled", "failed"].includes(String(row.status)) || !row.stripe_payment_intent_id)
    throw new Error("There's no receipt for this order.");
  if ((row.test_mode !== false) !== (config.mode !== "live"))
    throw new Error("This receipt is from a sandbox purchase and isn't available any more.");
  const payment = await api(`/v1/payment_intents/${stripeId(row.stripe_payment_intent_id, "pi")}`);
  const url = payment.latest_charge
    ? trustedReceiptUrl((await api(`/v1/charges/${stripeId(payment.latest_charge, "ch")}`)).receipt_url)
    : null;
  if (!url) throw new Error("The receipt isn't ready yet. Please try again in a minute.");
  return url;
}

/**
 * Account deletion: stop every subscription this person pays for before their rows are erased, so a
 * deleted account is never charged again. A provider error stops the deletion (the person can retry)
 * rather than leaving a subscription billing an account that no longer exists.
 */
export async function endSubscriptionsForAccount(
  sql: Sql,
  userId: string,
  config = getBillingConfig(),
  api?: StripeRequest,
): Promise<number> {
  if (!config.enabled) return 0;
  const rows = await sql<Row>`select distinct stripe_subscription_id from billing_orders
    where buyer_id=${userId} and checkout_mode='subscription' and stripe_subscription_id is not null
      and privacy_closed=false and test_mode=${config.mode !== "live"} and status in ('pending','paid','failed')`;
  const request = api ?? stripeRequest(config);
  for (const row of rows) await endSubscription(request, stripeId(row.stripe_subscription_id, "sub"));
  return rows.length;
}
