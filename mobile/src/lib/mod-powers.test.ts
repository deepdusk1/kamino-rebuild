import assert from "node:assert/strict";
import { test } from "node:test";
import { moderationPowers } from "./mod-powers.ts";

const none = { mute: false, strike: false, curator: false, remove: false, coLeader: false, transfer: false };

test("curators can only mute regular members", () => {
  assert.deepEqual(moderationPowers("curator", "member"), { ...none, mute: true });
  assert.deepEqual(moderationPowers("curator", "curator"), none);
  assert.deepEqual(moderationPowers("curator", "leader"), none);
});

test("co-leaders manage members and curators but not other leaders", () => {
  assert.deepEqual(moderationPowers("leader", "member"), { ...none, mute: true, strike: true, curator: true, remove: true });
  assert.deepEqual(moderationPowers("leader", "curator"), { ...none, mute: true, strike: true, curator: true, remove: true });
  assert.deepEqual(moderationPowers("leader", "leader"), none);
  assert.deepEqual(moderationPowers("leader", "agent"), none);
});

test("the owner appoints co-leaders and can hand over to one", () => {
  assert.deepEqual(moderationPowers("agent", "leader"), { ...none, mute: true, coLeader: true, transfer: true });
  assert.equal(moderationPowers("agent", "member").transfer, false, "make them a co-leader first");
  assert.equal(moderationPowers("agent", "member").coLeader, true);
});

test("regular members have no powers", () => {
  assert.deepEqual(moderationPowers("member", "member"), none);
});
