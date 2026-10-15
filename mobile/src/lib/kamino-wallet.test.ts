import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanAmountInput, pollUntil, shortAddress } from "./kamino-wallet-pure.ts";

test("typed amounts keep digits and one decimal point, at most 6 decimals", () => {
  assert.equal(cleanAmountInput("12,5"), "12.5");
  assert.equal(cleanAmountInput("1.2345678"), "1.234567");
  assert.equal(cleanAmountInput("abc10"), "10");
  assert.equal(cleanAmountInput("1.2.3"), "1.23");
});

test("addresses are shortened for display", () => {
  assert.equal(shortAddress("4JpdAMKg9xoiT2rrtZQdpgnRK6AKBERLxzytwLkV2VMH"), "4Jpd…V2VMH");
});

test("polling stops when done, and gives up after the timeout", async () => {
  let n = 0;
  assert.equal(await pollUntil(async () => ++n, (v) => v === 3, { everyMs: 1 }), 3);
  assert.equal(await pollUntil(async () => 0, () => false, { everyMs: 1, timeoutMs: 10 }), null);
});
