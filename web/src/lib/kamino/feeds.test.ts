import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateAddress, parseFeed, assertPublicHttps } from "./feeds.server.ts";

test("private, loopback and link-local addresses are recognised", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1"])
    assert.equal(isPrivateAddress(a), true, a);
  for (const a of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34"]) assert.equal(isPrivateAddress(a), false, a);
});

test("only public https addresses are accepted", async () => {
  await assert.rejects(assertPublicHttps("http://example.com/rss"), /https/);
  await assert.rejects(assertPublicHttps("https://example.com:8443/rss"), /https/);
  await assert.rejects(assertPublicHttps("https://user:pw@example.com/rss"), /https/);
  await assert.rejects(assertPublicHttps("https://127.0.0.1/rss"), /not allowed/);
  await assert.rejects(assertPublicHttps("nonsense"), /web address/);
});

test("RSS 2.0 items are parsed, entities decoded and unsafe links dropped", () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>Show &amp; Tell</title>
    <item><title><![CDATA[Episode <b>1</b>]]></title><link>https://ex.com/1</link><pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate></item>
    <item><title>Bad link</title><link>javascript:alert(1)</link></item>
    <item><title>No link</title></item></channel></rss>`;
  const { title, items } = parseFeed(xml, "ex.com");
  assert.equal(title, "Show & Tell");
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "Episode 1");
  assert.equal(items[0]!.publishedAt, "2026-09-01T10:00:00.000Z");
});

test("Atom entries use the href attribute", () => {
  const xml = `<feed><title>Atom</title><entry><title>Hello</title><link rel="alternate" href="https://ex.com/a?x=1&amp;y=2"/><updated>2026-09-02T00:00:00Z</updated></entry></feed>`;
  const { items } = parseFeed(xml, "ex.com");
  assert.equal(items[0]!.link, "https://ex.com/a?x=1&y=2");
});
