/**
 * Album pictures and importing an exported copy of your own data.
 *
 * Same conventions as `server.ts`: validate input, check access on the server, never trust ids from the client.
 */
import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { QUIZ_IMAGE_BASE, draftFromExportedDraft, draftFromExportedPost } from "./albums";
import { guard } from "./guard";
import { isMediaRef, loadMedia } from "./media-store.server";
import { optionalAuth, type Viewer } from "./optional-auth";
import { internals } from "./server";

type Authed = { userId: string };
const { db, requirePostAccess } = internals;

/** One extra picture of an image post (position 1 is the first picture after the cover). */
export const getPostImage = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { postId: number; position: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as unknown as Viewer;
    // The same rules as reading the post itself (private communities, hidden posts, blocks).
    const post = await requirePostAccess(sql, userId, data.postId);
    // A post the safety check linked to minors never hands out its pictures, not even to moderators.
    if (
      (
        await sql`select 1 from safety_flags where target_type = 'post' and target_id = ${String(data.postId)} and minors = true and status = 'open'`
      ).length
    )
      throw new Error("Picture not found.");
    // Quiz pictures (positions from QUIZ_IMAGE_BASE) stay hidden until you start the quiz, so a timed
    // quiz cannot be studied beforehand. The author and people who already finished it can always see them.
    if (data.position >= QUIZ_IMAGE_BASE && String(post.author_user_id) !== userId) {
      const allowed =
        userId &&
        (
          await sql`
            select 1 from quiz_starts where user_id = ${userId} and post_id = ${data.postId}
            union all
            select 1 from quiz_attempts where user_id = ${userId} and post_id = ${data.postId}
          `
        ).length > 0;
      if (!allowed) throw new Error("Start the quiz to see its pictures.");
    }
    // Position 0 is the cover picture; 1 and up are the album (and quiz pictures from QUIZ_IMAGE_BASE).
    const stored =
      data.position === 0
        ? String(post.cover ?? "")
        : (
            await sql<{ data_url: string }>`
              select data_url from post_images where post_id = ${data.postId} and position = ${data.position}
            `
          )[0]?.data_url;
    if (!stored || (!stored.startsWith("data:") && !isMediaRef(stored)))
      throw new Error("Picture not found.");
    return { dataUrl: await loadMedia(stored) };
  });

const MAX_IMPORT_CHARS = 20_000_000;
const MAX_IMPORT_ITEMS = 200;

export type ImportResult = {
  /** New drafts created. */
  imported: number;
  /** Rows that were already there, could not be read, or belong to a community you are not in. */
  skipped: number;
};

/**
 * Reads a file made by "Download my data" and turns your posts and saved drafts into private drafts
 * in the communities you are still an active member of. Nothing is published automatically, and running it
 * twice does not create duplicates.
 */
export const importMyData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { json: string }) => {
    if (typeof d?.json !== "string" || !d.json.trim())
      throw new Error("Choose the file you downloaded from Kamino.");
    if (d.json.length > MAX_IMPORT_CHARS) throw new Error("That file is too large to import.");
    return d;
  })
  .handler(async ({ context, data }): Promise<ImportResult> => {
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "upload");

    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(data.json);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("not an object");
      parsed = value as Record<string, unknown>;
    } catch {
      throw new Error("That does not look like a Kamino data file.");
    }
    if (typeof parsed.formatVersion !== "number")
      throw new Error("That does not look like a Kamino data file.");

    const list = (key: string): unknown[] =>
      Array.isArray(parsed[key]) ? (parsed[key] as unknown[]).slice(0, MAX_IMPORT_ITEMS) : [];

    // Extra pictures of each post, keyed by the post's old id: album pictures (positions 1 and up) and
    // quiz question pictures (positions from QUIZ_IMAGE_BASE).
    const pictures = new Map<string, { position: number; dataUrl: string }[]>();
    for (const row of list("postImages")) {
      const r = row as { post_id?: unknown; position?: unknown; data_url?: unknown };
      if (typeof r?.data_url !== "string" || !Number.isInteger(Number(r.position))) continue;
      const key = String(r.post_id);
      pictures.set(key, [
        ...(pictures.get(key) ?? []),
        { position: Number(r.position), dataUrl: r.data_url },
      ]);
    }
    const draftFromPost = (row: unknown) => {
      const mine = (pictures.get(String((row as { id?: unknown })?.id)) ?? []).sort(
        (a, b) => a.position - b.position,
      );
      const quiz: string[] = [];
      for (const p of mine)
        if (p.position >= QUIZ_IMAGE_BASE) quiz[p.position - QUIZ_IMAGE_BASE] = p.dataUrl;
      return draftFromExportedPost(
        row,
        mine.filter((p) => p.position > 0 && p.position < QUIZ_IMAGE_BASE).map((p) => p.dataUrl),
        Array.from(quiz, (item) => item ?? ""),
      );
    };

    const candidates = [
      ...list("posts").map(draftFromPost),
      ...list("drafts").map((row) => draftFromExportedDraft(row)),
    ];

    const active = new Set(
      (
        await sql<{
          community_id: string;
        }>`select community_id from memberships where user_id = ${userId} and status = 'active'`
      ).map((r) => r.community_id),
    );
    const existing = new Set(
      (
        await sql<{
          community_id: string;
          content: unknown;
        }>`select community_id, content from creator_drafts where user_id = ${userId}`
      ).map((r) => {
        const content =
          typeof r.content === "string"
            ? safeParse(r.content)
            : (r.content as { title?: string; body?: string } | null);
        return `${r.community_id}\u0000${content?.title ?? ""}\u0000${content?.body ?? ""}`;
      }),
    );

    let imported = 0;
    let skipped = 0;
    for (const item of candidates) {
      if (!item || !active.has(item.slug)) {
        skipped += 1;
        continue;
      }
      const key = `${item.slug}\u0000${item.content.title}\u0000${item.content.body}`;
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      existing.add(key);
      await sql`insert into creator_drafts (id, user_id, community_id, content)
        values (${randomUUID()}, ${userId}, ${item.slug}, ${JSON.stringify(item.content)})`;
      imported += 1;
    }
    return { imported, skipped };
  });

function safeParse(text: string): { title?: string; body?: string } | null {
  try {
    return JSON.parse(text) as { title?: string; body?: string };
  } catch {
    return null;
  }
}
