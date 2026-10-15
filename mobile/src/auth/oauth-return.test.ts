import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthReturnLink, oauthErrorMessage, parseAuthReturn } from "./oauth-return.ts";

test("a successful return carries the flow and its one-time proof", () => {
  assert.deepEqual(parseAuthReturn("kamino://auth-complete?flow=abc&proof=xyz"), { kind: "ok", flowId: "abc", proof: "xyz" });
});

test("a refused sign-in comes back as an error code, not a hang", () => {
  assert.deepEqual(parseAuthReturn("kamino://auth-complete?flow=abc&error=access_denied"), {
    kind: "error",
    flowId: "abc",
    code: "access_denied",
  });
  assert.deepEqual(parseAuthReturn("kamino://auth-complete?flow=abc"), { kind: "error", flowId: "abc", code: "invalid_response" });
  assert.equal(parseAuthReturn("kamino://chat/4"), null);
  assert.equal(parseAuthReturn("https://evil.example/auth-complete?flow=a&proof=b"), null);
});

test("sign-in return links are recognised so the router doesn't open a missing screen", () => {
  for (const link of ["kamino://auth-complete?flow=a&proof=b", "/auth-complete?flow=a", "kamino://captcha-complete?token=t", "/captcha-complete"])
    assert.equal(isAuthReturnLink(link), true, link);
  for (const link of ["/chat/4", "/auth-completed", "kamino://chat/auth-complete-room", "/"])
    assert.equal(isAuthReturnLink(link), false, link);
});

test("error messages are plain and name the provider", () => {
  assert.match(oauthErrorMessage("access_denied", "google"), /cancelled signing in with Google/);
  assert.match(oauthErrorMessage("account_not_linked", "apple"), /already has a Kamino account/);
  assert.match(oauthErrorMessage("something_new", "apple"), /Apple didn't work/);
});
