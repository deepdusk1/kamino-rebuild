import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { buildIceServers, iceServersFor, resetIceCache, type FetchLike } from "./ice.server.ts";

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

const cfEnv = { KAMINO_CF_TURN_KEY_ID: "key123", KAMINO_CF_TURN_API_TOKEN: "tok" };
const cfReply = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "gen-user", credential: "gen-pass" },
  ],
};

test("a Cloudflare TURN key gets a day-long relay login, cached and without the browser-blocked port 53", async () => {
  resetIceCache();
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const fake: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => cfReply };
  };
  const servers = await iceServersFor(cfEnv, "u1", fake, 1_000_000);
  assert.equal(calls[0]!.url, "https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers");
  assert.equal(calls[0]!.init.headers.authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(calls[0]!.init.body), { ttl: 86400 });
  assert.deepEqual(servers, [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "gen-user", credential: "gen-pass" },
  ]);
  await iceServersFor(cfEnv, "u2", fake, 1_000_000 + 60 * 60 * 1000);
  assert.equal(calls.length, 1, "reused within the day");
  await iceServersFor(cfEnv, "u2", fake, 1_000_000 + 19 * 60 * 60 * 1000);
  assert.equal(calls.length, 2, "refreshed well before it expires");
});

test("if Cloudflare fails, calls still get STUN (or the other relay settings)", async () => {
  resetIceCache();
  const down: FetchLike = async () => { throw new Error("offline"); };
  assert.deepEqual(await iceServersFor(cfEnv, "u1", down), buildIceServers({}, "u1"));
  const refused: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const withCoturn = { ...cfEnv, KAMINO_TURN_URLS: "turn:t.example.com:3478", KAMINO_TURN_USERNAME: "a", KAMINO_TURN_CREDENTIAL: "b" };
  assert.equal((await iceServersFor(withCoturn, "u1", refused)).length, 2);
  assert.deepEqual(await iceServersFor({}, "u1", down), buildIceServers({}, "u1"), "no key: Cloudflare is never called");
});
