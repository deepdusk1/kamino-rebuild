/**
 * LiveKit integration: a real SFU (Selective Forwarding Unit) for live rooms, activating large
 * stages, host-side publishing enforcement, and room recordings via room-composite egress.
 *
 * Dormant until `KAMINO_LIVEKIT_URL`, `KAMINO_LIVEKIT_API_KEY` and `KAMINO_LIVEKIT_API_SECRET`
 * are set. When configured, the web stage mints a join token per member (server-enforced roles:
 * only hosts/co-hosts/speakers may publish) and connects media through LiveKit instead of the
 * peer-to-peer mesh, while watch-party sync keeps riding the P2P data channels. Recordings need
 * object storage (the same S3/R2 bucket as media) for the egress output.
 */
import { AccessToken, EgressClient, RoomServiceClient } from "livekit-server-sdk";

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string };

export function liveKitConfig(env: Record<string, string | undefined> = process.env): LiveKitConfig | null {
  const url = env.KAMINO_LIVEKIT_URL?.trim() ?? "";
  const apiKey = env.KAMINO_LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = env.KAMINO_LIVEKIT_API_SECRET?.trim() ?? "";
  return url.startsWith("wss://") && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

function clients(config: LiveKitConfig) {
  return {
    rooms: new RoomServiceClient(config.url, config.apiKey, config.apiSecret),
    egress: new EgressClient(config.url, config.apiKey, config.apiSecret),
  };
}

type StageRole = "host" | "speaker" | "listener";

/** Mints a join token with server-enforced publish rights matching the member's stage role. */
export function createLiveKitToken(config: LiveKitConfig, room: string, identity: string, name: string, role: StageRole): Promise<string> {
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    ttl: 60 * 60 * 12,
    metadata: JSON.stringify({ role }),
  });
  token.addGrant({
    room,
    roomJoin: true,
    canPublish: role === "host" || role === "speaker",
    canPublishData: true,
    canSubscribe: true,
    roomList: false,
    roomRecord: role === "host",
  });
  return token.toJwt();
}

export { clients as liveKitClients };
