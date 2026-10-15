/**
 * Server-only pieces of KAMINO tipping that need the rest of the app (notifications, the database pool):
 * telling the recipient about a confirmed tip, and the once-a-minute sweep of pending tips.
 */
import { internals } from "./server";

/** "Mika sent you 10 KAMINO" for the recipient, once the tip is confirmed on chain. */
export async function notifyTip(tipId: number): Promise<void> {
  const sql = await internals.db();
  const row = (
    await sql`select t.sender_user_id, t.recipient_user_id, t.amount_base::text as amount_base, t.target_type, t.target_id,
                     coalesce(p.display_name, 'Someone') as sender_name, coalesce(p.handle, '') as sender_handle
              from kamino_tips t left join profiles p on p.user_id = t.sender_user_id where t.id = ${tipId}`
  )[0];
  if (!row) return;
  const { formatTokenAmount, TOKEN_SYMBOL } = await import("./kamino-chain.server");
  await internals.notify(
    sql,
    String(row.recipient_user_id),
    "tip",
    String(row.sender_name),
    `sent you ${formatTokenAmount(BigInt(String(row.amount_base)), 6)} ${TOKEN_SYMBOL}`,
    row.sender_handle ? `/u/${String(row.sender_handle)}` : "/notifications",
    {
      actorId: String(row.sender_user_id),
      targetType: row.target_type === "post" ? "post" : "",
      targetId: row.target_type === "post" ? String(row.target_id) : "",
    },
  );
}

/** Background sweep for tips still pending (scheduler, once a minute). */
export async function sweepKaminoTips(): Promise<number> {
  const { kaminoConfig, rpcChain } = await import("./kamino-chain.server");
  const config = kaminoConfig();
  if (!config) return 0;
  const { sweepPendingTips } = await import("./kamino-tips.server");
  return sweepPendingTips(await internals.db(), rpcChain(config), (tip) => notifyTip(tip.id));
}
