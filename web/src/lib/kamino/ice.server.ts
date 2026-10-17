/**
 * Network relay ("TURN") settings for voice, video and screen sharing (server-only).
 *
 * Calls go straight between two devices when they can. On strict networks (some offices, schools
 * and mobile carriers) that direct route is blocked, and the call needs a relay server to pass the
 * audio and video along. Free public STUN servers are always included; a relay is added when you
 * set one of these in the server's environment (see DEPLOY.md, "Voice and video on strict networks"):
 *
 *   KAMINO_TURN_URLS         turn:turn.example.com:3478,turns:turn.example.com:5349
 *   KAMINO_TURN_SECRET       the shared secret of a coturn server using `use-auth-secret`
 *                            (short-lived passwords are made for each person: recommended)
 *   ...or instead...
 *   KAMINO_TURN_USERNAME / KAMINO_TURN_CREDENTIAL   one fixed login (Twilio, Metered, and similar services)
 *   ...or instead (easiest, 1,000 GB a month free)...
 *   KAMINO_CF_TURN_KEY_ID / KAMINO_CF_TURN_API_TOKEN  a Cloudflare Realtime TURN key (dash.cloudflare.com →
 *                            Realtime → TURN Server → Create). The server asks Cloudflare for logins that last
 *                            a day and hands them to signed-in members.
 *
 * The relay's password never appears in the app's code: signed-in people ask the server for it.
 */
import { createHmac } from "node:crypto";

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN: IceServer = { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] };
const CREDENTIAL_LIFETIME_SECONDS = 6 * 60 * 60;

type Env = Record<string, string | undefined>;

export function buildIceServers(env: Env, userId: string, nowMs: number = Date.now()): IceServer[] {
  const urls = (env.KAMINO_TURN_URLS ?? "").split(",").map((u) => u.trim()).filter((u) => /^turns?:/i.test(u));
  if (!urls.length) return [STUN];

  const secret = env.KAMINO_TURN_SECRET?.trim();
  if (secret) {
    // The standard "time-limited credentials" scheme understood by coturn's `use-auth-secret`.
    const username = `${Math.floor(nowMs / 1000) + CREDENTIAL_LIFETIME_SECONDS}:${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const credential = createHmac("sha1", secret).update(username).digest("base64");
    return [STUN, { urls, username, credential }];
  }
  const username = env.KAMINO_TURN_USERNAME?.trim();
  const credential = env.KAMINO_TURN_CREDENTIAL?.trim();
  if (username && credential) return [STUN, { urls, username, credential }];
  return [STUN]; // URLs without a login would only fail, so do not offer them
}

/** What `fetch` needs to look like here (injected in tests). */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Cloudflare logins last a day; a fresh set is fetched once fewer than six hours are left. */
const CF_TTL_SECONDS = 24 * 60 * 60;
const CF_REFRESH_BEFORE_MS = 6 * 60 * 60 * 1000;
let cfCache: { key: string; servers: IceServer[]; expiresAt: number } | null = null;
export const resetIceCache = () => {
  cfCache = null;
};

/** Keeps only usable STUN/TURN addresses. Port 53 is blocked by browsers and would only slow the call down. */
function cleanCloudflareServers(raw: unknown): IceServer[] {
  const list = (raw as { iceServers?: unknown })?.iceServers;
  const out: IceServer[] = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const e = entry as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = (Array.isArray(e.urls) ? e.urls : [e.urls])
      .filter((u): u is string => typeof u === "string" && /^(stun|turns?):/i.test(u) && !/:53(\?|$)/.test(u));
    if (!urls.length) continue;
    if (urls.some((u) => /^turns?:/i.test(u))) {
      if (typeof e.username !== "string" || typeof e.credential !== "string") continue;
      out.push({ urls, username: e.username, credential: e.credential });
    } else out.push({ urls });
  }
  return out;
}

/**
 * The ICE servers for one member's call. With a Cloudflare TURN key, asks Cloudflare for a relay login (cached for
 * the whole server, refreshed well before it expires); if Cloudflare can't be reached the other settings are used, so
 * a relay hiccup never stops a call from being tried.
 */
export async function iceServersFor(
  env: Env,
  userId: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  nowMs: number = Date.now(),
): Promise<IceServer[]> {
  const keyId = env.KAMINO_CF_TURN_KEY_ID?.trim();
  const token = env.KAMINO_CF_TURN_API_TOKEN?.trim();
  if (keyId && token && /^[A-Za-z0-9_-]+$/.test(keyId)) {
    if (cfCache && cfCache.key === keyId && cfCache.expiresAt - nowMs > CF_REFRESH_BEFORE_MS) return cfCache.servers;
    try {
      const res = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: CF_TTL_SECONDS }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const servers = cleanCloudflareServers(await res.json());
        if (servers.some((sv) => sv.username)) {
          const withStun = servers.some((sv) => !sv.username) ? servers : [STUN, ...servers];
          cfCache = { key: keyId, servers: withStun, expiresAt: nowMs + CF_TTL_SECONDS * 1000 };
          return withStun;
        }
      } else console.warn(`[ice] Cloudflare TURN answered ${res.status}`);
    } catch (error) {
      console.warn("[ice] Cloudflare TURN unavailable; calls fall back to direct connections", error);
    }
    // A still-valid older login beats none.
    if (cfCache && cfCache.key === keyId && cfCache.expiresAt > nowMs + 60_000) return cfCache.servers;
  }
  return buildIceServers(env, userId, nowMs);
}
