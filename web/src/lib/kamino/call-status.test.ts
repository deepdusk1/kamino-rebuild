import assert from "node:assert/strict";
import { test } from "node:test";
import { CALL_PHASE_TEXT, callPhase } from "./call-status.ts";

test("an answered call that can't link up says so instead of 'Calling…'", () => {
  assert.equal(callPhase({ connected: 0, joined: 0, noAnswer: false, trouble: false }), "calling");
  assert.equal(callPhase({ connected: 0, joined: 0, noAnswer: true, trouble: false }), "no-answer");
  assert.equal(callPhase({ connected: 0, joined: 1, noAnswer: false, trouble: false }), "connecting");
  assert.equal(callPhase({ connected: 0, joined: 1, noAnswer: true, trouble: true }), "trouble", "someone answered: never 'No answer'");
  assert.equal(callPhase({ connected: 1, joined: 1, noAnswer: false, trouble: true }), "connected");
  assert.equal(CALL_PHASE_TEXT.trouble, "Couldn't connect");
});
