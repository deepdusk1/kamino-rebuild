/**
 * Solana Pay "transaction request" endpoints, called by the person's wallet app (not by Kamino's apps):
 *   GET  → { label, icon }                       shown at the top of the wallet's approval screen
 *   POST { account } → { transaction, message } the unsigned transaction for that wallet to approve
 * The `ref` in the address is an unguessable one-time key; it expires after 15 minutes.
 * Wallets call these from anywhere, so they answer CORS preflights and never use cookies.
 */
import { getSql } from "@/lib/db";
import { kaminoConfig, rpcChain } from "./kamino-chain.server";
import { tipTransaction, walletLinkTransaction } from "./kamino-tips.server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, accept-encoding",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function solanaPayOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export function solanaPayLabel() {
  const config = kaminoConfig();
  if (!config) return json({ message: "KAMINO tipping isn't available." }, 404);
  return json({ label: "Kamino", icon: `${config.publicUrl}/icons/kamino-192.png` });
}

/** Reads `ref` from the address and `account` from the wallet's JSON body. */
async function readRequest(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref") ?? "";
  let account = "";
  try {
    account = String(((await request.json()) as { account?: unknown }).account ?? "");
  } catch {
    // handled below
  }
  return { ref, account };
}

export async function solanaPayTransaction(request: Request, kind: "tip" | "link") {
  const config = kaminoConfig();
  if (!config) return json({ message: "KAMINO tipping isn't available." }, 404);
  const { ref, account } = await readRequest(request);
  if (!ref || ref.length > 64 || !account) return json({ message: "This request is incomplete. Start again in Kamino." }, 400);
  const sql = await getSql();
  const chain = rpcChain(config);
  try {
    if (kind === "link") return json(await walletLinkTransaction(sql, chain, ref, account));
    const recipient = (
      await sql`select coalesce(nullif(p.handle, ''), p.display_name, 'a Kamino member') as label
                from kamino_tips t left join profiles p on p.user_id = t.recipient_user_id where t.reference = ${ref}`
    )[0];
    const label = recipient ? (/^[a-z0-9_-]+$/i.test(String(recipient.label)) ? `@${recipient.label}` : String(recipient.label)) : "a Kamino member";
    return json(await tipTransaction(sql, chain, ref, account, label));
  } catch (error) {
    // Our own checks give readable messages; anything else (RPC down) gets a general one.
    const message = error instanceof Error && error.message.length < 160 ? error.message : "Kamino couldn't prepare this transaction.";
    return json({ message }, 400);
  }
}
