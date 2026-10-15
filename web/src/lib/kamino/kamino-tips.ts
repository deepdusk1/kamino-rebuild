/**
 * KAMINO token tipping and balances, for the website and the phone app (RPC registry: `/api/v1/rpc/<name>`).
 * Everything here is off until KAMINO_TOKEN_ENABLED=true and KAMINO_SOLANA_RPC_URL are set (see kaminoConfig).
 * The Solana work lives in kamino-chain.server.ts and kamino-tips.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";

type Authed = { userId: string };

async function setup() {
  const { kaminoConfig, rpcChain } = await import("./kamino-chain.server");
  const config = kaminoConfig();
  if (!config) throw new Error("KAMINO tipping isn't switched on yet.");
  return { config, chain: rpcChain(config), tips: await import("./kamino-tips.server"), money: await import("./kamino-chain.server") };
}

export type KaminoWallet =
  | { enabled: false }
  | {
      enabled: true;
      symbol: string;
      mint: string;
      address: string | null;
      verifiedAt: string | null;
      /** Formatted ("1,234.5"), or null when the wallet isn't linked or the network couldn't be read. */
      balance: string | null;
      balanceError: string | null;
      minTip: string;
      maxTip: string;
      /** Whether the iPhone app shows tip buttons on posts (profiles always have them). */
      tipsOnIosPosts: boolean;
    };

/** Your KAMINO wallet and balance (read from Solana). Only you see your balance. */
export const getKaminoWallet = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<KaminoWallet> => {
    const { kaminoConfig } = await import("./kamino-chain.server");
    if (!kaminoConfig()) return { enabled: false };
    const { config, chain, tips, money } = await setup();
    const sql = await internals.db();
    const { userId } = context as Authed;
    const wallet = await tips.walletOf(sql, userId);
    let balance: string | null = null;
    let balanceError: string | null = null;
    if (wallet) {
      try {
        const [mint, base] = await Promise.all([chain.mintInfo(), chain.balance(new (await import("@solana/web3.js")).PublicKey(wallet.address))]);
        balance = money.formatTokenAmount(base, mint.decimals, 2);
      } catch {
        balanceError = "Your balance couldn't be loaded right now.";
      }
    }
    return {
      enabled: true,
      symbol: money.TOKEN_SYMBOL,
      mint: config.mint.toBase58(),
      address: wallet?.address ?? null,
      verifiedAt: wallet?.verifiedAt ?? null,
      balance,
      balanceError,
      minTip: money.TIP_LIMITS.min.toString(),
      maxTip: money.TIP_LIMITS.max.toString(),
      tipsOnIosPosts: config.tipsOnIosPosts,
    };
  });

/** Starts linking a wallet: returns the `solana:` link to open in the person's wallet app. */
export const startKaminoWalletLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { config, tips } = await setup();
    const sql = await internals.db();
    const { userId } = context as Authed;
    await internals.requireMinAge(sql, userId);
    return tips.startWalletLink(sql, userId, config.publicUrl);
  });

/** Whether the wallet link went through (the app checks every few seconds after opening the wallet). */
export const checkKaminoWalletLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { code: string }) => z.object({ code: z.string().min(8).max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    const { chain, tips } = await setup();
    const sql = await internals.db();
    return tips.confirmWalletLink(sql, chain, (context as Authed).userId, data.code);
  });

export const unlinkKaminoWallet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { unlinkWallet } = await import("./kamino-tips.server");
    await unlinkWallet(await internals.db(), (context as Authed).userId);
    return { ok: true };
  });

/** Whether someone can be tipped (has a verified wallet). Never reveals their address or balance. */
export const getKaminoTipInfo = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { userId: string }) => z.object({ userId: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ context, data }) => {
    const { kaminoConfig } = await import("./kamino-chain.server");
    const config = kaminoConfig();
    if (!config) return { enabled: false, canReceive: false, tipsOnIosPosts: false };
    const { walletOf } = await import("./kamino-tips.server");
    const sql = await internals.db();
    const self = (context as Authed).userId === data.userId;
    return { enabled: true, canReceive: !self && Boolean(await walletOf(sql, data.userId)), tipsOnIosPosts: config.tipsOnIosPosts };
  });

const tipInput = z.object({
  recipientUserId: z.string().min(1).max(100),
  amount: z.string().min(1).max(24),
  targetType: z.enum(["profile", "post"]),
  targetId: z.string().max(100).default(""),
});

/**
 * Starts a tip and returns the `solana:` link to open in the tipper's wallet. For a post, the recipient must be its
 * author and the tipper must be able to see it.
 */
export const startKaminoTip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: z.input<typeof tipInput>) => tipInput.parse(d))
  .handler(async ({ context, data }) => {
    const { config, chain, tips } = await setup();
    const sql = await internals.db();
    const { userId } = context as Authed;
    await internals.requireMinAge(sql, userId);
    const { guard } = await import("./guard");
    await guard(userId, "message");
    let targetId = data.targetId;
    if (data.targetType === "post") {
      const postId = Number(data.targetId);
      if (!Number.isSafeInteger(postId) || postId < 1) throw new Error("Post not found.");
      const post = await internals.requirePostAccess(sql, userId, postId);
      if (String(post.author_user_id) !== data.recipientUserId) throw new Error("Tips on a post go to its author.");
      targetId = String(postId);
    } else {
      targetId = data.recipientUserId;
    }
    // Tips only go to adult members in good standing.
    await internals.assertPersonAvailable(sql, data.recipientUserId);
    await internals.requireMinAge(sql, data.recipientUserId).catch(() => {
      throw new Error("This person can't receive tips.");
    });
    return tips.startTip(sql, chain, config.publicUrl, {
      senderId: userId,
      recipientId: data.recipientUserId,
      amount: data.amount,
      target: { type: data.targetType, id: targetId },
    });
  });

/** Checks a tip you sent (or received); confirms it once its transaction is on chain and tells the recipient. */
export const checkKaminoTip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { tipId: number }) => z.object({ tipId: z.number().int().positive() }).parse(d))
  .handler(async ({ context, data }) => {
    const { chain, tips } = await setup();
    const sql = await internals.db();
    const { userId } = context as Authed;
    const owner = (
      await sql`select 1 from kamino_tips where id = ${data.tipId} and (sender_user_id = ${userId} or recipient_user_id = ${userId})`
    )[0];
    if (!owner) throw new Error("Tip not found.");
    const result = await tips.confirmTip(sql, chain, data.tipId);
    if (result.justConfirmed && result.tip) {
      const { notifyTip } = await import("./kamino-notify.server");
      await notifyTip(result.tip.id);
    }
    return { status: result.status };
  });

export const listKaminoTips = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { direction: "sent" | "received" }) => z.object({ direction: z.enum(["sent", "received"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const { chain, tips } = await setup();
    const sql = await internals.db();
    const mint = await chain.mintInfo().catch(() => ({ decimals: 6 }));
    return tips.listTips(sql, (context as Authed).userId, data.direction, mint.decimals);
  });
