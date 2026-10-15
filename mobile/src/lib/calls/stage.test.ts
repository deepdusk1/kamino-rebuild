import { test } from "node:test";
import assert from "node:assert/strict";
import { canSpeakIn } from "./stage.ts";

const person = (over: Partial<{ role: string; muted: boolean; cohost: boolean }> = {}) => ({
  userId: "me",
  role: "listener",
  muted: false,
  cohost: false,
  ...over,
});

test("with the stage off everyone may speak unless a host muted them", () => {
  assert.equal(canSpeakIn({ enabled: false, participants: [person()] }, "me"), true);
  assert.equal(canSpeakIn({ enabled: false, participants: [person({ muted: true })] }, "me"), false);
});

test("with the stage on only hosts, co-hosts and invited speakers speak", () => {
  assert.equal(canSpeakIn({ enabled: true, participants: [person()] }, "me"), false);
  assert.equal(canSpeakIn({ enabled: true, participants: [person({ role: "speaker" })] }, "me"), true);
  assert.equal(canSpeakIn({ enabled: true, participants: [person({ cohost: true })] }, "me"), true);
  assert.equal(canSpeakIn({ enabled: true, participants: [person({ cohost: true, muted: true })] }, "me"), false);
  assert.equal(canSpeakIn({ enabled: true, participants: [person({ role: "host", muted: true })] }, "me"), true);
});

test("someone not on the stage list can't speak", () => {
  assert.equal(canSpeakIn({ enabled: false, participants: [] }, "me"), false);
});
