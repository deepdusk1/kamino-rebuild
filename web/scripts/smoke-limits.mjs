/**
 * Integration test for abuse throttling. It needs a server that has the limits switched ON,
 * which is the default (the other test suites run against `KAMINO_RATE_LIMIT=off npm run dev`).
 *
 *   npm run dev                 (in one terminal, WITHOUT KAMINO_RATE_LIMIT=off)
 *   npm run test:limits         (in another)
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const base = process.env.TEST_ORIGIN ?? "http://localhost:8080";

async function call(token, name, data) {
  const res = await fetch(`${base}/api/v1/rpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: res.status, ...(await res.json()) };
}
const ok = async (token, name, data) => {
  const r = await call(token, name, data);
  assert.equal(r.error, undefined, `${name} failed: ${r.error?.message}`);
  return r.result;
};

const res = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: process.env.TEST_AUTH_ORIGIN ?? base },
  body: JSON.stringify({ name: "Limits QA", email: `limits-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(16).toString("hex") }),
});
assert.equal(res.status, 200);
const token = res.headers.get("set-auth-token");
await ok(token, "bootstrap", {});
await ok(token, "confirmMinimumAge", { year: 1990, month: 1, day: 1 });

// Creating communities is limited to 6 an hour. Private ones are not capped separately, so the limiter is what answers.
let created = 0;
let refusal = null;
for (let i = 0; i < 8; i += 1) {
  const r = await call(token, "createCommunity", {
    name: `Limit Lab ${randomBytes(3).toString("hex")}`, tagline: "QA", description: "Throttle test", category: "Art",
    visibility: "private", ageGate: 13, rules: "Be kind to each other.",
  });
  if (r.error) { refusal = r; break; }
  created += 1;
}
assert.equal(created, 6, "the first six are allowed");
assert.equal(refusal?.status, 429, "the seventh gets HTTP 429");
assert.match(refusal.error.message, /too fast/i);
console.log("PASS community creation is throttled (6 per hour) with HTTP 429 and a friendly message");

// Comments: 25 a minute.
const hall = (await ok(token, "getMe", {})).joined[0].community.id;
const post = await ok(token, "createPost", { slug: hall, type: "blog", title: "Comment target", body: "hello" });
let allowed = 0;
let stop = null;
for (let i = 0; i < 30; i += 1) {
  const r = await call(token, "addComment", { postId: post.id, body: `comment ${i}` });
  if (r.error) { stop = r; break; }
  allowed += 1;
}
assert.equal(allowed, 25);
assert.equal(stop?.status, 429);
console.log("PASS comments are throttled (25 per minute)");

// Someone else is not affected by this person's limit.
const other = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: process.env.TEST_AUTH_ORIGIN ?? base },
  body: JSON.stringify({ name: "Limits QA 2", email: `limits2-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(16).toString("hex") }),
});
const otherToken = other.headers.get("set-auth-token");
await ok(otherToken, "bootstrap", {});
await ok(otherToken, "confirmMinimumAge", { year: 1990, month: 1, day: 1 });
await ok(otherToken, "createCommunity", {
  name: `Other Lab ${randomBytes(3).toString("hex")}`, tagline: "QA", description: "Second person, own allowance", category: "Art",
  visibility: "private", ageGate: 13, rules: "Be kind to each other.",
});
console.log("PASS limits are per person");
console.log("3 LIMIT GROUPS PASSED");
