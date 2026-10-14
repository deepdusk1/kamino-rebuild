import assert from "node:assert/strict";
import { test } from "node:test";
import { appHrefFromServerHref } from "./hrefs.ts";

test("server links map to app screens", () => {
  assert.equal(appHrefFromServerHref("/c/starlight/p/12"), "/community/starlight/post/12");
  assert.equal(appHrefFromServerHref("/c/starlight/mod"), "/community/starlight/mod");
  assert.equal(appHrefFromServerHref("/c/starlight"), "/community/starlight");
  assert.equal(appHrefFromServerHref("/chats/7"), "/chat/7");
  assert.equal(appHrefFromServerHref("/c/starlight/roleplay/5"), "/community/starlight/roleplay/5");
  assert.equal(appHrefFromServerHref("/chats/7?call=1"), "/call/7", "a ringing call opens the call screen");
  assert.equal(appHrefFromServerHref("/u/mira"), "/profile/mira");
  assert.equal(appHrefFromServerHref("/invite/abc-def?from=notification"), "/invite/abc-def");
  assert.equal(appHrefFromServerHref("/discover-plus"), "/tools?tab=discovery");
  assert.equal(appHrefFromServerHref("/safety"), "/safety");
  assert.equal(appHrefFromServerHref("/admin/safety"), "/safety");
  assert.equal(appHrefFromServerHref("/admin/reports"), "/safety");
  assert.equal(appHrefFromServerHref("/something-else"), "/notifications");
});
