import assert from "node:assert/strict";
import { test } from "node:test";
import { canQuickJoin, joinButtonLabel, joinNeedsApproval } from "./community-join-rules.ts";

test("only open, public communities join with one tap", () => {
  assert.equal(canQuickJoin({ visibility: "public", joinPolicy: "open", joined: false }), true);
  assert.equal(canQuickJoin({ visibility: "public", joined: false }), true, "older servers send no policy: open");
  assert.equal(canQuickJoin({ visibility: "private", joinPolicy: "open", joined: false }), false);
  assert.equal(canQuickJoin({ visibility: "public", joinPolicy: "approval", joined: false }), false, "may have join questions");
  assert.equal(canQuickJoin({ visibility: "public", joinPolicy: "invite", joined: false }), false, "needs an invite code");
  assert.equal(canQuickJoin({ visibility: "public", joinPolicy: "open", joined: false, pending: true }), false);
  assert.equal(canQuickJoin({ visibility: "public", joinPolicy: "open", joined: true }), false);
});

test("approval is needed for private and leader-approval communities", () => {
  assert.equal(joinNeedsApproval({ visibility: "private", joinPolicy: "open" }), true);
  assert.equal(joinNeedsApproval({ visibility: "public", joinPolicy: "approval" }), true);
  assert.equal(joinNeedsApproval({ visibility: "unlisted", joinPolicy: "open" }), false);
});

test("button words", () => {
  assert.equal(joinButtonLabel({ visibility: "public", joinPolicy: "open", joined: true }), "Joined");
  assert.equal(joinButtonLabel({ visibility: "public", joinPolicy: "approval", joined: false, pending: true }), "Requested");
  assert.equal(joinButtonLabel({ visibility: "public", joinPolicy: "invite", joined: false }), "Invite only");
  assert.equal(joinButtonLabel({ visibility: "private", joinPolicy: "open", joined: false }), "Ask to join");
  assert.equal(joinButtonLabel({ visibility: "public", joinPolicy: "open", joined: false }), "Join");
});
