/**
 * Safe RSS/Atom reader for community "feed" modules (server-only).
 *
 * Leaders paste a feed URL and the server fetches it, so this is the one place
 * where user input decides which address our server connects to. To keep that
 * from becoming a way to probe private networks, we:
 *   - allow https only, on the default port,
 *   - resolve the host ourselves and refuse private / loopback / link-local IPs,
 *   - refuse redirects (a redirect could point somewhere private),
 *   - cap the wait time and the download size,
 *   - cache results so a busy community cannot hammer someone else's site.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type FeedItem = { title: string; link: string; publishedAt: string | null; source: string };

const TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;
const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; title: string; items: FeedItem[] }>();

/** True for addresses that must never be fetched from the server. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a.startsWith("::ffff:")) return isPrivateAddress(a.slice(7));
    return a === "::1" || a === "::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80");
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/** Throws a friendly error unless `raw` is a public https URL. Returns the parsed URL. */
export async function assertPublicHttps(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That does not look like a web address.");
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password)
    throw new Error("Feed addresses must start with https://");
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error("Could not find that website.");
  if (addresses.some((a) => isPrivateAddress(a.address)))
    throw new Error("That address is not allowed.");
  return url;
}

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

const stripTags = (s: string) => decodeEntities(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? stripTags(m[1]!) : "";
}

function link(block: string): string {
  const atom = /<link[^>]*?href=["']([^"']+)["'][^>]*>/i.exec(block);
  const raw = atom ? decodeEntities(atom[1]!) : tag(block, "link");
  return /^https?:\/\//i.test(raw) ? raw : "";
}

/** Parse RSS 2.0 or Atom into a flat item list. Deliberately forgiving and dependency-free. */
export function parseFeed(xml: string, source: string): { title: string; items: FeedItem[] } {
  const head = xml.split(/<(?:item|entry)[\s>]/i)[0] ?? "";
  const title = tag(head, "title").slice(0, 120) || source;
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const items = blocks.slice(0, 20).flatMap((block): FeedItem[] => {
    const itemTitle = tag(block, "title").slice(0, 200);
    const itemLink = link(block);
    if (!itemTitle || !itemLink) return [];
    const date = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated");
    const time = date ? new Date(date).getTime() : NaN;
    return [
      { title: itemTitle, link: itemLink, publishedAt: Number.isNaN(time) ? null : new Date(time).toISOString(), source: title },
    ];
  });
  return { title, items };
}

export async function readFeed(rawUrl: string): Promise<{ title: string; items: FeedItem[] }> {
  const cached = cache.get(rawUrl);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;

  const url = await assertPublicHttps(rawUrl);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "user-agent": "KaminoFeedReader/1.0" },
  });
  if (!response.ok) throw new Error("That feed did not respond.");

  // Read at most MAX_BYTES so a huge or endless response cannot exhaust memory.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("That feed was empty.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  void reader.cancel().catch(() => undefined);
  const xml = Buffer.concat(chunks).toString("utf8");
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error("That address is not an RSS or Atom feed.");

  const parsed = parseFeed(xml, url.hostname);
  const entry = { at: Date.now(), ...parsed };
  cache.set(rawUrl, entry);
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return parsed;
}
