import { runWithStartContext } from "@tanstack/start-storage-context";
import { serverFnFetcher } from "../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const base = process.env.TEST_ORIGIN ?? "http://localhost:8080";
const moduleText = await (await fetch(base + "/src/lib/kamino/server.ts")).text();
const functions = new Map(
  [
    ...moduleText.matchAll(
      /export const (\w+) = createServerFn\(\{ method: "(GET|POST)" \}\)[\s\S]*?createClientRpc\("([^"]+)"\)/g,
    ),
  ].map((match) => [match[1], { method: match[2], id: match[3] }]),
);
let token = "";
async function rpc(name, data) {
  const fn = functions.get(name);
  assert.ok(fn, name);
  const response = await runWithStartContext({ startOptions: {} }, () =>
    serverFnFetcher(
      base + "/_serverFn/" + fn.id,
      [
        {
          method: fn.method,
          data,
          headers: {
            origin: base,
            "sec-fetch-site": "same-origin",
            authorization: "Bearer " + token,
          },
        },
      ],
      fetch,
    ),
  );
  if (response.error) throw response.error;
  return response.result ?? response;
}
/** New accounts must pass the 13+ birthday check before they can post, join or chat. */
async function confirmAge(bearer) {
  const res = await fetch(base + "/api/v1/rpc/confirmMinimumAge", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + bearer },
    body: JSON.stringify({ data: { year: 1990, month: 1, day: 1 } }),
  });
  assert.equal(res.status, 200, "age check: " + (await res.text()));
}
async function signup() {
  const response = await fetch(base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      name: "Coin QA",
      email: "coin-" + randomBytes(8).toString("hex") + "@example.test",
      password: randomBytes(20).toString("hex"),
    }),
  });
  const account = await response.json();
  assert.equal(response.status, 200, JSON.stringify(account));
  token = account.token;
  const profile = (await rpc("bootstrap")).profile;
  await confirmAge(token);
  return profile;
}

const sender = await signup();
const senderToken = token;
assert.equal((await rpc("getWallet")).balance, 0);
await assert.rejects(() => rpc("tipMember", { targetUserId: sender.userId, amount: 1 }));
const first = await rpc("checkIn");
assert.equal(first.coins, 5);
assert.equal((await rpc("getWallet")).balance, 5);
const second = await rpc("checkIn");
assert.equal(second.already, true);
assert.equal((await rpc("getWallet")).balance, 5);
console.log("PASS daily award is once per UTC day");

const recipient = await signup();
const recipientToken = token;
token = senderToken;
await assert.rejects(() => rpc("tipMember", { targetUserId: recipient.userId, amount: 6 }));
await assert.rejects(() => rpc("tipMember", { targetUserId: recipient.userId, amount: 0 }));
assert.equal((await rpc("getWallet")).balance, 5);
await rpc("tipMember", { targetUserId: recipient.userId, amount: 3 });
assert.equal((await rpc("getWallet")).balance, 2);
token = recipientToken;
const received = await rpc("getWallet");
assert.equal(received.balance, 3);
assert.equal(received.history[0].direction, "in");
token = senderToken;
const sent = await rpc("getWallet");
assert.equal(sent.history[0].direction, "out");
assert.equal(sent.history[0].amount, 3);
console.log("PASS tips debit and credit together, reject overspend, and appear in both ledgers");
console.log("2 WALLET INTEGRATION GROUPS PASSED");
