/**
 * AI story room server features: checkpoint rewinds and branch voting.
 *
 * The mobile story screen authors checkpoints locally and calls these RPCs
 * fire-and-forget so the room converges across devices. The server records the
 * canonical per-scene state (current checkpoint pointer, vote tallies) and
 * enforces community membership — same conventions as `server.ts` and
 * `watch.ts`. Reachable from the phone app over `/api/v1/rpc/<name>`
 * (see `mobile-api.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";

type Authed = { userId: string };
type Row = Record<string, unknown>;

const slugSchema = z.string().min(1).max(128);
const sceneSchema = z.object({ slug: slugSchema, sceneId: z.number().int().min(0) });

async function requireStoryAccess(sql: Sql, userId: string, slug: string) {
  const member = await internals.membershipOf(sql, userId, slug);
  if (!member || member.status !== "active")
    throw new Error("Join the community to take part in its stories.");
  return member;
}

/**
 * Records that a story scene was rewound to a checkpoint. Checkpoints are
 * authored on the client; the server keeps the canonical "current checkpoint"
 * pointer per scene so peers and future sessions converge on the same branch.
 */
export const rewindAiStoryCheckpoint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(sceneSchema.extend({ checkpointId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await requireStoryAccess(sql, userId, data.slug);
    await sql`insert into story_scenes(community_slug, scene_id, current_checkpoint_id, updated_by, updated_at)
      values(${data.slug}, ${data.sceneId}, ${data.checkpointId}, ${userId}, now())
      on conflict (community_slug, scene_id)
      do update set current_checkpoint_id = ${data.checkpointId}, updated_by = ${userId}, updated_at = now()`;
    // Turns live on the client that authored the checkpoint; the canonical
    // pointer above is what lets other devices follow the rewind.
    return { ok: true, restoredTurnId: 0, turns: [] as Row[] };
  });

/**
 * Toggles the caller's vote on a story branch option and returns the fresh
 * tallies for every option voted on in the scene.
 */
export const voteAiStoryBranch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(sceneSchema.extend({ optionId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    await requireStoryAccess(sql, userId, data.slug);
    const existing = await sql`select 1 from story_votes
      where community_slug = ${data.slug} and scene_id = ${data.sceneId}
        and option_id = ${data.optionId} and user_id = ${userId} limit 1`;
    if (existing.length)
      await sql`delete from story_votes
        where community_slug = ${data.slug} and scene_id = ${data.sceneId}
          and option_id = ${data.optionId} and user_id = ${userId}`;
    else
      await sql`insert into story_votes(community_slug, scene_id, option_id, user_id)
        values(${data.slug}, ${data.sceneId}, ${data.optionId}, ${userId})
        on conflict do nothing`;
    const rows = await sql<Row>`
      select v.option_id,
        count(*) as votes,
        bool_or(v.user_id = ${userId}) as voted_by_me
      from story_votes v
      where v.community_slug = ${data.slug} and v.scene_id = ${data.sceneId}
      group by v.option_id
      order by count(*) desc, v.option_id asc`;
    return {
      ok: true,
      options: rows.map((r) => ({
        id: String(r.option_id),
        votes: Number(r.votes),
        votedByMe: Boolean(r.voted_by_me),
      })),
    };
  });
