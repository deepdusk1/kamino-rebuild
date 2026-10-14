/**
 * Live room SFU operations, exposed to the web app and the phone app over the RPC registry.
 * All of them refuse cleanly when LiveKit is not configured; the stage then keeps using the
 * peer-to-peer mesh. Recording requires object storage in addition to LiveKit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware } from "@/lib/auth/middleware";

type Row = Record<string, unknown>;
import { internals } from "./server";
import { liveKitClients, createLiveKitToken, liveKitConfig } from "./livekit.server";

type Authed = { userId: string };
const idSchema = z.number().int().positive();

function roomKey(roomId: number): string {
  return `k-live-${roomId}`;
}

/** Join information for the SFU stage, or `enabled:false` when LiveKit is not configured. */
export const getLiveKitJoin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const config = liveKitConfig();
    if (!config) return { enabled: false as const };
    const sql = await internals.db();
    const { userId } = context as Authed;
    const room = await internals.requireRoomAccess(sql, userId, roomId);
    const isDm = String(room.kind) === "dm";
    if (!isDm && !["voice", "screening", "public", "private"].includes(String(room.kind)))
      throw new Error("This conversation does not have a live stage.");
    const stage = (await sql<Row>`
      select cm.stage_role, cm.host_muted,
        exists(select 1 from room_cohosts rc where rc.room_id = cm.room_id and rc.user_id = cm.user_id) as cohost
      from chat_members cm where cm.room_id = ${roomId} and cm.user_id = ${userId} and cm.room_removed = false`)[0];
    // DM calls are 1:1 — both sides must be able to publish audio/video through the SFU.
    const role: "host" | "speaker" | "listener" = isDm
      ? "speaker"
      : room.created_by === userId || (stage && Number(stage.cohost) === 1)
        ? "host"
        : String(stage?.stage_role ?? "") === "speaker"
          ? "speaker"
          : "listener";
    const name = (await sql<Row>`select display_name from profiles where user_id = ${userId}`)[0];
    const token = await createLiveKitToken(
      config,
      roomKey(roomId),
      userId,
      String(name?.display_name ?? "Member"),
      role,
    );
    return { enabled: true as const, url: config.url, token, room: roomKey(roomId), role };
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
    const { egress } = liveKitClients(config);
    const active = (await sql<Row>`
      select id from room_recordings where room_id = ${roomId} and state = 'recording' limit 1`)[0];
    if (active) throw new Error("This room is already recording.");
    const filepath = `recordings/${roomId}/${crypto.randomUUID()}.mp4`;
    const result = await egress.startRoomCompositeEgress(roomKey(roomId), {
      file: { filepath, output: { file: { filepath } } },
    } as never, { layout: "speaker" });
    const inserted = await sql`
      insert into room_recordings(room_id, started_by, egress_id, state)
      values(${roomId}, ${userId}, ${String(result.egressId ?? "")}, 'recording') returning id`;
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
    const stopped = await egress.stopEgress(String(row.egress_id)).catch(() => null);
    const file = (stopped as { file?: { location?: string } } | null)?.file?.location ?? "";
    const ref = file.includes("recordings/")
      ? `s3:${file.slice(file.indexOf("recordings/")).split("?")[0]}|video/mp4`
      : "";
    await sql`update room_recordings set state = ${ref ? "ready" : "failed"}, storage_ref = ${ref}, ended_at = now()
      where id = ${Number(row.id)}`;
    await sql`
      insert into messages(room_id, author_user_id, body)
      values(${roomId}, ${userId}, 'Recording ended.')`;
    return { ok: true, ready: Boolean(ref) };
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
    const row = (await sql<Row>`select room_id, storage_ref from room_recordings where id = ${recordingId}`)[0];
    if (!row || !row.storage_ref) throw new Error("That recording is not ready.");
    await internals.requireRoomAccess(sql, userId, Number(row.room_id));
    const { loadMedia } = await import("./media-store.server");
    return { dataUrl: await loadMedia(String(row.storage_ref)) };
  });
