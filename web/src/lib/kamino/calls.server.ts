/**
 * Leaving calls, including the cases where the app never says goodbye.
 *
 * A phone that is switched off, loses signal or has Kamino killed mid-call can't tell the server it left. Two
 * things notice instead, and both end up in `leaveCall`:
 * - LiveKit's webhook (`participant_left`), when calls go through LiveKit (`/api/livekit-webhook`);
 * - the peer-to-peer signalling service, when a phone stops checking in for 30 seconds (signaling.server.ts).
 *
 * Without this, someone who vanished would stay "in the call" forever and the other person's phone could keep
 * ringing or waiting.
 */
import type { Sql } from "../db";
import { publishEvent } from "./events.server.ts";
import { roomIdFromLiveKitRoom } from "./livekit.server.ts";

/** The link call notifications use; the same text the server writes when someone rings. */
export const callHref = (roomId: number) => `/chats/${roomId}?call=1`;

/**
 * Marks someone as no longer in a room's call.
 *
 * The call is over when this was a 1:1 (DM) call, or when nobody is left in it. Then every unanswered ring for the
 * room is marked handled (so phones stop ringing) and the other members get a `call-ended` event (so a call screen
 * that is still open closes).
 *
 * `explicit` is true when the person pressed hang up. A DM call then always ends. When the leave was only noticed
 * (a webhook, a timed-out phone), a DM call ends only if they were actually still in it, so a late notice can't end
 * a newer call.
 */
export async function leaveCall(
  sql: Sql,
  roomId: number,
  userId: string,
  options: { explicit: boolean },
): Promise<{ wasInCall: boolean; callOver: boolean }> {
  const left = await sql.query(
    `update chat_members set in_voice = false where room_id = $1 and user_id = $2 and in_voice = true returning user_id`,
    [roomId, userId],
  );
  const wasInCall = left.length > 0;
  if (wasInCall) publishEvent({ type: "voice", roomId });
  // A noticed leave for someone who wasn't in the call changes nothing (e.g. a late webhook after hang-up).
  if (!wasInCall && !options.explicit) return { wasInCall, callOver: false };
  const room = (await sql.query<{ kind: string }>(`select kind from chat_rooms where id = $1`, [roomId]))[0];
  if (!room) return { wasInCall, callOver: false };
  const remaining = Number(
    (
      await sql.query<{ n: number }>(
        `select count(*)::int as n from chat_members where room_id = $1 and in_voice = true`,
        [roomId],
      )
    )[0]?.n ?? 0,
  );
  const isDm = String(room.kind) === "dm";
  const callOver = remaining === 0 || (isDm && (options.explicit || wasInCall));
  if (!callOver) return { wasInCall, callOver };
  await sql.query(`update notifications set read = true where kind = 'call' and href = $1 and read = false`, [
    callHref(roomId),
  ]);
  if (isDm) {
    // The other person's call ends too (WhatsApp-style); they are marked out of it on the server as well.
    const others = await sql.query<{ user_id: string }>(
      `update chat_members set in_voice = false where room_id = $1 and user_id <> $2 and in_voice = true returning user_id`,
      [roomId, userId],
    );
    if (others.length) publishEvent({ type: "voice", roomId });
  }
  const members = await sql.query<{ user_id: string }>(
    `select user_id from chat_members where room_id = $1 and user_id <> $2 and room_removed = false`,
    [roomId, userId],
  );
  for (const m of members) publishEvent({ type: "call-ended", toUserId: String(m.user_id), roomId });
  return { wasInCall, callOver };
}

/** The parts of a LiveKit webhook event this server uses. */
export type LiveKitWebhookEvent = {
  event?: string;
  room?: { name?: string } | null;
  participant?: { identity?: string } | null;
};

/**
 * Applies a (signature-checked) LiveKit webhook event to who is in which call.
 *
 * `stillConnected` asks LiveKit whether the person is in the room after all: when a phone reconnects, LiveKit can
 * report the old connection leaving after the new one joined, and that must not take them out of the call.
 */
export async function applyLiveKitWebhook(
  sql: Sql,
  event: LiveKitWebhookEvent,
  stillConnected: (room: string, identity: string) => Promise<boolean>,
): Promise<"joined" | "left" | "finished" | "ignored"> {
  const roomName = event.room?.name ?? "";
  const roomId = roomIdFromLiveKitRoom(roomName);
  if (roomId === null) return "ignored";
  const identity = event.participant?.identity ?? "";

  if (event.event === "participant_joined" && identity) {
    const rows = await sql.query(
      `update chat_members set in_voice = true
      where room_id = $1 and user_id = $2 and room_removed = false and in_voice = false returning user_id`,
      [roomId, identity],
    );
    if (rows.length) publishEvent({ type: "voice", roomId });
    return "joined";
  }

  if (event.event === "participant_left" && identity) {
    if (await stillConnected(roomName, identity).catch(() => false)) return "ignored";
    await leaveCall(sql, roomId, identity, { explicit: false });
    return "left";
  }

  if (event.event === "room_finished") {
    const rows = await sql.query(
      `update chat_members set in_voice = false where room_id = $1 and in_voice = true returning user_id`,
      [roomId],
    );
    if (rows.length) publishEvent({ type: "voice", roomId });
    await sql.query(`update notifications set read = true where kind = 'call' and href = $1 and read = false`, [
      callHref(roomId),
    ]);
    return "finished";
  }

  return "ignored";
}
