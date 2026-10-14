/**
 * Watch party server features: the shared play queue with voting, and ready checks.
 *
 * Queue items are validated with the same `parseWatchInput` rules the web player uses
 * (YouTube, Vimeo, Twitch, direct .mp4/.webm — locked catalogs are refused), so nothing
 * unsupportable can be queued. Playing an item from the queue is restricted to the room
 * host, co-hosts and community moderators (same rule as the live-stage controls); adding
 * and voting is open to every member of the room. Ready checks are a per-room round
 * counter: starting a check bumps the round, members answer the current round, and the
 * host reads the current round.
 *
 * Same conventions as `server.ts` and `social.ts`: every function validates its input,
 * checks permissions on the server, and is reachable from the phone app over
 * `/api/v1/rpc/<name>` (see `mobile-api.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";
import { canModerate } from "./safety";
import { parseWatchInput } from "./shelf";

type Authed = { userId: string };
type Row = Record<string, unknown>;

const idSchema = z.number().int().positive();

/** Same host rule as the live-stage controls (`stageHost` in community-v9.ts). */
async function watchHost(sql: Sql, uid: string, room: Row): Promise<boolean> {
  if (room.created_by === uid) return true;
  if (
    (await sql`select 1 from room_cohosts where room_id=${Number(room.id)} and user_id=${uid}`)
      .length
  )
    return true;
  if (room.community_id) {
    const member = await internals.membershipOf(sql, uid, String(room.community_id));
    if (member?.status === "active" && canModerate(member.role)) return true;
  }
  return false;
}

async function requireScreening(sql: Sql, userId: string, roomId: number) {
  const room = await internals.requireRoomAccess(sql, userId, roomId);
  if (String(room.kind) !== "screening") throw new Error("Watch parties need a screening room.");
  return room;
}

const queueItemSchema = z.object({ roomId: idSchema, url: z.string().min(4).max(600) });

export const listWatchQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await requireScreening(sql, userId, roomId);
    const rows = await sql<Row>`
      select q.id, q.url, q.title, q.kind, q.added_by, q.created_at,
        (select count(*) from watch_queue_votes v where v.item_id = q.id) as votes,
        exists(select 1 from watch_queue_votes v where v.item_id = q.id and v.user_id = ${userId}) as mine,
        coalesce(pr.display_name, '') as added_name
      from watch_queue q left join profiles pr on pr.user_id = q.added_by
      where q.room_id = ${roomId}
      order by (select count(*) from watch_queue_votes v where v.item_id = q.id) desc, q.id asc
      limit 50
    `;
    return {
      items: rows.map((r) => ({
        id: Number(r.id),
        url: String(r.url),
        title: String(r.title),
        kind: String(r.kind),
        addedBy: String(r.added_by),
        addedName: String(r.added_name ?? "Member"),
        votes: Number(r.votes),
        mine: Boolean(r.mine),
        mineAdded: String(r.added_by) === userId,
      })),
    };
  });

export const addWatchQueueItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(queueItemSchema)
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await requireScreening(sql, userId, data.roomId);
    const parsed = parseWatchInput(data.url);
    if ("error" in parsed) throw new Error(parsed.error);
    const existing = await sql`select 1 from watch_queue where room_id=${data.roomId} and url=${parsed.url} limit 1`;
    if (existing.length) throw new Error("That video is already in the queue.");
    const count = await sql`select count(*) as n from watch_queue where room_id=${data.roomId}`;
    if (Number((count[0] as { n: string | number } | undefined)?.n ?? 0) >= 50)
      throw new Error("The queue is full — play or remove something first.");
    const title = parsed.title.slice(0, 80);
    const inserted = await sql<{ id: string | number }>`
      insert into watch_queue(room_id, url, title, kind, added_by)
      values(${data.roomId}, ${parsed.url}, ${title}, ${parsed.kind}, ${userId}) returning id
    `;
    await sql`insert into watch_queue_votes(item_id, user_id) values(${Number(inserted[0]!.id)}, ${userId}) on conflict do nothing`;
    return { id: Number(inserted[0]!.id), title, kind: parsed.kind, url: parsed.url };
  });

export const voteWatchQueueItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: itemId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const item = (
      await sql<Row>`select q.room_id from watch_queue q join chat_rooms r on r.id = q.room_id where q.id = ${itemId}`
    )[0];
    if (!item) throw new Error("That queue item is gone.");
    await requireScreening(sql, userId, Number(item.room_id));
    const voted =
      (await sql`select 1 from watch_queue_votes where item_id=${itemId} and user_id=${userId}`)
        .length > 0;
    if (voted)
      await sql`delete from watch_queue_votes where item_id=${itemId} and user_id=${userId}`;
    else
      await sql`insert into watch_queue_votes(item_id, user_id) values(${itemId}, ${userId}) on conflict do nothing`;
    const after = await sql<{ votes: string | number }>`
      select count(*) as votes from watch_queue_votes where item_id=${itemId}`;
    return { voted: !voted, votes: Number(after[0]?.votes ?? 0) };
  });

export const removeWatchQueueItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: itemId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const item = (
      await sql<Row>`select room_id, added_by from watch_queue where id = ${itemId}`
    )[0];
    if (!item) return { ok: true };
    const room = await requireScreening(sql, userId, Number(item.room_id));
    if (String(item.added_by) !== userId && !(await watchHost(sql, userId, room)))
      throw new Error("Only the person who added it or the host can remove a queue item.");
    await sql`delete from watch_queue where id = ${itemId}`;
    return { ok: true };
  });

export const playWatchQueueItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: itemId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const item = (
      await sql<Row>`select room_id, url, title, kind from watch_queue where id = ${itemId}`
    )[0];
    if (!item) throw new Error("That queue item is gone.");
    const room = await requireScreening(sql, userId, Number(item.room_id));
    if (!(await watchHost(sql, userId, room)))
      throw new Error("Only the host can play from the queue. Vote for what you want next.");
    await sql`update chat_rooms set watch_url=${String(item.url)}, watch_title=${String(item.title)} where id=${Number(item.room_id)}`;
    await sql`delete from watch_queue where id = ${itemId}`;
    return { url: String(item.url), title: String(item.title), kind: String(item.kind) };
  });

export const clearWatchQueue = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const room = await requireScreening(sql, userId, roomId);
    if (!(await watchHost(sql, userId, room)))
      throw new Error("Only the host can clear the queue.");
    await sql`delete from watch_queue where room_id=${roomId}`;
    return { ok: true };
  });

export const startWatchReadyCheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await requireScreening(sql, userId, roomId);
    // One row per member: bump everyone's round. Members who answer write the new round too.
    await sql`insert into watch_ready(room_id, user_id, round, ready, updated_at)
      values(${roomId}, ${userId}, 1, false, now())
      on conflict (room_id, user_id) do update set round = watch_ready.round + 1, ready = false, updated_at = now()
      returning round`;
    const row = await sql<{ round: number | string }>`
      select round from watch_ready where room_id=${roomId} and user_id=${userId}`;
    return { round: Number(row[0]?.round ?? 1) };
  });

export const setWatchReady = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roomId: idSchema, round: z.number().int().min(0).max(1_000_000) }))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await requireScreening(sql, userId, data.roomId);
    // Only answer rounds up to the latest one the room has seen; late answers to old rounds are ignored.
    const latest = await sql<{ round: number | string }>`
      select coalesce(max(round), 0) as round from watch_ready where room_id=${data.roomId}`;
    const current = Number(latest[0]?.round ?? 0);
    if (data.round > current) return { round: current, ready: false };
    await sql`insert into watch_ready(room_id, user_id, round, ready, updated_at)
      values(${data.roomId}, ${userId}, ${data.round}, true, now())
      on conflict (room_id, user_id) do update set round=${data.round}, ready=true, updated_at=now()`;
    return { round: data.round, ready: true };
  });

export const listWatchReady = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idSchema)
  .handler(async ({ context, data: roomId }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await requireScreening(sql, userId, roomId);
    const rows = await sql<Row>`
      select w.user_id, w.round, w.ready, coalesce(pr.display_name, '') as name
      from watch_ready w left join profiles pr on pr.user_id = w.user_id
      where w.room_id = ${roomId} and w.updated_at > now() - interval '30 minutes'
      order by w.round desc, w.ready desc, w.user_id asc limit 100`;
    const round = Number(rows[0]?.round ?? 0);
    return {
      round,
      entries: rows
        .filter((r) => Number(r.round) === round)
        .map((r) => ({
          userId: String(r.user_id),
          name: String(r.name ?? "Member"),
          ready: Boolean(r.ready),
          mine: String(r.user_id) === userId,
        })),
    };
  });
