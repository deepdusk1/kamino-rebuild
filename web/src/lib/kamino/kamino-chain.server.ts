/**
 * KAMINO token on Solana: reading balances, building the transactions people approve in their own wallet, and
 * checking those transactions once they are on chain.
 *
 * Kamino never holds a private key. Every transaction built here is unsigned; the person's wallet app (Phantom,
 * Solflare, …) shows it, they approve it, and the wallet signs and sends it. The server only reads public chain
 * data through an RPC provider (KAMINO_SOLANA_RPC_URL).
 */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import {
  AccountState,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  calculateEpochFee,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createTransferCheckedWithFeeInstruction,
  getAssociatedTokenAddressSync,
  getDefaultAccountState,
  getNonTransferable,
  getPausableConfig,
  getTransferFeeConfig,
  getTransferHook,
  unpackMint,
  type Mint,
  type TransferFeeConfig,
} from "@solana/spl-token";

/** The KAMINO mint (Solana mainnet, Token-2022). Override with KAMINO_TOKEN_MINT. */
export const DEFAULT_KAMINO_MINT = "4JpdAMKg9xoiT2rrtZQdpgnRK6AKBERLxzytwLkV2VMH";
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const TOKEN_SYMBOL = "KAMINO";

export type KaminoConfig = {
  rpcUrl: string;
  mint: PublicKey;
  /** The server's public address, for the Solana Pay links wallets open. */
  publicUrl: string;
  /** Tip buttons on posts in the iPhone app (off by default: see FEATURE-STATUS.md, App Store 3.1.1). */
  tipsOnIosPosts: boolean;
};

/** Tipping is off unless KAMINO_TOKEN_ENABLED=true and an https RPC address is set. */
export function kaminoConfig(env: Record<string, string | undefined> = process.env): KaminoConfig | null {
  if (env.KAMINO_TOKEN_ENABLED !== "true") return null;
  const rpcUrl = env.KAMINO_SOLANA_RPC_URL?.trim() ?? "";
  const publicUrl = (env.BETTER_AUTH_URL ?? "").trim().replace(/\/+$/, "");
  if (!rpcUrl.startsWith("https://") || !publicUrl.startsWith("https://")) return null;
  const mint = parseWalletAddress(env.KAMINO_TOKEN_MINT?.trim() || DEFAULT_KAMINO_MINT, { allowOffCurve: true });
  if (!mint) return null;
  return { rpcUrl, mint, publicUrl, tipsOnIosPosts: env.KAMINO_TIPS_IOS_POSTS === "true" };
}

// ─────────────────────────────── amounts ───────────────────────────────

/**
 * "12.5" → 12500000n for 6 decimals. Null for anything that isn't a plain positive number with at most `decimals`
 * digits after the point (no signs, no exponents, no commas).
 */
export function parseTokenAmount(text: string, decimals: number): bigint | null {
  const match = /^(\d{1,15})(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return null;
  const value = BigInt(match[1]!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  return value > 0n ? value : null;
}

/** 12500000n (6 decimals) → "12.5"; thousands separated: "1,234,567.89". Trailing zeros dropped. */
export function formatTokenAmount(base: bigint, decimals: number, maxFraction = decimals): string {
  const negative = base < 0n;
  const abs = negative ? -base : base;
  const unit = 10n ** BigInt(decimals);
  const whole = (abs / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let fraction = (abs % unit).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  if (decimals === 0) fraction = "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Smallest and largest tip, in whole tokens. */
export const TIP_LIMITS = { min: 1n, max: 1_000_000n };

// ─────────────────────────────── addresses ───────────────────────────────

/**
 * A Solana address, or null. Wallet addresses must be "on curve" (a real key pair), which also rejects most
 * typos and program-owned addresses that couldn't sign for a token account.
 */
export function parseWalletAddress(text: unknown, options: { allowOffCurve?: boolean } = {}): PublicKey | null {
  if (typeof text !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text.trim())) return null;
  try {
    const key = new PublicKey(text.trim());
    if (!options.allowOffCurve && !PublicKey.isOnCurve(key.toBytes())) return null;
    return key;
  } catch {
    return null;
  }
}

// ─────────────────────────────── the mint ───────────────────────────────

export type MintInfo = {
  programId: PublicKey;
  decimals: number;
  transferFee: TransferFeeConfig | null;
  /** Why tipping can't work with this mint, or null. */
  problem: string | null;
};

/**
 * Checks the token's settings (Token-2022 "extensions"). Tipping refuses mints whose transfers need extra
 * programs (transfer hook), can't move at all (non-transferable, paused) or land in frozen accounts. A transfer fee
 * is supported: the tip transaction includes it.
 */
export function describeMint(mint: Mint, programId: PublicKey): MintInfo {
  let problem: string | null = null;
  if (getNonTransferable(mint)) problem = "This token can't be transferred.";
  else if (getTransferHook(mint)) problem = "This token uses a transfer hook, which tipping doesn't support yet.";
  else if (getDefaultAccountState(mint)?.state === AccountState.Frozen)
    problem = "New accounts for this token start frozen, so tips couldn't be received.";
  else if (getPausableConfig(mint)?.paused) problem = "Transfers of this token are paused.";
  return { programId, decimals: mint.decimals, transferFee: getTransferFeeConfig(mint), problem };
}

// ─────────────────────────────── transactions ───────────────────────────────

export type TipTransactionInput = {
  mint: PublicKey;
  mintInfo: MintInfo;
  payer: PublicKey;
  recipient: PublicKey;
  amount: bigint;
  reference: PublicKey;
  memo: string;
  recentBlockhash: string;
  epoch: bigint;
};

function memoInstruction(text: string, signer?: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: signer ? [{ pubkey: signer, isSigner: true, isWritable: false }] : [],
    data: Buffer.from(text, "utf8"),
  });
}

/**
 * The tip: create the recipient's token account if they don't have one yet (the tipper pays its small rent, about
 * 0.002 SOL, once), then a checked transfer from the tipper's account, then a memo. The Solana Pay `reference` is
 * attached to the transfer so the server can find the transaction afterwards. Returns the unsigned transaction.
 */
export function buildTipTransaction(input: TipTransactionInput): { transaction: Transaction; fee: bigint } {
  const { mint, mintInfo, payer, recipient, amount } = input;
  const programId = mintInfo.programId;
  const source = getAssociatedTokenAddressSync(mint, payer, false, programId);
  const destination = getAssociatedTokenAddressSync(mint, recipient, false, programId);
  const fee = mintInfo.transferFee ? calculateEpochFee(mintInfo.transferFee, input.epoch, amount) : 0n;
  const transfer = mintInfo.transferFee
    ? createTransferCheckedWithFeeInstruction(source, mint, destination, payer, amount, mintInfo.decimals, fee, [], programId)
    : createTransferCheckedInstruction(source, mint, destination, payer, amount, mintInfo.decimals, [], programId);
  transfer.keys.push({ pubkey: input.reference, isSigner: false, isWritable: false });
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: input.recentBlockhash }).add(
    createAssociatedTokenAccountIdempotentInstruction(payer, destination, recipient, mint, programId),
    transfer,
    memoInstruction(input.memo),
  );
  return { transaction, fee };
}

/** Proof of wallet ownership: a memo signed by the wallet. Costs only the network fee (a fraction of a cent). */
export function buildLinkTransaction(payer: PublicKey, memo: string, recentBlockhash: string): Transaction {
  return new Transaction({ feePayer: payer, recentBlockhash }).add(memoInstruction(memo, payer));
}

/** The wire format Solana Pay wallets expect: base64, unsigned. */
export function serializeUnsigned(transaction: Transaction): string {
  return transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

// ─────────────────────────────── checking what landed ───────────────────────────────

export type TipExpectation = {
  mint: string;
  programId: string;
  recipient: string;
  amount: bigint;
  reference: string;
};

type AnyInstruction = ParsedInstruction | PartiallyDecodedInstruction;

function allInstructions(tx: ParsedTransactionWithMeta): AnyInstruction[] {
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((group) => group.instructions);
  return [...tx.transaction.message.instructions, ...inner];
}

/**
 * Whether a transaction is exactly the tip that was asked for: it succeeded, carries the reference, and moves the
 * right amount of the right token into the recipient's account. Anything else (a different amount, another token,
 * a failed transaction) doesn't count. Returns the wallet that paid (whoever approved it in their wallet).
 */
export function checkTipTransaction(
  tx: ParsedTransactionWithMeta | null,
  expect: TipExpectation,
): { ok: true; sender: string } | { ok: false; reason: string } {
  if (!tx) return { ok: false, reason: "Transaction not found." };
  if (tx.meta?.err) return { ok: false, reason: "The transaction failed on chain." };
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  if (!keys.includes(expect.reference)) return { ok: false, reason: "The transaction isn't for this tip." };
  const destination = getAssociatedTokenAddressSync(
    new PublicKey(expect.mint),
    new PublicKey(expect.recipient),
    false,
    new PublicKey(expect.programId),
  ).toBase58();
  const transfer = allInstructions(tx).find((ix): ix is ParsedInstruction => {
    if (!("parsed" in ix) || ix.programId.toBase58() !== expect.programId) return false;
    const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
    if (parsed?.type !== "transferChecked" && parsed?.type !== "transferCheckedWithFee") return false;
    const info = parsed.info ?? {};
    const amount = (info.tokenAmount as { amount?: string } | undefined)?.amount;
    return info.mint === expect.mint && info.destination === destination && amount === expect.amount.toString();
  });
  if (!transfer) return { ok: false, reason: "The transaction doesn't match this tip." };
  const info = (transfer.parsed as { info: Record<string, unknown> }).info;
  return { ok: true, sender: String(info.authority ?? info.multisigAuthority ?? "") };
}

// ─────────────────────────────── the chain ───────────────────────────────

/** Everything the tipping flows need from Solana. The real one talks to RPC; tests use a fake. */
export interface KaminoChain {
  /** The KAMINO mint this chain was set up with. */
  readonly mint: PublicKey;
  mintInfo(): Promise<MintInfo>;
  latest(): Promise<{ blockhash: string; epoch: bigint }>;
  /** Total KAMINO (base units) in all of the owner's token accounts. */
  balance(owner: PublicKey): Promise<bigint>;
  /** The first successful transaction that includes this reference key, if any. */
  findByReference(reference: PublicKey): Promise<string | null>;
  getParsed(signature: string): Promise<ParsedTransactionWithMeta | null>;
  /** A recent successful transaction signed by `signer` whose memo contains `text`. */
  findMemo(signer: PublicKey, text: string): Promise<string | null>;
}

let mintCache: { at: number; mint: string; info: MintInfo } | null = null;
const balanceCache = new Map<string, { at: number; value: bigint }>();

export function rpcChain(config: KaminoConfig): KaminoChain {
  const connection = new Connection(config.rpcUrl, "confirmed");
  return {
    mint: config.mint,
    async mintInfo() {
      if (mintCache && mintCache.mint === config.mint.toBase58() && Date.now() - mintCache.at < 10 * 60_000)
        return mintCache.info;
      const account = await connection.getAccountInfo(config.mint);
      if (!account) throw new Error("The KAMINO token couldn't be found on Solana.");
      const programId = account.owner;
      if (!programId.equals(TOKEN_2022_PROGRAM_ID) && !programId.equals(TOKEN_PROGRAM_ID))
        throw new Error("The configured KAMINO mint isn't a token.");
      const info = describeMint(unpackMint(config.mint, account, programId), programId);
      mintCache = { at: Date.now(), mint: config.mint.toBase58(), info };
      return info;
    },
    async latest() {
      const [{ blockhash }, epochInfo] = await Promise.all([
        connection.getLatestBlockhash("confirmed"),
        connection.getEpochInfo("confirmed"),
      ]);
      return { blockhash, epoch: BigInt(epochInfo.epoch) };
    },
    async balance(owner) {
      const key = owner.toBase58();
      const hit = balanceCache.get(key);
      if (hit && Date.now() - hit.at < 30_000) return hit.value;
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: config.mint });
      let total = 0n;
      for (const { account } of accounts.value) {
        const amount = (account.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } }).parsed?.info
          ?.tokenAmount?.amount;
        if (amount && /^\d+$/.test(amount)) total += BigInt(amount);
      }
      balanceCache.set(key, { at: Date.now(), value: total });
      return total;
    },
    async findByReference(reference) {
      const found = await connection.getSignaturesForAddress(reference, { limit: 10 }, "confirmed");
      const ok = found.filter((s) => !s.err).pop(); // oldest successful one
      return ok?.signature ?? null;
    },
    async getParsed(signature) {
      return connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    },
    async findMemo(signer, text) {
      const recent = await connection.getSignaturesForAddress(signer, { limit: 25 }, "confirmed");
      const hit = recent.find((s) => !s.err && typeof s.memo === "string" && s.memo.includes(text));
      if (!hit) return null;
      // The memo is listed under every account in the transaction: make sure `signer` actually signed it.
      const tx = await connection.getParsedTransaction(hit.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const signed = tx?.transaction.message.accountKeys.some((k) => k.signer && k.pubkey.equals(signer));
      return signed && !tx?.meta?.err ? hit.signature : null;
    },
  };
}
