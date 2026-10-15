import assert from "node:assert/strict";
import { test } from "node:test";
import { accessLabel, formatPrice, isStripeReceipt, manageSubscriptionNote, orderStatusLabel, phonePurchaseNote } from "./billing-labels.ts";

const later = "2030-03-05T12:00:00.000Z";

test("access says whether it renews, ends or is already over", () => {
  assert.match(accessLabel({ active: true, expiresAt: later, renews: true }), /renews/);
  assert.match(accessLabel({ active: true, expiresAt: later, renews: false }), /ends/);
  assert.match(accessLabel({ active: true, expiresAt: later, renews: null }), /Active until/);
  assert.equal(accessLabel({ active: true, expiresAt: null, renews: null }), "Active");
  assert.equal(accessLabel({ active: false, expiresAt: later, renews: true }), "Ended", "a revoked or lapsed purchase never reads as active");
});

test("order statuses are plain words, unknown ones fall back safely", () => {
  assert.equal(orderStatusLabel("paid"), "Paid");
  assert.equal(orderStatusLabel("refunded"), "Refunded");
  assert.equal(orderStatusLabel("failed"), "Payment failed");
  assert.equal(orderStatusLabel("something-new"), "Processing");
});

test("prices show the amount and currency", () => {
  assert.match(formatPrice(500, "usd"), /5/);
  assert.match(formatPrice(1999, "eur"), /19/);
  assert.match(formatPrice(500, "not-a-currency"), /5\.00 NOT-A-CURRENCY/);
});

test("the phone points to the website for buying and cancelling, and only says test mode in test mode", () => {
  assert.match(phonePurchaseNote("live"), /website/);
  assert.doesNotMatch(phonePurchaseNote("live"), /test/i);
  assert.match(phonePurchaseNote("test"), /test mode/);
  assert.match(phonePurchaseNote("disabled"), /unavailable/);
  assert.match(phonePurchaseNote(undefined), /unavailable/);
  assert.match(manageSubscriptionNote(true) ?? "", /cancel/i);
  assert.match(manageSubscriptionNote(false) ?? "", /won't renew/);
  assert.equal(manageSubscriptionNote(null), null);
});

test("only Stripe receipt pages open", () => {
  assert.equal(isStripeReceipt("https://pay.stripe.com/receipts/payment/abc"), true);
  assert.equal(isStripeReceipt("https://invoice.stripe.com/i/acct/abc"), true);
  for (const bad of ["http://pay.stripe.com/x", "https://pay.stripe.com.evil.example/x", "https://checkout.stripe.com/x", "javascript:alert(1)", ""])
    assert.equal(isStripeReceipt(bad), false, bad);
});
