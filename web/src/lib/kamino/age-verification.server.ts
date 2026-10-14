/**
 * Independent age verification via Stripe Identity (document check).
 *
 * A member starts a verification session; the server mints it through Stripe and the member
 * completes it on Stripe's hosted page. The `identity.verification_session.verified` webhook
 * marks the account verified — Kamino never receives and never stores the document itself.
 * Dormant until billing is configured (the Stripe key gates both), with an explicit
 * `KAMINO_AGE_VERIFICATION_ENABLED=true` switch so operators decide when it is offered.
 *
 * Stripe calls follow the injectable `StripeRequest` shape so tests run against a stub.
 */
import type { Sql } from "../db.ts";
import { billingConfig } from "./billing-rules.ts";
import type { StripeRequest } from "./billing.server.ts";

type BillingConfigLite = ReturnType<typeof billingConfig>;

const getBillingConfig = (): BillingConfigLite => billingConfig(process.env);

async function defaultApi(config: BillingConfigLite): Promise<StripeRequest> {
  const { stripeRequest } = await import("./billing.server.ts");
  return stripeRequest(config);
}

type Row = Record<string, unknown>;

export function ageVerificationEnabled(): boolean {
  return (
    process.env.KAMINO_AGE_VERIFICATION_ENABLED === "true" &&
    getBillingConfig().enabled
  );
}

async function requireEnabled(): Promise<void> {
  if (!ageVerificationEnabled())
    throw new Error(
      "Age verification is not offered on this server yet. The declared birthday still applies.",
    );
}

export async function ageVerificationStatus(sql: Sql, userId: string) {
    const row = (
      await sql<Row>`select status, verified_at, updated_at from age_verifications where user_id = ${userId}`
    )[0];
    const verifiedByAge = (
      await sql<Row>`select age_verified_at from profiles where user_id = ${userId}`
    )[0];
    return {
      offered: ageVerificationEnabled(),
      status: row ? String(row.status) : "none",
      verifiedAt: row?.verified_at ? String(row.verified_at) : null,
      operatorVerified: Boolean(verifiedByAge?.age_verified_at),
    };
}

/** Mints a Stripe Identity session (testable core of the RPC op below). */
export async function startAgeVerificationSession(sql: Sql, userId: string, api?: StripeRequest) {
    await requireEnabled();
    const config = getBillingConfig();
    const request = api ?? (await defaultApi(config));
    const session = (await request(
      "/v1/identity/verification_sessions",
      "POST",
      new URLSearchParams({
        type: "document",
        "options[document][require_matching_selfie]": "false",
        "metadata[kamino_user_id]": userId,
      }),
      `kamino-age-verify-${userId}`,
    )) as { id?: string; url?: string; client_secret?: string };
    if (!session.id || !(session.url || session.client_secret))
      throw new Error("The verification provider did not return a session. Try again shortly.");
    await sql`insert into age_verifications(user_id, provider, session_id, status)
      values(${userId}, 'stripe_identity', ${String(session.id)}, 'pending')
      on conflict (user_id) do update set session_id = excluded.session_id, status = 'pending', updated_at = now()`;
    return { url: session.url ?? null, clientSecret: session.client_secret ?? null };
}



/** Webhook path: marks the member verified. The document never touches Kamino. */
export async function applyIdentityVerificationEvent(
  sql: Sql,
  sessionId: string,
  status: "verified" | "failed",
): Promise<void> {
  const verified = status === "verified";
  await sql`update age_verifications
    set status = ${verified ? "verified" : "failed"}, verified_at = ${verified ? new Date().toISOString() : null}, updated_at = now()
    where session_id = ${sessionId}`;
  if (verified) {
    const row = (await sql<Row>`select user_id from age_verifications where session_id = ${sessionId}`)[0];
    if (row)
      await sql`update profiles set age_verified_at = now() where user_id = ${String(row.user_id)}`;
  }
}
