import { rpc } from "./client";

/**
 * KAMINO token tipping and balances (server: web/src/lib/kamino/kamino-tips.ts). Kamino never holds keys or tokens:
 * transfers are approved in the person's own Solana wallet app.
 */
export type KaminoWallet =
  | { enabled: false }
  | {
      enabled: true;
      symbol: string;
      mint: string;
      address: string | null;
      verifiedAt: string | null;
      balance: string | null;
      balanceError: string | null;
      minTip: string;
      maxTip: string;
      tipsOnIosPosts: boolean;
    };

export type KaminoTipStatus = "pending" | "confirmed" | "failed" | "expired";

export type KaminoTipItem = {
  id: number;
  direction: "sent" | "received";
  status: KaminoTipStatus;
  amount: string;
  otherUserId: string;
  otherName: string;
  otherHandle: string;
  targetType: "profile" | "post";
  targetId: string;
  signature: string | null;
  createdAt: string;
};

export type KaminoTipTarget = { type: "profile" | "post"; id: string };

export const kamino = {
  wallet: () => rpc<KaminoWallet>("getKaminoWallet"),
  startLink: () => rpc<{ code: string; url: string }>("startKaminoWalletLink"),
  checkLink: (code: string) =>
    rpc<{ status: "pending" | "linked" | "expired" | "failed"; address?: string }>("checkKaminoWalletLink", { code }),
  unlink: () => rpc<{ ok: boolean }>("unlinkKaminoWallet"),
  tipInfo: (userId: string) =>
    rpc<{ enabled: boolean; canReceive: boolean; tipsOnIosPosts: boolean }>("getKaminoTipInfo", { userId }),
  startTip: (input: { recipientUserId: string; amount: string; targetType: "profile" | "post"; targetId: string }) =>
    rpc<{ tipId: number; url: string; amountLabel: string }>("startKaminoTip", input),
  checkTip: (tipId: number) => rpc<{ status: KaminoTipStatus }>("checkKaminoTip", { tipId }),
  tips: (direction: "sent" | "received") => rpc<KaminoTipItem[]>("listKaminoTips", { direction }),
};
