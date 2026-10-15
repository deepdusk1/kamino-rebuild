/**
 * Calls and live rooms through the LiveKit SFU, exposed to the website and the phone app over the RPC registry.
 * All of them refuse cleanly when LiveKit is not configured; calls then use the peer-to-peer mesh. Recording also
 * needs object storage (the S3/R2 bucket media uses).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware } from "@/lib/auth/middleware";

type Row = Record<string, unknown>;
import { asBool } from "./map";
import { canModerate } from "./safety";
import { internals } from "./server";
import { EncodedFileOutput, EncodedFileType, S3Upload } from "livekit-server-sdk";
import {
  LIVE_ROOM_KINDS,
  createLiveKitToken,
  liveKitClients,
  liveKitConfig,
  liveKitRoomName,
  loadLiveKitRole,
} from "./livekit.server";

type Authed = { userId: string };
const idSchema = z.number().int().positive();

/**
 * A short-lived token for joining a room's call through LiveKit, or `enabled:false` when LiveKit is not configured.
 *
 * Checked first: the account is in good standing and 18+, the person is a member of the room (and of its
 * community), the room has calls, and a live room has started and isn't locked to them. The token's speaking rights
 * follow their stage role (see `liveKitRoleFor`).
 */
export const getLiveKitJoin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const config = liveKitConfig();
    if (!config) return { enabled: false as const };
    const sql = await internals.db();
    const { userId } = context as Authed;
    await internals.assertAccountAllowed(sql, userId);
    await internals.requireMinAge(sql, userId);
    const room = await internals.requireRoomAccess(sql, userId, roomId);
    const kind = String(room.kind);
    if (!(LIVE_ROOM_KINDS as readonly string[]).includes(kind))
      throw new Error("This conversation does not have calls.");
    if (kind !== "dm" && kind !== "group") {
      if (room.scheduled_at && new Date(String(room.scheduled_at)).getTime() > Date.now())
        throw new Error("This live room has not started yet.");
      if (asBool(room.locked) && room.created_by !== userId) {
        const cohost =
          (await sql`select 1 from room_cohosts where room_id = ${roomId} and user_id = ${userId}`).length > 0;
        const membership = room.community_id
          ? await internals.membershipOf(sql, userId, String(room.community_id))
          : null;
        if (!cohost && !(membership?.status === "active" && canModerate(membership.role)))
          throw new Error("This room is locked.");
      }
    }
    const role = await loadLiveKitRole(sql, roomId, userId);
    if (!role) throw new Error("Join the room first.");
    const name = (await sql<Row>`select display_name from profiles where user_id = ${userId}`)[0];
    const token = await createLiveKitToken(
      config,
      liveKitRoomName(roomId),
      userId,
      String(name?.display_name ?? "Member"),
      role,
    );
    return { enabled: true as const, url: config.url, token, room: liveKitRoomName(roomId), role };
  });

const HOST_ONLY = async (sql: Awaited<ReturnType<typeof internals.db>>, userId: string, roomId: number) => {
  const room = await internals.requireRoomAccess(sql, userId, roomId);
  const isHost =
    room.created_by === userId ||
    (await sql`select 1 from room_cohosts where room_id = ${roomId} and user_id = ${userId}`).length > 0;
  if (!isHost) throw new Error("Only the host can manage recordings.");
  return room;
};

export const startRoomRecording = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const config = liveKitConfig();
    if (!config) throw new Error("Recordings need the media server (LiveKit) to be configured.");
    const sql = await internals.db();
    const { userId } = context as Authed;
    await HOST_ONLY(sql, userId, roomId);
    const { s3ConfigFrom } = await import("./media-store.server");
    const storage = s3ConfigFrom(process.env);
    if (!storage) throw new Error("Recordings need file storage (the KAMINO_S3_* settings) to be configured.");
    const { egress } = liveKitClients(config);
    const active = (await sql<Row>`
      select id from room_recordings where room_id = ${roomId} and state = 'recording' limit 1`)[0];
    if (active) throw new Error("This room is already recording.");
    // LiveKit uploads the finished file straight into Kamino's bucket, where the media store can read it back.
    const filepath = `recordings/${roomId}/${crypto.randomUUID()}.mp4`;
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: {
        case: "s3",
        value: new S3Upload({
          accessKey: storage.accessKeyId,
          secret: storage.secretAccessKey,
          region: storage.region,
          endpoint: storage.endpoint.toString(),
          bucket: storage.bucket,
          forcePathStyle: storage.pathStyle,
        }),
      },
    });
    const result = await egress.startRoomCompositeEgress(liveKitRoomName(roomId), output, { layout: "speaker" });
    const inserted = await sql`
      insert into room_recordings(room_id, started_by, egress_id, state, storage_ref)
      values(${roomId}, ${userId}, ${String(result.egressId ?? "")}, 'recording', ${`s3:${filepath}|video/mp4`})
      returning id`;
    // Consent notice, in the transcript: everyone present is told, and late joiners can see it.
    await sql`
      insert into messages(room_id, author_user_id, body)
      values(${roomId}, ${userId}, '⚠️ This room is now being recorded. By staying you agree to it.')`;
    return { id: Number(inserted[0]!.id) };
  });

export const stopRoomRecording = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const config = liveKitConfig();
    if (!config) throw new Error("Recordings need the media server (LiveKit) to be configured.");
    const sql = await internals.db();
    const { userId } = context as Authed;
    await HOST_ONLY(sql, userId, roomId);
    const row = (await sql<Row>`
      select id, egress_id from room_recordings where room_id = ${roomId} and state = 'recording'
      order by id desc limit 1`)[0];
    if (!row) throw new Error("This room is not recording.");
    const { egress } = liveKitClients(config);
    // The file was planned when the recording started; LiveKit finishes uploading it a few seconds after stopping.
    const stopped = await egress.stopEgress(String(row.egress_id)).then(() => true, () => false);
    await sql`update room_recordings set state = ${stopped ? "ready" : "failed"}, ended_at = now()
      where id = ${Number(row.id)}`;
    await sql`
      insert into messages(room_id, author_user_id, body)
      values(${roomId}, ${userId}, 'Recording ended.')`;
    return { ok: true, ready: stopped };
  });

/** Whether the room is recording right now — the stage shows a consent banner while true. */
export const getRoomRecordingState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await internals.requireRoomAccess(sql, userId, roomId);
    const row = (
      await sql`select 1 from room_recordings where room_id = ${roomId} and state = 'recording' limit 1`
    )[0];
    return { recording: Boolean(row) };
  });

export const listRoomRecordings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await internals.requireRoomAccess(sql, userId, roomId);
    const rows = await sql<Row>`
      select id, state, created_at, ended_at from room_recordings
      where room_id = ${roomId} and state <> 'recording' order by id desc limit 30`;
    return {
      recordings: rows.map((row) => ({
        id: Number(row.id),
        state: String(row.state),
        createdAt: String(row.created_at),
      })),
    };
  });

/** Streams a recording to members of the room (audio/video file bytes). */
export const getRecordingFile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: recordingId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const row = (await sql<Row>`select room_id, storage_ref, state from room_recordings where id = ${recordingId}`)[0];
    if (!row || row.state !== "ready" || !row.storage_ref) throw new Error("That recording is not ready.");
    await internals.requireRoomAccess(sql, userId, Number(row.room_id));
    const { loadMedia } = await import("./media-store.server");
    return { dataUrl: await loadMedia(String(row.storage_ref)) };
  });
