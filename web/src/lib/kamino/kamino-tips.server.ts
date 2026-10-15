/**
 * KAMINO tipping: linking a wallet, starting a tip, building the transactions wallets ask for, and confirming what
 * landed on chain. The chain is passed in (`KaminoChain`), so all of this is tested against a fake one.
 *
 * Flow for a tip:
 *  1. The app calls `startTip`: checks (18+, not yourself, not blocked, recipient has a verified wallet, amount in
 *     range) and creates a pending tip with a fresh Solana Pay reference key.
 *  2. The app opens `solana:https://<server>/api/solana-pay/tip?ref=<reference>` in the person's wallet.
 *  3. The wallet posts its address to that URL; `tipTransaction` builds the unsigned transfer for that address.
 *  4. The person approves it in the wallet, which signs and sends it.
 *  5. `confirmTip` (the app polls, and a job sweeps) finds the transaction by its reference and checks it matches.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import type { Sql } from "../db.ts";
import {
  TIP_LIMITS,
  TOKEN_SYMBOL,
  buildLinkTransaction,
  buildTipTransaction,
  checkTipTransaction,
  formatTokenAmount,
  parseTokenAmount,
  parseWalletAddress,
  serializeUnsigned,
  type KaminoChain,
} from "./kamino-chain.server.ts";

export type TipStatus = "pending" | "confirmed" | "failed" | "expired";
export type TipTarget = { type: "profile" | "post"; id: string };

/** What the wallet shows in its approval screen for a link. */
export const linkMemo = (code: string) => `Kamino wallet link ${code}`;
export const tipMemo = (id: number) => `Kamino tip #${id}`;

function solanaPayUrl(publicUrl: string, path: "tip" | "link", ref: string) {
  // Solana Pay transaction request: the wallet fetches this https address (it must be URL-encoded after "solana:").
  return `solana:${encodeURIComponent(`${publicUrl}/api/solana-pay/${path}?ref=${encodeURIComponent(ref)}`)}`;
}

// ─────────────────────────────── wallets ───────────────────────────────

export async function walletOf(sql: Sql, userId: string): Promise<{ address: string; verifiedAt: string } | null> {
  const row = (
    await sql.query<{ address: string; verified_at: unknown }>(
      `select address, verified_at from kamino_wallets where user_id = $1`,
      [userId],
    )
  )[0];
  return row ? { address: String(row.address), verifiedAt: new Date(String(row.verified_at)).toISOString() } : null;
}

/** Starts linking a wallet. The code ends up in the memo the wallet signs, which proves the person controls it. */
export async function startWalletLink(sql: Sql, userId: string, publicUrl: string) {
  const recent = await sql.query<{ n: number }>(
    `select count(*)::int as n from kamino_wallet_links where user_id = $1 and created_at > now() - interval '1 hour'`,
    [userId],
  );
  if (Number(recent[0]?.n ?? 0) >= 10) throw new Error("Too many wallet link attempts. Try again in an hour.");
  const code = randomBytes(9).toString("base64url");
  await sql.query(`insert into kamino_wallet_links (code, user_id) values ($1, $2)`, [code, userId]);
  return { code, url: solanaPayUrl(publicUrl, "link", code) };
}

/** Solana Pay POST for a link: the wallet says which address it is; we return the memo transaction to sign. */
export async function walletLinkTransaction(sql: Sql, chain: KaminoChain, code: string, account: string) {
  const payer = parseWalletAddress(account);
  if (!payer) throw new Error("That isn't a Solana wallet address.");
  const link = (
    await sql.query<{ user_id: string }>(
      `select user_id from kamino_wallet_links where code = $1 and status = 'pending' and expires_at > now()`,
      [code],
    )
  )[0];
  if (!link) throw new Error("This link request expired. Start again in Kamino.");
  const owner = (await sql.query<{ user_id: string }>(`select user_id from kamino_wallets where address = $1`, [payer.toBase58()]))[0];
  if (owner && owner.user_id !== link.user_id) throw new Error("This wallet is already linked to another Kamino account.");
  await sql.query(`update kamino_wallet_links set address = $2 where code = $1 and status = 'pending'`, [code, payer.toBase58()]);
  const { blockhash } = await chain.latest();
  return {
    transaction: serializeUnsigned(buildLinkTransaction(payer, linkMemo(code), blockhash)),
    message: "Approve to link this wallet to your Kamino account. No tokens are moved; only the network fee is paid.",
  };
}

/** Checks whether the link transaction landed; links the wallet when it did. */
export async function confirmWalletLink(sql: Sql, chain: KaminoChain, userId: string, code: string) {
  const link = (
    await sql.query<{ address: string | null; status: string; expired: boolean }>(
      `select address, status, expires_at < now() as expired from kamino_wallet_links where code = $1 and user_id = $2`,
      [code, userId],
    )
  )[0];
  if (!link) throw new Error("Link request not found.");
  if (link.status !== "pending") return { status: link.status as "linked" | "expired" | "failed" };
  const address = link.address ? parseWalletAddress(link.address) : null;
  const signature = address ? await chain.findMemo(address, linkMemo(code)) : null;
  if (!signature || !address) {
    // The wallet may still be sending; give up only after the request expired (plus a little time to land).
    if (link.expired) {
      await sql.query(`update kamino_wallet_links set status = 'expired' where code = $1`, [code]);
      return { status: "expired" as const };
    }
    return { status: "pending" as const };
  }
  const taken = (await sql.query<{ user_id: string }>(`select user_id from kamino_wallets where address = $1`, [address.toBase58()]))[0];
  if (taken && taken.user_id !== userId) {
    await sql.query(`update kamino_wallet_links set status = 'failed', failure = 'linked to another account' where code = $1`, [code]);
    return { status: "failed" as const };
  }
  await sql.query(
    `insert into kamino_wallets (user_id, address, verified_at) values ($1, $2, now())
     on conflict (user_id) do update set address = excluded.address, verified_at = now()`,
    [userId, address.toBase58()],
  );
  await sql.query(`update kamino_wallet_links set status = 'linked' where code = $1`, [code]);
  return { status: "linked" as const, address: address.toBase58() };
}

export async function unlinkWallet(sql: Sql, userId: string) {
  await sql.query(`delete from kamino_wallets where user_id = $1`, [userId]);
}

// ─────────────────────────────── tips ───────────────────────────────

/** Validates and records a new tip. Returns the Solana Pay link to open in the tipper's wallet. */
export async function startTip(
  sql: Sql,
  chain: KaminoChain,
  publicUrl: string,
  input: { senderId: string; recipientId: string; amount: string; target: TipTarget },
) {
  if (input.senderId === input.recipientId) throw new Error("You can't tip yourself.");
  const blocked = await sql.query(
    `select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1`,
    [input.senderId, input.recipientId],
  );
  if (blocked.length) throw new Error("You can't tip this person.");
  const wallet = await walletOf(sql, input.recipientId);
  if (!wallet) throw new Error("This person hasn't set up a wallet for tips yet.");
  const recent = await sql.query<{ n: number }>(
    `select count(*)::int as n from kamino_tips where sender_user_id = $1 and created_at > now() - interval '1 hour'`,
    [input.senderId],
  );
  if (Number(recent[0]?.n ?? 0) >= 30) throw new Error("That's a lot of tips! Try again in a little while.");
  const mint = await chain.mintInfo();
  if (mint.problem) throw new Error(mint.problem);
  const amount = parseTokenAmount(input.amount, mint.decimals);
  const unit = 10n ** BigInt(mint.decimals);
  if (!amount || amount < TIP_LIMITS.min * unit || amount > TIP_LIMITS.max * unit)
    throw new Error(`Tips are from ${TIP_LIMITS.min} to ${formatTokenAmount(TIP_LIMITS.max, 0)} ${TOKEN_SYMBOL}.`);
  const reference = Keypair.generate().publicKey.toBase58();
  const row = (
    await sql.query<{ id: number }>(
      `insert into kamino_tips (reference, sender_user_id, recipient_user_id, recipient_address, amount_base, target_type, target_id)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [reference, input.senderId, input.recipientId, wallet.address, amount.toString(), input.target.type, input.target.id],
    )
  )[0]!;
  return {
    tipId: Number(row.id),
    url: solanaPayUrl(publicUrl, "tip", reference),
    amountLabel: `${formatTokenAmount(amount, mint.decimals)} ${TOKEN_SYMBOL}`,
  };
}

type TipRow = {
  id: number;
  reference: string;
  sender_user_id: string;
  recipient_user_id: string;
  recipient_address: string;
  amount_base: string;
  sender_address: string | null;
  signature: string | null;
  status: TipStatus;
  expired: boolean;
};

async function tipBy(sql: Sql, where: "reference" | "id", value: string | number): Promise<TipRow | null> {
  const row = (
    await sql.query<TipRow>(
      `select id, reference, sender_user_id, recipient_user_id, recipient_address, amount_base::text as amount_base,
              sender_address, signature, status, expires_at < now() as expired
       from kamino_tips where ${where === "reference" ? "reference" : "id"} = $1`,
      [value],
    )
  )[0];
  return row ? { ...row, id: Number(row.id) } : null;
}

/** Solana Pay POST for a tip: builds the transfer from the wallet that asked. */
export async function tipTransaction(sql: Sql, chain: KaminoChain, reference: string, account: string, recipientLabel: string) {
  const payer = parseWalletAddress(account);
  if (!payer) throw new Error("That isn't a Solana wallet address.");
  const tip = await tipBy(sql, "reference", reference);
  if (!tip || tip.status !== "pending" || tip.expired) throw new Error("This tip expired. Start again in Kamino.");
  if (tip.recipient_address === payer.toBase58()) throw new Error("You can't tip your own wallet.");
  const mint = await chain.mintInfo();
  if (mint.problem) throw new Error(mint.problem);
  await sql.query(`update kamino_tips set sender_address = $2 where id = $1 and status = 'pending'`, [tip.id, payer.toBase58()]);
  const { blockhash, epoch } = await chain.latest();
  const amount = BigInt(tip.amount_base);
  const { transaction, fee } = buildTipTransaction({
    mint: chain.mint,
    mintInfo: mint,
    payer,
    recipient: new PublicKey(tip.recipient_address),
    amount,
    reference: new PublicKey(tip.reference),
    memo: tipMemo(tip.id),
    recentBlockhash: blockhash,
    epoch,
  });
  const label = `${formatTokenAmount(amount, mint.decimals)} ${TOKEN_SYMBOL}`;
  return {
    transaction: serializeUnsigned(transaction),
    message: `Tip ${label} to ${recipientLabel} on Kamino.${fee > 0n ? ` The token's transfer fee is ${formatTokenAmount(fee, mint.decimals)} ${TOKEN_SYMBOL}.` : ""}`,
  };
}

/**
 * Looks for the tip's transaction and checks it. Confirms (and returns `confirmed: true` the first time, so the
 * caller can notify the recipient), fails it when the transaction doesn't match, or expires it when nothing arrived.
 */
export async function confirmTip(sql: Sql, chain: KaminoChain, tipId: number): Promise<{ status: TipStatus; justConfirmed: boolean; tip: TipRow | null }> {
  const tip = await tipBy(sql, "id", tipId);
  if (!tip) return { status: "failed", justConfirmed: false, tip: null };
  if (tip.status !== "pending") return { status: tip.status, justConfirmed: false, tip };
  const signature = await chain.findByReference(new PublicKey(tip.reference));
  if (!signature) {
    if (tip.expired) {
      await sql.query(`update kamino_tips set status = 'expired' where id = $1 and status = 'pending'`, [tip.id]);
      return { status: "expired", justConfirmed: false, tip };
    }
    return { status: "pending", justConfirmed: false, tip };
  }
  const mint = await chain.mintInfo();
  const parsed = await chain.getParsed(signature);
  const check = checkTipTransaction(parsed, {
    mint: chain.mint.toBase58(),
    programId: mint.programId.toBase58(),
    recipient: tip.recipient_address,
    amount: BigInt(tip.amount_base),
    reference: tip.reference,
  });
  if (!check.ok) {
    if (!parsed) return { status: "pending", justConfirmed: false, tip }; // not readable yet
    await sql.query(`update kamino_tips set status = 'failed', failure = $2, signature = $3 where id = $1 and status = 'pending'`, [
      tip.id,
      check.reason,
      signature,
    ]);
    return { status: "failed", justConfirmed: false, tip };
  }
  const updated = await sql.query(
    `update kamino_tips set status = 'confirmed', signature = $2, sender_address = $3, confirmed_at = now()
     where id = $1 and status = 'pending' returning id`,
    [tip.id, signature, check.sender],
  );
  return { status: "confirmed", justConfirmed: updated.length > 0, tip };
}

export type TipHistoryItem = {
  id: number;
  direction: "sent" | "received";
  status: TipStatus;
  amount: string;
  otherUserId: string;
  otherName: string;
  otherHandle: string;
  targetType: "profile" | "post";
  targetId: string;
  signature: string | null;
  createdAt: string;
};

/** Your tips, newest first: received ones only once confirmed; sent ones in every state (so you can see failures). */
export async function listTips(sql: Sql, userId: string, direction: "sent" | "received", decimals: number, limit = 50): Promise<TipHistoryItem[]> {
  const received = direction === "received";
  const rows = await sql.query<Record<string, unknown>>(
    `select t.id, t.status, t.amount_base::text as amount_base, t.target_type, t.target_id, t.signature, t.created_at,
            other.user_id as other_id, coalesce(other.display_name, 'Member') as other_name, coalesce(other.handle, '') as other_handle
     from kamino_tips t
     left join profiles other on other.user_id = ${received ? "t.sender_user_id" : "t.recipient_user_id"}
     where ${received ? "t.recipient_user_id = $1 and t.status = 'confirmed'" : "t.sender_user_id = $1"}
     order by t.created_at desc, t.id desc limit $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    direction,
    status: String(r.status) as TipStatus,
    amount: formatTokenAmount(BigInt(String(r.amount_base)), decimals),
    otherUserId: String(r.other_id ?? ""),
    otherName: String(r.other_name),
    otherHandle: String(r.other_handle),
    targetType: String(r.target_type) as "profile" | "post",
    targetId: String(r.target_id ?? ""),
    signature: r.signature ? String(r.signature) : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}

/** Background sweep: confirms or expires tips still pending (the app may have been closed while the wallet sent). */
export async function sweepPendingTips(sql: Sql, chain: KaminoChain, onConfirmed: (tip: TipRow) => Promise<void>) {
  const pending = await sql.query<{ id: number }>(
    `select id from kamino_tips where status = 'pending' and created_at > now() - interval '1 day' order by id limit 25`,
  );
  let confirmed = 0;
  for (const { id } of pending) {
    try {
      const result = await confirmTip(sql, chain, Number(id));
      if (result.justConfirmed && result.tip) {
        confirmed++;
        await onConfirmed(result.tip);
      }
    } catch {
      // RPC hiccup: try again on the next run.
    }
  }
  await sql.query(`update kamino_tips set status = 'expired' where status = 'pending' and created_at <= now() - interval '1 day'`);
  return confirmed;
}
