import assert from "node:assert/strict";
import { test } from "node:test";
import { rtcPeerId, rtcRoomKey } from "./ids.ts";

test("names for the call service match the website's rules", () => {
  assert.equal(rtcRoomKey(42), "k-live-42");
  assert.match(rtcRoomKey(42), /^k-live-\d+$/); // the server only accepts this shape
  assert.equal(rtcPeerId("user_abc-123"), "user_abc-123");
  assert.equal(rtcPeerId("a b/c.d"), "a_b_c_d");
  assert.equal(rtcPeerId("x".repeat(100)).length, 64);
  assert.equal(rtcPeerId(""), "peer");
});
