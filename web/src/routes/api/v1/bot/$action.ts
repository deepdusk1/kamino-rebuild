/**
 * Dedicated Bot API HTTP endpoint.
 *
 *   POST /api/v1/bot/<action>      body: { ...args }
 *   Authorization: Bearer kamino_bot_<token>
 *
 * Actions:
 *   rooms                      -> list rooms the bot is a member of
 *   messages  {roomId, sinceId?, limit?}  -> poll for new messages
 *   send      {roomId, body, replyTo?}     -> post a message
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { hashBotToken, isBotTokenFormat, botListRooms, botReadMessages, botPostMessage } from "@/lib/kamino/bots";

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handle({ request, params }: { request: Request; params: { action: string } }) {
  const action = params.action;
  let body: Record<string, unknown> = {};
  try {
    if (request.method === "POST") {
      const text = await request.text();
      if (text) body = JSON.parse(text) as Record<string, unknown>;
    }
  } catch {
    return json({ error: { message: "Body must be valid JSON", status: 400 } }, 400);
  }

  try {
    const header = request.headers.get("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!isBotTokenFormat(token)) {
      return json({ error: { message: "Unauthorized: bot token required.", status: 401 } }, 401);
    }
    const sql = await getSql();
    const rows = await sql<{ user_id: string; id: number }>`
      select user_id, id from bot_tokens
      where token_hash = ${hashBotToken(token)} and revoked_at is null
    `;
    const row = rows[0];
    if (!row) {
      return json({ error: { message: "Unauthorized: invalid bot token.", status: 401 } }, 401);
    }
    const userId = String(row.user_id);
    await sql`update bot_tokens set last_used_at = now() where id = ${row.id}`;

    if (action === "rooms") {
      return json({ result: await botListRooms(userId) });
    }
    if (action === "messages") {
      const roomId = Number(body.roomId);
      if (!roomId) throw new Error("roomId is required.");
      const result = await botReadMessages(userId, roomId, Number(body.sinceId ?? 0), Number(body.limit ?? 50));
      return json({ result });
    }
    if (action === "send") {
      const roomId = Number(body.roomId);
      if (!roomId) throw new Error("roomId is required.");
      const result = await botPostMessage(userId, roomId, String(body.body ?? ""), body.replyTo == null ? null : Number(body.replyTo));
      return json({ result });
    }
    return json({ error: { message: `Unknown bot action "${action}"`, status: 404 } }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    const status = /unauthorized/i.test(message) ? 401 : 400;
    return json({ error: { message, status } }, status);
  }
}

export const Route = createFileRoute("/api/v1/bot/$action")({
  server: { handlers: { GET: handle, POST: handle } },
});
