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
