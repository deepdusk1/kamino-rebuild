import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { buildIceServers } from "./ice.server.ts";

test("without a relay, only the free STUN servers are offered", () => {
  const servers = buildIceServers({}, "u1");
  assert.equal(servers.length, 1);
  assert.ok(!servers.some((s) => s.credential));
});

test("a shared secret makes a short-lived password per person (coturn use-auth-secret)", () => {
  const now = Date.UTC(2026, 8, 29, 12, 0, 0);
  const servers = buildIceServers({ KAMINO_TURN_URLS: "turn:t.example.com:3478, turns:t.example.com:5349", KAMINO_TURN_SECRET: "s3cret" }, "user 1!", now);
  const relay = servers[1]!;
  assert.deepEqual(relay.urls, ["turn:t.example.com:3478", "turns:t.example.com:5349"]);
  const expiry = Math.floor(now / 1000) + 6 * 3600;
  assert.equal(relay.username, `${expiry}:user_1_`);
  assert.equal(relay.credential, createHmac("sha1", "s3cret").update(relay.username!).digest("base64"));
});

test("a fixed login works for hosted relay services", () => {
  const servers = buildIceServers({ KAMINO_TURN_URLS: "turn:relay.example.net:443", KAMINO_TURN_USERNAME: "abc", KAMINO_TURN_CREDENTIAL: "xyz" }, "u1");
  assert.deepEqual(servers[1], { urls: ["turn:relay.example.net:443"], username: "abc", credential: "xyz" });
});

test("a relay address without any login is ignored, and non-turn addresses are dropped", () => {
  assert.equal(buildIceServers({ KAMINO_TURN_URLS: "turn:relay.example.net:443" }, "u1").length, 1);
  assert.equal(buildIceServers({ KAMINO_TURN_URLS: "http://evil.example", KAMINO_TURN_SECRET: "x" }, "u1").length, 1);
});
