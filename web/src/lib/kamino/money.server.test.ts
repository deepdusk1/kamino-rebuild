import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import { billingConfig } from "./billing-rules.ts";
import {
  creditCreatorEarnings,
  payOutCreator,
  connectOnboardingUrl,
  reverseCreatorEarnings,
  type StripeRequest,
} from "./money.server.ts";
import {
  applyIdentityVerificationEvent,
  startAgeVerificationSession,
} from "./age-verification.server.ts";

const pg = new PGlite();
await pg.waitReady;
const directory = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(directory).filter((f) => f.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, directory), "utf8"));
after(() => pg.close());
function adapter(run: Sql["query"]) {
  const value = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
    run(strings.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""), values)) as Sql;
  value.query = run;
  return value;
}
const sql = adapter(async <T>(q: string, p: unknown[] = []) => (await pg.query<T>(q, p)).rows);
async function makeDb(): Promise<Sql> {
  const pg = new PGlite();
  await pg.waitReady;
  const directory = new URL("../../../migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter((f) => f.endsWith(".sql")).sort())
    await pg.exec(readFileSync(new URL(file, directory), "utf8"));
  const run = async <T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> => (await pg.query<T>(q, p)).rows;
  const value = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
    run(strings.reduce((q: string, p, i) => q + (i ? `$${i}` : "") + p, ""), values)) as Sql;
  value.query = run;
  after(() => pg.close());
  return value;
}
let sequence = 0;
async function person(db: Sql = sql) {
  const id = `money-${++sequence}`;
  await db`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${`${id}@example.test`},true)`;
  await db`insert into profiles(user_id,handle,display_name,min_age_confirmed_at) values(${id},${id},${id},now())`;
  return id;
}
async function paidOrder(
  db: Sql,
  buyer: string,
  seller: string,
  beneficiary: string,
  minor: number,
  testMode: boolean,
  currency = 'usd',
) {
  const offer = await db<{ id: number }>`insert into creator_offers(owner_id, kind, title, price_minor) values(${seller}, 'tip', 'A tip', ${minor}) returning id`;
  const id = `order-${++sequence}`;
  await db`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode,status,test_mode)
    values(${id},${buyer},${beneficiary},${Number(offer[0]!.id)},${seller},'tip','A tip',${minor},${currency},'payment','paid',${testMode})`;
  return id;
}

test("billing config switches to live only with the explicit mode flag and a live key", () => {
  const base = {
    KAMINO_PAYMENTS_ENABLED: "true",
    KAMINO_BILLING_ORIGIN: "https://app.example.com",
    STRIPE_WEBHOOK_SECRET: "whsec_0123456789abcdef",
  };
  // A live key without the flag stays disabled — a pasted key alone must not flip the platform.
  assert.equal(billingConfig({ ...base, STRIPE_SECRET_KEY: `sk_live_${"a".repeat(24)}` }).mode, "disabled");
  assert.equal(
    billingConfig({ ...base, STRIPE_SECRET_KEY: `sk_live_${"a".repeat(24)}`, KAMINO_BILLING_MODE: "live" }).mode,
    "live",
  );
  // Test mode unchanged.
  assert.equal(billingConfig({ ...base, STRIPE_SECRET_KEY: `sk_test_${"a".repeat(24)}` }).mode, "test");
});

test("completed live orders credit net earnings once; test orders never do", async () => {
  const creator = await person();
  const buyer = await person();
  const liveOrder = await paidOrder(sql, buyer, creator, buyer, 1000, false);
  const testOrder = await paidOrder(sql, buyer, creator, buyer, 1000, true);
  assert.equal(await creditCreatorEarnings(sql, liveOrder, false), true);
  assert.equal(await creditCreatorEarnings(sql, liveOrder, false), false, "credit is idempotent per order");
  assert.equal(await creditCreatorEarnings(sql, testOrder, true), false, "sandbox money is never payable");
  const rows = await sql`select gross_minor, fee_minor, net_minor from creator_earnings`;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0]!.gross_minor), 1000);
  assert.equal(Number(rows[0]!.net_minor), 900, "10% platform fee by default");
});

function liveEnv() {
  process.env.KAMINO_PAYOUT_HOLD_DAYS = "0";
  process.env.STRIPE_SECRET_KEY = `sk_live_${"a".repeat(24)}`;
  process.env.KAMINO_PAYMENTS_ENABLED = "true";
  process.env.KAMINO_BILLING_MODE = "live";
  process.env.KAMINO_BILLING_ORIGIN = "https://app.example.com";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_0123456789abcdef";
}

test("payouts refuse outside live mode and move available earnings to a connected account", async () => {
  const creator = await person();
  const buyer = await person();
  // Outside live mode the payout always refuses, even with earnings waiting.
  process.env.STRIPE_SECRET_KEY = `sk_test_${"a".repeat(24)}`;
  process.env.KAMINO_PAYMENTS_ENABLED = "true";
  process.env.KAMINO_BILLING_ORIGIN = "https://app.example.com";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_0123456789abcdef";
  delete process.env.KAMINO_BILLING_MODE;
  const testOrder = await paidOrder(sql, buyer, creator, buyer, 500, true);
  await creditCreatorEarnings(sql, testOrder, true);
  await assert.rejects(() => payOutCreator(sql, creator), /live billing/);

  liveEnv();
  const liveOrder = await paidOrder(sql, buyer, creator, buyer, 2000, false);
  await creditCreatorEarnings(sql, liveOrder, false);
  const calls: { path: string; data?: URLSearchParams }[] = [];
  const api = (async (path: string, method = "GET", data?: URLSearchParams) => {
    calls.push({ path, data });
    if (path === "/v1/accounts" && method === "POST") return { id: `acct_${sequence}`, payouts_enabled: true };
    if (path.startsWith("/v1/accounts/")) return { id: path.split("/").pop(), payouts_enabled: true };
    if (path === "/v1/transfers") return { id: `tr_${sequence}` };
    throw new Error(`unexpected path ${path}`);
  }) as unknown as StripeRequest;
  const result = await payOutCreator(sql, creator, api);
  assert.equal(result.paidMinor, 1800);
  assert.ok(calls.some((call) => call.path === "/v1/transfers"));
  const payouts = await sql`select amount_minor, state from creator_payouts`;
  assert.equal(Number(payouts[0]!.amount_minor), 1800);
  assert.equal(String(payouts[0]!.state), "paid");
  const left = await sql`select count(*) as n from creator_earnings where state='available' and creator_id=${creator}`;
  assert.equal(Number(left[0]!.n), 0);
  void connectOnboardingUrl;
});

test("age verification mints a session and a verified webhook stamps the profile", async () => {
  const user = await person();
  liveEnv();
  process.env.KAMINO_AGE_VERIFICATION_ENABLED = "true";
  const api = (async (path: string, method = "GET") => {
    if (path === "/v1/identity/verification_sessions" && method === "POST")
      return { id: `vs_${sequence}`, url: "https://verify.stripe.com/session" };
    throw new Error(`unexpected path ${path}`);
  }) as unknown as StripeRequest;
  const session = await startAgeVerificationSession(sql, user, api);
  assert.ok(session.url);
  await applyIdentityVerificationEvent(sql, `vs_${sequence}`, "verified");
  const stamp = await sql`select age_verified_at from profiles where user_id=${user}`;
  assert.ok(stamp[0]!.age_verified_at);
  const rows = await sql`select status from age_verifications where user_id=${user}`;
  assert.equal(String(rows[0]!.status), "verified");
});

test("hold period: fresh earnings are not payable until released", async () => {
  const sql = await makeDb();
  const creator = await person(sql);
  const buyer = await person(sql);
  liveEnv();
  process.env.KAMINO_PAYOUT_HOLD_DAYS = "7";
  const order = await paidOrder(sql, buyer, creator, buyer, 1000, false);
  await creditCreatorEarnings(sql, order, false);
  let holdOver = false;
  const api = (async (path: string) => {
    if (path.startsWith("/v1/accounts")) return { id: "acct_x", payouts_enabled: true };
    if (path === "/v1/transfers") {
      if (!holdOver) throw new Error("provider transfers must not be called during the hold");
      return { id: "tr_after_hold" };
    }
    throw new Error("unexpected provider call during the hold");
  }) as unknown as StripeRequest;
  await assert.rejects(() => payOutCreator(sql, creator, api), /hold period/);
  await sql`update creator_earnings set released_at = now() - interval '1 minute'`;
  holdOver = true;
  const result = await payOutCreator(sql, creator, api);
  assert.equal(result.paidMinor, 900);
});

test("mixed currencies settle separately and never sum across currencies", async () => {
  const sql = await makeDb();
  const creator = await person(sql);
  const buyer = await person(sql);
  liveEnv();
  await creditCreatorEarnings(sql, await paidOrder(sql, buyer, creator, buyer, 900, false, "usd"), false);
  await creditCreatorEarnings(sql, await paidOrder(sql, buyer, creator, buyer, 1800, false, "eur"), false);
  let transfers = 0;
  const api = (async (path: string, method = "GET") => {
    if (path === "/v1/accounts" && method === "POST") return { id: `acct_${sequence}`, payouts_enabled: true };
    if (path.startsWith("/v1/accounts/")) return { id: "acct_x", payouts_enabled: true };
    if (path === "/v1/transfers") {
      transfers += 1;
      return { id: `tr_${transfers}` };
    }
    throw new Error(`unexpected path ${path}`);
  }) as unknown as StripeRequest;
  const first = await payOutCreator(sql, creator, api);
  assert.deepEqual([first.paidMinor, first.currency], [1620, "eur"], "largest balance settles first (net of the 10% fee)");
  const second = await payOutCreator(sql, creator, api);
  assert.deepEqual([second.paidMinor, second.currency], [810, "usd"]);
  const payouts = await sql`select amount_minor, currency from creator_payouts order by id`;
  assert.equal(String(payouts[0]!.currency), "eur");
  assert.equal(String(payouts[1]!.currency), "usd");
  const left = await sql`select count(*) as n from creator_earnings where state = 'available' and creator_id = ${creator}`;
  assert.equal(Number(left[0]!.n), 0);
});

test("earnings credited during an in-flight payout stay available", async () => {
  const sql = await makeDb();
  const creator = await person(sql);
  const buyer = await person(sql);
  liveEnv();
  await creditCreatorEarnings(sql, await paidOrder(sql, buyer, creator, buyer, 1000, false), false);
  const api = (async (path: string, method = "GET") => {
    if (path === "/v1/accounts" && method === "POST") return { id: "acct_x", payouts_enabled: true };
    if (path.startsWith("/v1/accounts/")) return { id: "acct_x", payouts_enabled: true };
    if (path === "/v1/transfers") {
      await creditCreatorEarnings(sql, await paidOrder(sql, buyer, creator, buyer, 500, false), false);
      return { id: "tr_mid" };
    }
    throw new Error(`unexpected path ${path}`);
  }) as unknown as StripeRequest;
  const result = await payOutCreator(sql, creator, api);
  assert.equal(result.paidMinor, 900, "only the reserved rows are paid");
  const states = await sql`select net_minor, state from creator_earnings where creator_id = ${creator} order by id`;
  assert.equal(String(states[0]!.state), "paid");
  assert.equal(Number(states[1]!.net_minor), 450);
  assert.equal(String(states[1]!.state), "available", "mid-flight credit is untouched");
});

test("two same-size payouts each produce their own transfer", async () => {
  const sql = await makeDb();
  const creator = await person(sql);
  const buyer = await person(sql);
  liveEnv();
  await creditCreatorEarnings(sql, await paidOrder(sql, buyer, creator, buyer, 1000, false), false);
  let transfers = 0;
  const api = (async (path: string, method = "GET") => {
    if (path === "/v1/accounts" && method === "POST") return { id: "acct_x", payouts_enabled: true };
    if (path.startsWith("/v1/accounts/")) return { id: "acct_x", payouts_enabled: true };
    if (path === "/v1/transfers") {
      transfers += 1;
      return { id: `tr_${transfers}` };
    }
    throw new Error(`unexpected path ${path}`);
  }) as unknown as StripeRequest;
  await payOutCreator(sql, creator, api);
  await creditCreatorEarnings(sql, await paidOrder(sql, buyer, creator, buyer, 900, false), false);
  const second = await payOutCreator(sql, creator, api);
  assert.equal(second.paidMinor, 810);
  const payouts = await sql`select stripe_transfer_id from creator_payouts order by id`;
  assert.equal(payouts.length, 2);
  assert.notEqual(String(payouts[0]!.stripe_transfer_id), String(payouts[1]!.stripe_transfer_id));
});

test("refunds reverse unreleased earnings; refunds after payout book a negative offset", async () => {
  const sql = await makeDb();
  const creator = await person(sql);
  const buyer = await person(sql);
  liveEnv();
  await creditCreatorEarnings(sql, await paidOrder(sql, buyer, creator, buyer, 600, false), false);
  const refundedEarly = (await sql`select order_id from creator_earnings where creator_id=${creator} limit 1`)[0]!.order_id as string;
  await reverseCreatorEarnings(sql, refundedEarly);
  const after = await sql`select state from creator_earnings where creator_id = ${creator}`;
  assert.equal(String(after[0]!.state), "reversed");

  const paidOrder1 = await paidOrder(sql, buyer, creator, buyer, 1000, false);
  await creditCreatorEarnings(sql, paidOrder1, false);
  const api = (async (path: string, method = "GET") => {
    if (path === "/v1/accounts" && method === "POST") return { id: "acct_x", payouts_enabled: true };
    if (path.startsWith("/v1/accounts/")) return { id: "acct_x", payouts_enabled: true };
    if (path === "/v1/transfers") return { id: "tr_ok" };
    throw new Error(`unexpected path ${path}`);
  }) as unknown as StripeRequest;
  await payOutCreator(sql, creator, api);
  await reverseCreatorEarnings(sql, paidOrder1);
  const rows = await sql`select net_minor, state from creator_earnings where creator_id = ${creator} and order_id = ${paidOrder1} order by net_minor`;
  assert.equal(rows.length, 2, "original credit plus one negative adjustment");
  assert.equal(Number(rows.find((r) => Number(r.net_minor) < 0)!.net_minor), -900);
  const available = await sql`select coalesce(sum(net_minor),0) as n from creator_earnings where creator_id=${creator} and state='available'`;
  assert.equal(Number(available[0]!.n), -900, "balance is negative until the loss is recovered");
  await assert.rejects(() => payOutCreator(sql, creator, api), /No released earnings/);
});

test("an interrupted payout reconciles to paid and never returns earnings to the pool", async () => {
  const sql = await makeDb();
  const creator = await person(sql);
  const buyer = await person(sql);
  liveEnv();
  await creditCreatorEarnings(sql, await paidOrder(sql, buyer, creator, buyer, 1200, false), false);
  await sql`insert into creator_payouts(creator_id, amount_minor, currency, state, stripe_account_id)
    values(${creator}, 1080, 'usd', 'processing', 'acct_x')`;
  const stuckId = Number((await sql`select id from creator_payouts where creator_id=${creator}`)[0]!.id);
  await sql`update creator_earnings set state='reserved', payout_id=${stuckId}`;
  const api = (async (path: string, method = "GET") => {
    if (path === "/v1/accounts" && method === "POST") return { id: "acct_x", payouts_enabled: true };
    if (path.startsWith("/v1/accounts/")) return { id: "acct_x", payouts_enabled: true };
    if (path === "/v1/transfers") return { id: "tr_recovered" };
    throw new Error(`unexpected path ${path}`);
  }) as unknown as StripeRequest;
  await payOutCreator(sql, creator, api);
  const payout = await sql`select state, stripe_transfer_id from creator_payouts where creator_id=${creator} order by id`;
  assert.equal(String(payout[0]!.state), "paid");
  assert.equal(String(payout[0]!.stripe_transfer_id), "tr_recovered");
  const earnings = await sql`select state from creator_earnings where creator_id=${creator}`;
  assert.equal(String(earnings[0]!.state), "paid", "reserved earnings reconcile to paid, never back to available");
});
