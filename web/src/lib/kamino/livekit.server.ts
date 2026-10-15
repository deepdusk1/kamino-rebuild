/**
 * LiveKit integration: a real SFU (Selective Forwarding Unit) for calls and live rooms, with server-enforced
 * speaking rights and room recordings via room-composite egress.
 *
 * Dormant until `KAMINO_LIVEKIT_URL`, `KAMINO_LIVEKIT_API_KEY` and `KAMINO_LIVEKIT_API_SECRET` are set. When
 * configured, the website and the phone app ask for a join token per member and connect through LiveKit instead of
 * the peer-to-peer mesh. Recordings also need object storage (the same S3/R2 bucket as media).
 *
 * Who may speak is decided here, on the server, and written into the token: someone who is only allowed to listen
 * gets a token that cannot publish audio or video, whatever the app does. When a host changes someone's role while
 * they are connected, `syncLiveKitParticipants` updates their rights in LiveKit straight away.
 */
import { AccessToken, EgressClient, RoomServiceClient, WebhookReceiver } from "livekit-server-sdk";
import type { Sql } from "../db";

/** Postgres drivers return booleans as true/false or "t"/"f" depending on the driver. */
const asBool = (v: unknown): boolean => v === true || v === "t" || v === "true" || v === 1;

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string };

export function liveKitConfig(env: Record<string, string | undefined> = process.env): LiveKitConfig | null {
  const url = env.KAMINO_LIVEKIT_URL?.trim() ?? "";
  const apiKey = env.KAMINO_LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = env.KAMINO_LIVEKIT_API_SECRET?.trim() ?? "";
  return url.startsWith("wss://") && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

function clients(config: LiveKitConfig) {
  // The SDK turns the wss:// address into the matching https:// one for its REST calls.
  return {
    rooms: new RoomServiceClient(config.url, config.apiKey, config.apiSecret),
    egress: new EgressClient(config.url, config.apiKey, config.apiSecret),
  };
}

export { clients as liveKitClients };

/** The LiveKit room for a Kamino chat room. Must match `rtcRoomKey` in the phone app and the website. */
export function liveKitRoomName(roomId: number): string {
  return `k-live-${roomId}`;
}

/** The Kamino chat room id inside a LiveKit room name, or null for any other name. */
export function roomIdFromLiveKitRoom(name: string | undefined | null): number | null {
  const match = /^k-live-(\d+)$/.exec(name ?? "");
  return match ? Number(match[1]) : null;
}

export type StageRole = "host" | "speaker" | "listener";

/** Room kinds that have a call or a live stage. */
export const LIVE_ROOM_KINDS = ["dm", "group", "voice", "screening", "public", "private"] as const;

/**
 * Who may speak in a room, using the same rules as the apps' stage screens:
 * - in a DM or a group chat everyone speaks;
 * - the room's creator always hosts; a co-host hosts unless a host muted them;
 * - a member a host muted only listens;
 * - with the stage off everyone speaks; with it on only invited speakers do.
 */
export function liveKitRoleFor(input: {
  kind: string;
  isCreator: boolean;
  isCohost: boolean;
  stageEnabled: boolean;
  stageRole: string;
  hostMuted: boolean;
}): StageRole {
  if (input.kind === "dm" || input.kind === "group") return "speaker";
  if (input.isCreator) return "host";
  if (input.hostMuted) return "listener";
  if (input.isCohost) return "host";
  if (!input.stageEnabled) return "speaker";
  return input.stageRole === "speaker" ? "speaker" : "listener";
}

/**
 * A member's current role in a room's call, read from the database, or null when they are not (or no longer) a
 * member of the room or the room has no call.
 */
export async function loadLiveKitRole(sql: Sql, roomId: number, userId: string): Promise<StageRole | null> {
  const row = (
    await sql.query<Record<string, unknown>>(
      `select r.kind, r.created_by, r.stage_enabled, cm.stage_role, cm.host_muted,
        exists(select 1 from room_cohosts rc where rc.room_id = r.id and rc.user_id = $2) as cohost
      from chat_rooms r join chat_members cm on cm.room_id = r.id and cm.user_id = $2 and cm.room_removed = false
      where r.id = $1`,
      [roomId, userId],
    )
  )[0];
  if (!row || !(LIVE_ROOM_KINDS as readonly string[]).includes(String(row.kind))) return null;
  return liveKitRoleFor({
    kind: String(row.kind),
    isCreator: row.created_by === userId,
    isCohost: asBool(row.cohost),
    stageEnabled: asBool(row.stage_enabled),
    stageRole: String(row.stage_role ?? ""),
    hostMuted: asBool(row.host_muted),
  });
}

/**
 * How long a join token can be used to connect. Kept short so a token that leaks, or belongs to someone who was
 * removed, soon stops working. It only limits joining: a call that is already connected keeps going (LiveKit
 * refreshes the token for connected members on its own), so long calls are not cut off.
 */
export const LIVEKIT_TOKEN_TTL_SECONDS = 10 * 60;

/** Publish rights for a role. Listeners can still hear everyone and send reactions. */
export function permissionFor(role: StageRole) {
  return {
    canPublish: role === "host" || role === "speaker",
    canSubscribe: true,
    canPublishData: true,
  };
}

/** Mints a join token whose publish rights match the member's role. */
export function createLiveKitToken(
  config: LiveKitConfig,
  room: string,
  identity: string,
  name: string,
  role: StageRole,
): Promise<string> {
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    ttl: LIVEKIT_TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({ role }),
  });
  token.addGrant({
    room,
    roomJoin: true,
    ...permissionFor(role),
    roomList: false,
    roomRecord: false,
    // Nobody may rename themselves or change their own metadata (the role lives there).
    canUpdateOwnMetadata: false,
  });
  return token.toJwt();
}

/**
 * Brings connected members' rights in line with the database after a host changes the stage (invites someone to
 * speak, mutes them, removes them, turns the stage on or off). Members who are not connected are skipped; members
 * who may no longer be in the room are disconnected. Never throws: the database change has already happened.
 */
export async function syncLiveKitParticipants(
  sql: Sql,
  roomId: number,
  userIds: string[],
  config: LiveKitConfig | null = liveKitConfig(),
): Promise<void> {
  if (!config || !userIds.length) return;
  const { rooms } = clients(config);
  const room = liveKitRoomName(roomId);
  for (const userId of new Set(userIds)) {
    try {
      const role = await loadLiveKitRole(sql, roomId, userId);
      if (!role) {
        // Also refuses tokens issued before now, so a removed member can't come straight back in.
        await rooms.removeParticipant(room, userId, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) });
        continue;
      }
      await rooms.updateParticipant(room, userId, {
        metadata: JSON.stringify({ role }),
        permission: permissionFor(role),
      });
    } catch {
      // Usually "participant not found": they are not in the call right now. Their next token has the new role.
    }
  }
}

/** Everyone currently marked as in a room's call (used when a stage setting changes for the whole room). */
export async function inVoiceMembers(sql: Sql, roomId: number): Promise<string[]> {
  const rows = await sql.query<{ user_id: string }>(
    `select user_id from chat_members where room_id = $1 and in_voice = true`,
    [roomId],
  );
  return rows.map((r) => String(r.user_id));
}

/** Checks the signature on a LiveKit webhook and returns the event, or null when it isn't genuine. */
export async function readLiveKitWebhook(config: LiveKitConfig, body: string, authorization: string | null) {
  try {
    return await new WebhookReceiver(config.apiKey, config.apiSecret).receive(body, authorization ?? undefined);
  } catch {
    return null;
  }
}
