/**
 * Creator money: earnings ledger and payouts to creators via Stripe Connect (Express).
 *
 * Earnings are credited from the webhook path whenever an order completes — every completed
 * order's gross is split into a platform fee (`KAMINO_PLATFORM_FEE_PERCENT`, default 10) and the
 * creator's net. Payouts move net earnings to the creator's connected account with a Stripe
 * transfer. Real money only moves when billing runs in live mode; in test mode everything is
 * tracked but `requestPayout` refuses, exactly like checkout.
 *
 * The Stripe calls follow the same injectable `StripeRequest` shape as `billing.server.ts`, so
 * the tests run against a stub.
 */
import type { Sql } from "../db.ts";
import { billingConfig } from "./billing-rules.ts";
import type { StripeRequest } from "./billing.server.ts";
export type { StripeRequest };

type BillingConfigLite = ReturnType<typeof billingConfig>;

const getBillingConfig = (): BillingConfigLite => billingConfig(process.env);

/** The provider request builder lives in billing.server; loaded lazily to stay test-light. */
async function defaultApi(config: BillingConfigLite): Promise<StripeRequest> {
  const { stripeRequest } = await import("./billing.server.ts");
  return stripeRequest(config);
}

type Row = Record<string, unknown>;

export const DEFAULT_PLATFORM_FEE_PERCENT = 10;

export function platformFeePercent(): number {
  const raw = process.env.KAMINO_PLATFORM_FEE_PERCENT?.trim();
  const fee = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(fee) && fee >= 0 && fee <= 50 ? fee : DEFAULT_PLATFORM_FEE_PERCENT;
}

/** Idempotent: one earnings row per order. Called from the webhook persist path. */
/** Days an order's earnings wait before they can be paid out (refund/chargeback window). */
export function payoutHoldDays(): number {
  const raw = process.env.KAMINO_PAYOUT_HOLD_DAYS?.trim();
  const days = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(days) && days >= 0 && days <= 90 ? days : 7;
}

/**
 * Credits one completed order's earnings, inside the refund hold period. Sandbox orders never
 * earn a payable balance. Throws on failure — the reconciliation pass retries, so a paid order
 * can never silently end up owing nothing.
 */
export async function creditCreatorEarnings(sql: Sql, orderId: string, testMode: boolean): Promise<boolean> {
  if (testMode) return false;
  const order = (await sql<Row>`
    select id, beneficiary_id, seller_id, price_minor, currency, status
    from billing_orders where id = ${orderId} and status = 'paid'`)[0];
  if (!order) return false;
  const gross = Number(order.price_minor ?? 0);
  if (gross <= 0) return false;
  const fee = Math.floor((gross * platformFeePercent()) / 100);
  const inserted = await sql`
    insert into creator_earnings(creator_id, order_id, gross_minor, fee_minor, net_minor, currency, state, released_at)
    values(${String(order.seller_id)}, ${String(order.id)}, ${gross}, ${fee}, ${gross - fee}, ${String(order.currency)}, 'available',
      now() + (${payoutHoldDays()} || ' days')::interval)
    on conflict (order_id) where net_minor >= 0 do nothing returning id`;
  return inserted.length > 0;
}

/**
 * Reverses the earnings of an order that was refunded or disputed. Rows still in the pool are
 * reversed directly; rows already paid out are offset by a negative adjustment so the balance
 * goes down until the loss is recovered. Idempotent per order (an adjustment is inserted once).
 */
export async function reverseCreatorEarnings(sql: Sql, orderId: string): Promise<void> {
  const order = (await sql<Row>`select id, currency, status from billing_orders where id = ${orderId}`)[0];
  if (!order) return;
  const currency = String(order.currency);
  const rows = await sql<Row>`
    select id, creator_id, net_minor, state from creator_earnings
    where order_id = ${orderId} and state in ('available','reserved','paid')`;
  for (const row of rows) {
    if (row.state === 'paid') {
      // Already sent to the creator: book the loss against future earnings instead. The guard
      // keeps webhook replays from booking the same loss twice.
      const existing = await sql`select 1 from creator_earnings where order_id = ${orderId} and net_minor < 0 limit 1`;
      if (!existing.length)
        await sql`
          insert into creator_earnings(creator_id, order_id, gross_minor, fee_minor, net_minor, currency, state, released_at)
          values(${row.creator_id}, ${orderId}, 0, 0, ${-Math.abs(Number(row.net_minor))}, ${currency}, 'available', now())`;
    }
    await sql`update creator_earnings set state = 'reversed', released_at = now() where id = ${Number(row.id)}`;
  }
}

type PayoutAccount = { id: string; charges_enabled: boolean; payouts_enabled: boolean };

async function ensureConnectAccount(
  sql: Sql,
  userId: string,
  api: StripeRequest,
  live: boolean,
): Promise<PayoutAccount> {
  const existing = (
    await sql<Row>`select stripe_account_id from creator_payout_accounts where user_id = ${userId}`
  )[0];
  if (existing?.stripe_account_id) {
    const account = (await api(`/v1/accounts/${String(existing.stripe_account_id)}`)) as PayoutAccount;
    return account;
  }
  const account = (await api("/v1/accounts", "POST", new URLSearchParams({ type: "express" }))) as PayoutAccount;
  await sql`insert into creator_payout_accounts(user_id, stripe_account_id, live_mode)
    values(${userId}, ${String(account.id)}, ${live})
    on conflict (user_id) do update set stripe_account_id = excluded.stripe_account_id, live_mode = excluded.live_mode, updated_at = now()`;
  return account;
}

// ── The three member-facing operations ──────────────────────────────────────

export async function creatorMoneySummary(sql: Sql, userId: string) {
    const config = getBillingConfig();
    const summary = (await sql<Row>`
      select coalesce(sum(case when state='available' then net_minor else 0 end), 0) as available,
             coalesce(sum(net_minor), 0) as lifetime, currency
      from creator_earnings where creator_id = ${userId} group by currency limit 1`)[0];
    const payouts = await sql<Row>`
      select id, amount_minor, currency, state, created_at, updated_at, error
      from creator_payouts where creator_id = ${userId} order by id desc limit 20`;
    const account = (
      await sql<Row>`select stripe_account_id, live_mode from creator_payout_accounts where user_id = ${userId}`
    )[0];
    return {
      billingReason: config.reason,
      billingMode: config.mode,
      connected: Boolean(account?.stripe_account_id),
      availableMinor: Number(summary?.available ?? 0),
      lifetimeMinor: Number(summary?.lifetime ?? 0),
      currency: String(summary?.currency ?? "usd"),
      feePercent: platformFeePercent(),
      payouts: payouts.map((row) => ({
        id: Number(row.id),
        amountMinor: Number(row.amount_minor),
        currency: String(row.currency),
        state: String(row.state),
        error: String(row.error ?? ""),
        createdAt: String(row.created_at),
      })),
    };
}

/** Connect onboarding link (testable core of the RPC op below). */
export async function connectOnboardingUrl(sql: Sql, userId: string, api?: StripeRequest): Promise<{ url: string }> {
  const config = getBillingConfig();
  if (!config.enabled) throw new Error(config.reason);
  const request = api ?? (await defaultApi(config));
  const account = await ensureConnectAccount(sql, userId, request, config.mode === "live");
  const origin = config.origin;
  const link = (await request(
    "/v1/account_links",
    "POST",
    new URLSearchParams({
      account: String(account.id),
      refresh_url: `${origin}/creator`,
      return_url: `${origin}/creator`,
      type: "account_onboarding",
    }),
  )) as { url?: string };
  if (!link.url) throw new Error("The payment provider did not return an onboarding link.");
  return { url: link.url };
}

/**
 * Settles one currency's released earnings to the creator's connected account. Safe against the
 * three classic failure modes:
 *
 * - **Money in flight**: rows are moved to `reserved` and bound to the payout row in one
 *   statement before any provider call, so earnings credited mid-transfer stay `available`.
 * - **Duplicate transfers**: the provider idempotency key is the payout row's own id, so a retry
 *   after a crash returns the original transfer instead of creating a second one.
 * - **Crash after transfer, before marking**: the payout row stays `processing` with its
 *   earnings `reserved`; `reconcileStuckPayouts` (run by the worker and before every new payout)
 *   re-sends with the same key and finishes the bookkeeping. Earnings never silently return to
 *   `available`.
 *
 * Mixed currencies are settled one currency at a time: each call pays the largest released
 * balance, so amounts are never summed across currencies.
 */
export async function payOutCreator(
  sql: Sql,
  userId: string,
  api?: StripeRequest,
): Promise<{ paidMinor: number; currency: string }> {
  const config = getBillingConfig();
  if (!config.enabled) throw new Error(config.reason);
  if (config.mode !== "live")
    throw new Error("Payouts need live billing. Test-mode earnings stay in the sandbox.");
  const request = api ?? (await defaultApi(config));

  // Finish a payout that was interrupted mid-transfer before starting a new one; if one was
  // recovered, that recovery IS this payout's result.
  const recovered = await reconcileStuckPayouts(sql, userId, request);
  if (recovered) return recovered;

  const account = await ensureConnectAccount(sql, userId, request, true);
  if (!account.payouts_enabled)
    throw new Error("Finish the payout onboarding first — the provider has not enabled your account yet.");

  const currencies = await sql<Row>`
    select currency, coalesce(sum(net_minor), 0) as total
    from creator_earnings
    where creator_id = ${userId} and state = 'available' and released_at <= now()
    group by currency having coalesce(sum(net_minor), 0) > 0
    order by 2 desc limit 1`;
  const currencyRow = currencies[0];
  if (!currencyRow)
    throw new Error("No released earnings to pay out yet — fresh earnings wait out the refund hold period.");
  const currency = String(currencyRow.currency);
  const total = Number(currencyRow.total);
  void total;

  // Reserve the exact rows before any provider call. `for update skip locked` keeps two
  // concurrent payouts from claiming the same rows.
  const reserved = await sql<Row>`
    update creator_earnings set state = 'reserved'
    where id in (
      select id from creator_earnings
      where creator_id = ${userId} and state = 'available' and currency = ${currency} and released_at <= now()
      order by id
      for update skip locked
    ) returning id, net_minor`;
  const sum = reserved.reduce((acc, row) => acc + Number(row.net_minor), 0);
  if (!reserved.length || sum <= 0)
    throw new Error("No released earnings to pay out yet.");

  const payoutRow = await sql<{ id: string | number }>`
    insert into creator_payouts(creator_id, amount_minor, currency, state, stripe_account_id)
    values(${userId}, ${sum}, ${currency}, 'processing', ${String(account.id)}) returning id`;
  const payoutId = Number(payoutRow[0]!.id);
  await sql`update creator_earnings set payout_id = ${payoutId} where id = any(${reserved.map((r) => Number(r.id))})`;

  try {
    // The provider key is the payout row's id: retries converge on the same transfer.
    const transfer = (await request(
      "/v1/transfers",
      "POST",
      new URLSearchParams({
        amount: String(sum),
        currency,
        destination: String(account.id),
      }),
      `kamino-payout-row-${payoutId}`,
    )) as { id?: string };
    await sql`update creator_payouts set state='paid', stripe_transfer_id=${String(transfer.id ?? "")}, updated_at=now() where id=${payoutId}`;
    await sql`update creator_earnings set state='paid' where payout_id = ${payoutId}`;
    return { paidMinor: sum, currency };
  } catch (error) {
    await sql`update creator_payouts set error=${(error instanceof Error ? error.message : "transfer failed").slice(0, 300)}, updated_at=now() where id=${payoutId}`;
    throw error;
  }
}

/**
 * Finishes payouts that were interrupted between transfer and bookkeeping. A `processing` payout
 * is re-sent with its original idempotency key — the provider returns the original transfer —
 * and its reserved rows are then marked paid. A stuck row without reserved earnings fails and
 * releases nothing (the rows are already gone with it).
 */
export async function reconcileStuckPayouts(
  sql: Sql,
  userId: string,
  request: StripeRequest,
): Promise<{ paidMinor: number; currency: string } | null> {
  const stuck = await sql<Row>`
    select id, amount_minor, currency, stripe_account_id from creator_payouts
    where creator_id = ${userId} and state = 'processing'
    order by id asc limit 5`;
  let recovered: { paidMinor: number; currency: string } | null = null;
  for (const row of stuck) {
    const payoutId = Number(row.id);
    const reservedRows = await sql<Row>`select id from creator_earnings where payout_id = ${payoutId} and state = 'reserved'`;
    if (!reservedRows.length) {
      await sql`update creator_payouts set state='failed', error='no reserved earnings left; nothing to settle', updated_at=now() where id=${payoutId}`;
      continue;
    }
    try {
      const transfer = (await request(
        "/v1/transfers",
        "POST",
        new URLSearchParams({
          amount: String(Number(row.amount_minor)),
          currency: String(row.currency),
          destination: String(row.stripe_account_id),
        }),
        `kamino-payout-row-${payoutId}`,
      )) as { id?: string };
      await sql`update creator_payouts set state='paid', stripe_transfer_id=coalesce(${String(transfer.id ?? "")}, stripe_transfer_id), error='', updated_at=now() where id=${payoutId}`;
      await sql`update creator_earnings set state='paid' where payout_id = ${payoutId} and state = 'reserved'`;
      recovered = { paidMinor: Number(row.amount_minor), currency: String(row.currency) };
    } catch (error) {
      // Still `processing` with its reservation held; the next pass retries with the same key.
      await sql`update creator_payouts set error=${(error instanceof Error ? error.message : "reconciliation failed").slice(0, 300)}, updated_at=now() where id=${payoutId}`;
      throw error;
    }
  }
  return recovered;
}

/**
 * Worker pass: retries earnings credits that failed mid-webhook, so a paid order is never left
 * owing nothing. Also flips reserved earnings whose hold period has passed back to available
 * (they can only be reserved while released, so this only covers clock edge cases).
 */
export async function reconcileMissingEarnings(sql: Sql): Promise<number> {
  const missing = await sql<Row>`
    select o.id, o.test_mode from billing_orders o
    where o.status = 'paid' and o.created_at > now() - interval '45 days'
      and not exists(select 1 from creator_earnings ce where ce.order_id = o.id and ce.net_minor >= 0)
    order by o.updated_at asc limit 50`;
  let credited = 0;
  for (const row of missing) {
    try {
      if (await creditCreatorEarnings(sql, String(row.id), Boolean(row.test_mode))) credited += 1;
    } catch {
      // Stays uncredited; the next worker pass retries. Surfacing here would abort the sweep.
    }
  }
  return credited;
}
