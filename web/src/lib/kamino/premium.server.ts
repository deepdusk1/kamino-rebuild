import type { Sql } from "@/lib/db";
import { billingIsLive, billingModeSql } from "./billing-policy.ts";

/**
 * Premium benefits follow a verified paid subscription, never a catalog flag or client checkbox.
 * The purchase must match the server's billing mode: real purchases in live mode, sandbox ones in test mode.
 */
export function premiumActiveSql(viewer: string, live = billingIsLive()) {
  return `exists(select 1 from billing_entitlements e join billing_orders o on o.id=e.order_id
 where e.beneficiary_id=${viewer} and e.state='active' and ${billingModeSql("e", live)} and ${billingModeSql("o", live)} and o.status='paid' and o.kind='premium' and e.expires_at>now())`;
}
export async function hasPremium(sql: Sql, userId: string) {
  const rows = await sql.query<{ active: boolean }>(`select ${premiumActiveSql("$1")} as active`, [
    userId,
  ]);
  return rows[0]?.active === true;
}
