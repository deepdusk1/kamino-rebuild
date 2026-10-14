/**
 * Kamino Bot API — lets automated accounts (e.g. the French teacher) read and
 * post messages through long-lived bearer tokens, without a user session.
 *
 * A bot is just a regular user account; the token maps to that account and the
 * bot can only act where its account is a member, under the same guards as a
 * human (rate limits, content review, mutes).
 *
 * HTTP surface: POST /api/v1/bot/<action> with
 *   Authorization: Bearer kamino_bot_<64 hex chars>
 * Actions: rooms, messages, send.
 */
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { guard } from "./guard";
import { scanText } from "./safety";
import { parseSticker } from "./stickers";
import { internals } from "./server";

const { db } = internals;
type Sql = Awaited<ReturnType<typeof internals.db>>;
type Authed = { userId: string };

export function hashBotToken(token: string): string {
  // Server-only: uses node:crypto, called from server functions and the bot route.
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(token).digest("hex");
}

export function isBotTokenFormat(token: string): boolean {
  return token.startsWith("kamino_bot_") && token.length === 11 + 64;
}

async function requireBotRoomAccess(sql: Sql, userId: string, roomId: number) {
  const rows = await sql<{ id: number }>`
    select r.id from chat_rooms r
    join chat_members m on m.room_id = r.id
    where r.id = ${roomId} and m.user_id = ${userId}
  `;
  if (!rows.length) throw new Error("Bot is not a member of this room.");
}

// ── Token management (regular user auth) ─────────────────────────────

export const createBotToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { name: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const name = String(data.name ?? "").trim().slice(0, 60) || "Unnamed bot";
    const { randomBytes } = require("node:crypto");
    const token = `kamino_bot_${randomBytes(32).toString("hex")}`;
    const rows = await sql<{ id: number }>`
      insert into bot_tokens (user_id, name, token_hash)
      values (${userId}, ${name}, ${hashBotToken(token)})
      returning id
    `;
    // The plaintext token is shown exactly once — it is never stored.
    return { id: Number(rows[0]!.id), name, token };
  });

export const listBotTokens = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const rows = await sql<{
      id: number; name: string; created_at: string; last_used_at: string | null; revoked_at: string | null;
    }>`select id, name, created_at, last_used_at, revoked_at from bot_tokens
       where user_id = ${userId} order by id desc`;
    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      createdAt: String(r.created_at),
      lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
      revoked: !!r.revoked_at,
    }));
  });

export const revokeBotToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await sql`update bot_tokens set revoked_at = now()
      where id = ${id} and user_id = ${userId} and revoked_at is null`;
    return { ok: true };
  });

// ── Core bot logic (called by the /api/v1/bot route after auth) ───────

export async function botListRooms(userId: string) {
  const sql = await db();
  const rows = await sql<{ id: number; name: string; kind: string }>`
    select r.id, r.name, r.kind from chat_rooms r
    join chat_members m on m.room_id = r.id
    where m.user_id = ${userId}
    order by r.id desc limit 100
  `;
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name ?? ""), kind: String(r.kind ?? "") }));
}

export async function botReadMessages(userId: string, roomId: number, sinceId = 0, limit = 50) {
  const sql = await db();
  await requireBotRoomAccess(sql, userId, roomId);
  const cursor = Number(sinceId) || 0;
  const count = Math.max(1, Math.min(100, Number(limit) || 50));
  const rows = await sql<{
    id: number; author_user_id: string; body: string; created_at: string; reply_to: number | null;
  }>`select m.id, m.author_user_id, m.body, m.created_at, m.reply_to
     from messages m
     where m.room_id = ${roomId} and m.id > ${cursor} and m.held = false
     order by m.id asc limit ${count}`;
  return rows.map((m) => ({
    id: Number(m.id),
    authorUserId: String(m.author_user_id),
    body: String(m.body ?? ""),
    createdAt: String(m.created_at),
    replyTo: m.reply_to == null ? null : Number(m.reply_to),
    fromBot: String(m.author_user_id) === userId,
  }));
}

const loadServerInternals = createServerOnlyFn(() => import("./server"));
const loadSafety = createServerOnlyFn(() => import("./safety.server"));

export async function botPostMessage(
  userId: string,
  roomId: number,
  body: string,
  replyTo?: number | null,
) {
  const sql = await db();
  const server = await loadServerInternals();
  const safety = await loadSafety();
  const { requireMinAge, requireRoomAccess, assertNotMuted, notify } = server.internals;
  const { reviewContent } = safety;
  await guard(userId, "message");
  await requireMinAge(sql, userId);
  const room = await requireRoomAccess(sql, userId, roomId);
  if (room.community_id) await assertNotMuted(sql, userId, String(room.community_id));
  const text = String(body ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("Write a message first.");
  if (!parseSticker(text)) {
    const err = scanText(text);
    if (err) throw new Error(err);
  }
  if (replyTo) {
    const ok = (await sql`select 1 from messages where id = ${replyTo} and room_id = ${roomId}`).length;
    if (!ok) throw new Error("Reply not found in this conversation.");
  }
  const rows = await sql<{ id: number }>`
    insert into messages (room_id, author_user_id, body, reply_to, held)
    values (${roomId}, ${userId}, ${text}, ${replyTo ?? null}, true)
    returning id
  `;
  const messageId = Number(rows[0]!.id);
  const { held } = await reviewContent(
    sql,
    {
      targetType: "message",
      targetId: messageId,
      authorId: userId,
      communityId: room.community_id ? String(room.community_id) : null,
      text: parseSticker(text) ? "" : text,
      images: [],
      href: `/chats/${roomId}`,
    },
    notify,
  );
  if (held) return { id: messageId, held };
  await sql`update messages set held = false where id = ${messageId}`;
  const { publishEvent } = await import("./events.server");
  publishEvent({ type: "message", roomId, messageId });
  const others = await sql<{ user_id: string }>`
    select cm.user_id from chat_members cm
    where cm.room_id = ${roomId} and cm.user_id <> ${userId} and cm.muted = false`;
  const me = (await sql<{ display_name: string }>`select display_name from profiles where user_id = ${userId}`)[0];
  for (const o of others) {
    await notify(
      sql,
      String(o.user_id),
      "message",
      me?.display_name ?? "Bot",
      text.slice(0, 120),
      `/chats/${roomId}`,
      { actorId: userId, targetType: "room", targetId: roomId },
    );
  }
  return { id: messageId, held: false };
}
