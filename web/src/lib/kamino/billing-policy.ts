export type PaidResourceKind = "community" | "post" | "chat" | "event";
type Env = Record<string, string | undefined>;

/** The billing site origin, or "" when it is missing or unsafe. An absent origin keeps billing disabled. */
export function billingOriginFrom(env: Env): string {
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
      return url.origin;
  } catch {
    /* fall through */
  }
  return "";
}

/**
 * True only when the server is fully configured for real-money Stripe payments. Live mode needs the
 * explicit opt-in flags on top of live keys: a pasted sk_live_ key alone never switches to real money.
 * billingConfig() uses this same check, so access rules and checkout always agree on the mode.
 */
export function liveBillingFrom(env: Env): boolean {
  return (
    env.KAMINO_PAYMENTS_ENABLED === "true" &&
    env.KAMINO_BILLING_MODE === "live" &&
    /^sk_live_[A-Za-z0-9]{16,}$/.test(env.STRIPE_SECRET_KEY?.trim() ?? "") &&
    /^whsec_[A-Za-z0-9]{16,}$/.test(env.STRIPE_WEBHOOK_SECRET?.trim() ?? "") &&
    Boolean(billingOriginFrom(env))
  );
}

/** The current server's mode. Safe to call from shared code: without process.env it reports test mode. */
export function billingIsLive(): boolean {
  return typeof process !== "undefined" && process.env ? liveBillingFrom(process.env) : false;
}

/**
 * Only purchases made in the server's current mode grant anything: real purchases count in live mode,
 * sandbox purchases count in test mode, and sandbox purchases never unlock anything once real money is on.
 * `alias` is a trusted table alias written by the server, never user input.
 */
export function billingModeSql(alias: string, live = billingIsLive()): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error("Invalid billing table alias.");
  return `${alias}.test_mode=${live ? "false" : "true"}`;
}

/** Arguments are trusted SQL expressions/placeholders supplied by the server, never user input. */
export function paidResourceAccessSql(
  viewerSql: string,
  kind: PaidResourceKind,
  targetIdSql: string,
  live = billingIsLive(),
): string {
  if (!["community", "post", "chat", "event"].includes(kind))
    throw new Error("Invalid paid resource kind.");
  return `(not exists(select 1 from billing_resource_requirements br where br.resource_kind='${kind}' and br.resource_id=cast(${targetIdSql} as text))
    or exists(select 1 from billing_resource_requirements br where br.resource_kind='${kind}' and br.resource_id=cast(${targetIdSql} as text)
      and (br.owner_id=${viewerSql}
        or exists(select 1 from memberships bm where bm.community_id=br.community_id and bm.user_id=${viewerSql} and bm.status='active' and bm.role in ('agent','leader','curator'))
        or exists(select 1 from billing_entitlements be where be.offer_id=br.offer_id and be.beneficiary_id=${viewerSql}
          and be.state='active' and ${billingModeSql("be", live)} and (be.expires_at is null or be.expires_at>now())))))`;
}
