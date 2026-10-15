import assert from "node:assert/strict";
import { test } from "node:test";
import { blocksSocialLink } from "./link-guard.ts";

test("Google/Apple are not attached to an unconfirmed password account (pre-registration takeover)", () => {
  assert.equal(blocksSocialLink({ providerId: "google", emailVerified: false, hasPassword: true }), true);
  assert.equal(blocksSocialLink({ providerId: "apple", emailVerified: false, hasPassword: true }), true);
});

test("normal cases still link or sign up", () => {
  assert.equal(blocksSocialLink({ providerId: "google", emailVerified: true, hasPassword: true }), false);
  assert.equal(blocksSocialLink({ providerId: "google", emailVerified: false, hasPassword: false }), false);
  assert.equal(blocksSocialLink({ providerId: "credential", emailVerified: false, hasPassword: true }), false);
});
