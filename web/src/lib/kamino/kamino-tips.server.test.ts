import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { Keypair, PublicKey, Transaction, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, type TransferFeeConfig } from "@solana/spl-token";
import type { Sql } from "../db";
import {
  MEMO_PROGRAM_ID,
  buildTipTransaction,
  checkTipTransaction,
  formatTokenAmount,
  kaminoConfig,
  parseTokenAmount,
  parseWalletAddress,
  type KaminoChain,
  type MintInfo,
} from "./kamino-chain.server.ts";
import {
  confirmTip,
  confirmWalletLink,
  linkMemo,
  listTips,
  startTip,
  startWalletLink,
  tipTransaction,
  walletLinkTransaction,
  walletOf,
} from "./kamino-tips.server.ts";

// ───────────────────────── pure helpers ─────────────────────────

test("amounts: plain decimals only, never more precision than the token has", () => {
  assert.equal(parseTokenAmount("12.5", 6), 12_500_000n);
  assert.equal(parseTokenAmount("1", 6), 1_000_000n);
  assert.equal(parseTokenAmount("0.000001", 6), 1n);
  for (const bad of ["0", "0.0", "-1", "1e3", "1,000", "1.0000001", "", " ", "abc", "1.", ".5"])
    assert.equal(parseTokenAmount(bad, 6), null, bad);
  assert.equal(formatTokenAmount(1_234_567_890_000n, 6), "1,234,567.89");
  assert.equal(formatTokenAmount(12_500_000n, 6), "12.5");
  assert.equal(formatTokenAmount(1_000_000_000n * 10n ** 6n, 6), "1,000,000,000");
  assert.equal(formatTokenAmount(1n, 6), "0.000001");
});

test("wallet addresses must be real Solana keys", () => {
  const key = Keypair.generate().publicKey.toBase58();
  assert.equal(parseWalletAddress(key)?.toBase58(), key);
  assert.equal(parseWalletAddress("not-an-address"), null);
  assert.equal(parseWalletAddress(key + "x"), null);
  assert.equal(parseWalletAddress(42), null);
  // A program-derived address can't sign for a token account, so it isn't accepted as a wallet.
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("x")], TOKEN_2022_PROGRAM_ID);
  assert.equal(parseWalletAddress(pda.toBase58()), null);
});

test("tipping stays off until it is switched on with an https RPC and server address", () => {
  assert.equal(kaminoConfig({}), null);
  assert.equal(kaminoConfig({ KAMINO_TOKEN_ENABLED: "true", KAMINO_SOLANA_RPC_URL: "http://x", BETTER_AUTH_URL: "https://k.example" }), null);
  const config = kaminoConfig({ KAMINO_TOKEN_ENABLED: "true", KAMINO_SOLANA_RPC_URL: "https://rpc.example", BETTER_AUTH_URL: "https://k.example/" });
  assert.equal(config?.mint.toBase58(), "4JpdAMKg9xoiT2rrtZQdpgnRK6AKBERLxzytwLkV2VMH");
  assert.equal(config?.publicUrl, "https://k.example");
  assert.equal(config?.tipsOnIosPosts, false);
});

const MINT = new PublicKey("4JpdAMKg9xoiT2rrtZQdpgnRK6AKBERLxzytwLkV2VMH");
const MINT_INFO: MintInfo = { programId: TOKEN_2022_PROGRAM_ID, decimals: 6, transferFee: null, problem: null };
const BLOCKHASH = Keypair.generate().publicKey.toBase58();

test("the tip transaction: create the recipient's account if needed, a checked Token-2022 transfer, a memo", () => {
  const payer = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const reference = Keypair.generate().publicKey;
  const { transaction, fee } = buildTipTransaction({
    mint: MINT,
    mintInfo: MINT_INFO,
    payer,
    recipient,
    amount: 5_000_000n,
    reference,
    memo: "Kamino tip #1",
    recentBlockhash: BLOCKHASH,
    epoch: 700n,
  });
  assert.equal(fee, 0n);
  assert.equal(transaction.feePayer?.toBase58(), payer.toBase58());
  const [createAta, transfer, memo] = transaction.instructions;
  assert.equal(transaction.instructions.length, 3);
  assert.equal(createAta!.programId.toBase58(), "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  assert.equal(transfer!.programId.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58());
  assert.equal(transfer!.data[0], 12, "TransferChecked");
  assert.equal(transfer!.data.readBigUInt64LE(1), 5_000_000n);
  const destination = getAssociatedTokenAddressSync(MINT, recipient, false, TOKEN_2022_PROGRAM_ID);
  assert.ok(transfer!.keys.some((k) => k.pubkey.equals(destination)));
  assert.ok(transfer!.keys.some((k) => k.pubkey.equals(reference) && !k.isSigner), "reference attached");
  assert.equal(memo!.programId.toBase58(), MEMO_PROGRAM_ID.toBase58());
  assert.equal(memo!.data.toString(), "Kamino tip #1");
  // Only the tipper signs.
  assert.deepEqual(
    transaction.compileMessage().accountKeys.slice(0, transaction.compileMessage().header.numRequiredSignatures).map((k) => k.toBase58()),
    [payer.toBase58()],
  );
});

test("a token with a transfer fee gets the fee-aware transfer, with the fee worked out for the epoch", () => {
  const transferFee: TransferFeeConfig = {
    transferFeeConfigAuthority: PublicKey.default,
    withdrawWithheldAuthority: PublicKey.default,
    withheldAmount: 0n,
    olderTransferFee: { epoch: 0n, maximumFee: 1_000_000n, transferFeeBasisPoints: 100 },
    newerTransferFee: { epoch: 0n, maximumFee: 1_000_000n, transferFeeBasisPoints: 100 },
  };
  const { transaction, fee } = buildTipTransaction({
    mint: MINT,
    mintInfo: { ...MINT_INFO, transferFee },
    payer: Keypair.generate().publicKey,
    recipient: Keypair.generate().publicKey,
    amount: 10_000_000n,
    reference: Keypair.generate().publicKey,
    memo: "m",
    recentBlockhash: BLOCKHASH,
    epoch: 1n,
  });
  assert.equal(fee, 100_000n, "1% of 10 KAMINO");
  assert.equal(transaction.instructions[1]!.data[0], 26, "TransferFeeExtension");
});

/** A parsed transaction like the RPC returns, moving `amount` into `recipient`'s KAMINO account. */
function parsedTip(o: { sender: PublicKey; recipient: PublicKey; reference: string; amount: bigint; mint?: PublicKey; err?: unknown }) {
  const mint = o.mint ?? MINT;
  const destination = getAssociatedTokenAddressSync(mint, o.recipient, false, TOKEN_2022_PROGRAM_ID);
  return {
    slot: 1,
    blockTime: 1,
    meta: { err: o.err ?? null, fee: 5000, innerInstructions: [], preBalances: [], postBalances: [] },
    transaction: {
      signatures: ["sig"],
      message: {
        accountKeys: [o.sender, destination, new PublicKey(o.reference)].map((pubkey, i) => ({
          pubkey,
          signer: i === 0,
          writable: i < 2,
        })),
        instructions: [
          {
            programId: TOKEN_2022_PROGRAM_ID,
            program: "spl-token",
            parsed: {
              type: "transferChecked",
              info: {
                authority: o.sender.toBase58(),
                destination: destination.toBase58(),
                mint: mint.toBase58(),
                source: "src",
                tokenAmount: { amount: o.amount.toString(), decimals: 6 },
              },
            },
          },
        ],
        recentBlockhash: BLOCKHASH,
      },
    },
  } as unknown as ParsedTransactionWithMeta;
}

test("only the exact tip counts: right token, right account, right amount, with the reference, and successful", () => {
  const sender = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const reference = Keypair.generate().publicKey.toBase58();
  const expect = { mint: MINT.toBase58(), programId: TOKEN_2022_PROGRAM_ID.toBase58(), recipient: recipient.toBase58(), amount: 7n, reference };
  assert.deepEqual(checkTipTransaction(parsedTip({ sender, recipient, reference, amount: 7n }), expect), { ok: true, sender: sender.toBase58() });
  assert.equal(checkTipTransaction(parsedTip({ sender, recipient, reference, amount: 6n }), expect).ok, false, "wrong amount");
  assert.equal(checkTipTransaction(parsedTip({ sender, recipient: sender, reference, amount: 7n }), expect).ok, false, "wrong recipient");
  assert.equal(
    checkTipTransaction(parsedTip({ sender, recipient, reference, amount: 7n, mint: Keypair.generate().publicKey }), expect).ok,
    false,
    "another token",
  );
  assert.equal(checkTipTransaction(parsedTip({ sender, recipient, reference: Keypair.generate().publicKey.toBase58(), amount: 7n }), expect).ok, false);
  assert.equal(checkTipTransaction(parsedTip({ sender, recipient, reference, amount: 7n, err: { x: 1 } }), expect).ok, false, "failed tx");
  assert.equal(checkTipTransaction(null, expect).ok, false);
});

// ───────────────────────── flows against the real schema ─────────────────────────

const pg = new PGlite();
await pg.waitReady;
const migrations = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, migrations), "utf8"));
after(() => pg.close());
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
  (await pg.query(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)).rows) as Sql;
sql.query = async <T>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows;

let n = 0;
async function person(name: string) {
  const id = `kamino-${name}-${++n}`;
  await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${name},${`${id}@example.test`},true)`;
  await sql`insert into profiles(user_id,handle,display_name,min_age_confirmed_at) values(${id},${id},${name},now())`;
  return id;
}

/** A pretend Solana: memos and references "land" when a test says so. */
function fakeChain() {
  const memos = new Map<string, string>();
  const references = new Map<string, string>();
  const parsed = new Map<string, ParsedTransactionWithMeta | null>();
  const chain: KaminoChain = {
    mint: MINT,
    mintInfo: async () => MINT_INFO,
    latest: async () => ({ blockhash: BLOCKHASH, epoch: 700n }),
    balance: async () => 0n,
    findByReference: async (reference) => references.get(reference.toBase58()) ?? null,
    getParsed: async (signature) => parsed.get(signature) ?? null,
    findMemo: async (signer, text) => (memos.get(signer.toBase58()) === text ? "memo-sig" : null),
  };
  return { chain, memos, references, parsed };
}

const PUBLIC_URL = "https://kamino.example";

test("linking a wallet: the wallet signs a memo with the code; it's linked once that lands, and only to one account", async () => {
  const { chain, memos } = fakeChain();
  const ana = await person("ana");
  const wallet = Keypair.generate().publicKey;
  const { code, url } = await startWalletLink(sql, ana, PUBLIC_URL);
  assert.equal(url, `solana:${encodeURIComponent(`${PUBLIC_URL}/api/solana-pay/link?ref=${code}`)}`);
  const built = await walletLinkTransaction(sql, chain, code, wallet.toBase58());
  const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
  assert.equal(tx.feePayer?.toBase58(), wallet.toBase58());
  assert.equal(tx.instructions[0]!.data.toString(), linkMemo(code));
  assert.equal((await confirmWalletLink(sql, chain, ana, code)).status, "pending");
  memos.set(wallet.toBase58(), linkMemo(code));
  assert.equal((await confirmWalletLink(sql, chain, ana, code)).status, "linked");
  assert.equal((await walletOf(sql, ana))?.address, wallet.toBase58());
  // Someone else can't claim the same wallet.
  const ben = await person("ben");
  const other = await startWalletLink(sql, ben, PUBLIC_URL);
  await assert.rejects(walletLinkTransaction(sql, chain, other.code, wallet.toBase58()), /another Kamino account/);
  await assert.rejects(walletLinkTransaction(sql, chain, other.code, "bogus"), /isn't a Solana wallet/);
});

async function withWallet(name: string) {
  const id = await person(name);
  const address = Keypair.generate().publicKey.toBase58();
  await sql`insert into kamino_wallets(user_id, address) values(${id}, ${address})`;
  return { id, address };
}

test("starting a tip: not yourself, not someone blocked, only to a verified wallet, within the limits", async () => {
  const { chain } = fakeChain();
  const sender = await person("sender");
  const creator = await withWallet("creator");
  const noWallet = await person("nowallet");
  const target = { type: "profile" as const, id: creator.id };
  await assert.rejects(startTip(sql, chain, PUBLIC_URL, { senderId: creator.id, recipientId: creator.id, amount: "5", target }), /yourself/);
  await assert.rejects(startTip(sql, chain, PUBLIC_URL, { senderId: sender, recipientId: noWallet, amount: "5", target }), /wallet/);
  for (const amount of ["0.5", "1000001", "abc", "-3"])
    await assert.rejects(startTip(sql, chain, PUBLIC_URL, { senderId: sender, recipientId: creator.id, amount, target }), /Tips are from 1/, amount);
  const ok = await startTip(sql, chain, PUBLIC_URL, { senderId: sender, recipientId: creator.id, amount: "25.5", target });
  assert.equal(ok.amountLabel, "25.5 KAMINO");
  assert.match(ok.url, /^solana:https%3A%2F%2Fkamino\.example%2Fapi%2Fsolana-pay%2Ftip%3Fref%3D/);
  const blocked = await withWallet("blocked");
  await sql`insert into blocks(blocker_id, blocked_id) values(${blocked.id}, ${sender})`;
  await assert.rejects(startTip(sql, chain, PUBLIC_URL, { senderId: sender, recipientId: blocked.id, amount: "5", target }), /can't tip this person/);
  const { problem: _ignored, ...rest } = MINT_INFO;
  const broken = { ...chain, mintInfo: async () => ({ ...rest, problem: "This token can't be transferred." }) };
  await assert.rejects(startTip(sql, broken, PUBLIC_URL, { senderId: sender, recipientId: creator.id, amount: "5", target }), /can't be transferred/);
});

async function reference(tipId: number) {
  return String((await sql`select reference from kamino_tips where id = ${tipId}`)[0]!.reference);
}

test("a tip is confirmed once its transaction is found and matches; confirming again changes nothing", async () => {
  const { chain, references, parsed } = fakeChain();
  const sender = await person("tipper");
  const creator = await withWallet("artist");
  const { tipId } = await startTip(sql, chain, PUBLIC_URL, { senderId: sender, recipientId: creator.id, amount: "10", target: { type: "post", id: "42" } });
  const ref = await reference(tipId);
  const payer = Keypair.generate().publicKey;
  await assert.rejects(tipTransaction(sql, chain, ref, creator.address, "@artist"), /own wallet/);
  const built = await tipTransaction(sql, chain, ref, payer.toBase58(), "@artist");
  assert.match(built.message, /Tip 10 KAMINO to @artist/);
  assert.equal(Transaction.from(Buffer.from(built.transaction, "base64")).feePayer?.toBase58(), payer.toBase58());
  assert.equal((await confirmTip(sql, chain, tipId)).status, "pending");
  references.set(ref, "tip-sig");
  parsed.set("tip-sig", parsedTip({ sender: payer, recipient: new PublicKey(creator.address), reference: ref, amount: 10_000_000n }));
  const first = await confirmTip(sql, chain, tipId);
  assert.deepEqual([first.status, first.justConfirmed], ["confirmed", true]);
  const again = await confirmTip(sql, chain, tipId);
  assert.deepEqual([again.status, again.justConfirmed], ["confirmed", false]);
  const received = await listTips(sql, creator.id, "received", 6);
  assert.deepEqual(received.map((t) => [t.amount, t.status, t.otherName, t.targetType, t.targetId]), [["10", "confirmed", "tipper", "post", "42"]]);
});

test("a transaction that doesn't match fails the tip; a tip nobody paid expires", async () => {
  const { chain, references, parsed } = fakeChain();
  const sender = await person("cheap");
  const creator = await withWallet("singer");
  const wrong = await startTip(sql, chain, PUBLIC_URL, { senderId: sender, recipientId: creator.id, amount: "10", target: { type: "profile", id: creator.id } });
  const ref = await reference(wrong.tipId);
  references.set(ref, "short-sig");
  parsed.set("short-sig", parsedTip({ sender: Keypair.generate().publicKey, recipient: new PublicKey(creator.address), reference: ref, amount: 1n }));
  assert.equal((await confirmTip(sql, chain, wrong.tipId)).status, "failed");
  const idle = await startTip(sql, chain, PUBLIC_URL, { senderId: sender, recipientId: creator.id, amount: "3", target: { type: "profile", id: creator.id } });
  await sql`update kamino_tips set expires_at = now() - interval '1 minute' where id = ${idle.tipId}`;
  assert.equal((await confirmTip(sql, chain, idle.tipId)).status, "expired");
  await assert.rejects(tipTransaction(sql, chain, await reference(idle.tipId), Keypair.generate().publicKey.toBase58(), "x"), /expired/);
  // The recipient only ever sees confirmed tips; the sender sees all of theirs.
  assert.equal((await listTips(sql, creator.id, "received", 6)).length, 0);
  assert.deepEqual((await listTips(sql, sender, "sent", 6)).map((t) => t.status).sort(), ["expired", "failed"]);
});
