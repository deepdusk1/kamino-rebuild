/**
 * Runs the safety checks on something a person wrote or uploaded, and acts on the result:
 *   - "hold": the content is hidden at once (only its author is told), and moderators get it in their review queue.
 *   - "flag": the content stays visible and moderators are asked to look.
 * Serious cases also reach the site owner (`KAMINO_ADMIN_EMAILS`), because a community's own leaders might be the
 * problem. Nobody is banned or struck by the machine; people decide that.
 */
import type { Sql } from "@/lib/db";
import { moderationScores } from "./ai.server";
import {
  NO_VERDICT,
  decideFromScores,
  excerptOf,
  mergeVerdicts,
  rulesVerdict,
  type Verdict,
} from "./moderation";

export type SafetyTarget = "post" | "comment" | "message" | "wall" | "roleplay" | "scene";

export type ReviewInput = {
  targetType: SafetyTarget;
  targetId: string | number;
  authorId: string;
  /** null for things that do not belong to a community (profile walls). */
  communityId: string | null;
  text: string;
  /** Uploaded pictures as data: URLs (links and built-in covers are not checked). */
  images?: string[];
  /** Where a moderator can see the item. */
  href: string;
  /** Role-play and stories: fictional violence is expected. */
  fiction?: boolean;
};

export type Notify = (
  sql: Sql,
  userId: string,
  kind: string,
  title: string,
  body: string,
  href: string,
  extra?: { actorId?: string | null; targetType?: string; targetId?: string | number; thumb?: string; push?: boolean },
) => Promise<void>;

/** Site owners, from the comma-separated `KAMINO_ADMIN_EMAILS` setting. */
export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.KAMINO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export async function isSiteAdmin(sql: Sql, userId: string): Promise<boolean> {
  const emails = adminEmails();
  const ids = (process.env.KAMINO_ADMIN_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  const row = (
    await sql<{ email: string | null; emailVerified: boolean }>`select email, "emailVerified" from "user" where id = ${userId}`
  )[0];
  if (!row?.emailVerified) return false;
  const granted = (await sql`select 1 from identity_admin_grants where user_id = ${userId}`).length > 0;
  return Boolean(ids.includes(userId) || granted || (row.email && emails.includes(row.email.toLowerCase())));
}

async function adminUserIds(sql: Sql): Promise<string[]> {
  const emails = adminEmails();
  const ids = (process.env.KAMINO_ADMIN_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  const rows = await sql<{ id: string }>`select id from "user" where "emailVerified" = true and (lower(email) = any(${emails}) or id = any(${ids}) or exists (select 1 from identity_admin_grants g where g.user_id = "user".id))`;
  return rows.map((r) => r.id);
}

/** Checks text and pictures with the rules and (when configured) the AI. Never throws. */
export async function checkContent(input: {
  text: string;
  images?: string[];
  ageGate?: number;
  fiction?: boolean;
}): Promise<Verdict> {
  const verdicts: Verdict[] = [rulesVerdict(input.text)];
  const pictures = (input.images ?? [])
    .filter((image) => image.startsWith("data:image/"))
    .slice(0, 12);
  const scores = await Promise.all([
    input.text.trim() ? moderationScores({ text: input.text }) : Promise.resolve(null),
    ...pictures.map((image) => moderationScores({ image })),
  ]);
  for (const s of scores)
    if (s) verdicts.push(decideFromScores(s, { ageGate: input.ageGate, fiction: input.fiction }));
  return verdicts.length ? mergeVerdicts(...verdicts) : NO_VERDICT;
}

/**
 * Where a post's uploaded cover is parked while a flag about minors is open, so it is not sent to anyone, moderators
 * included (album pictures are refused by the picture route while such a flag is open). Restoring puts it back.
 */
const PARKED_COVER = 99;

/** Hides one item (the "hold" action). */
async function hide(sql: Sql, target: SafetyTarget, id: string, minors = false) {
  const n = Number(id);
  if (target === "post" && minors) {
    await sql`insert into post_images (post_id, position, data_url)
      select id, ${PARKED_COVER}, cover from posts where id = ${n} and (cover like 'data:%' or cover like 's3:%')
      on conflict do nothing`;
    await sql`update posts set cover = '' where id = ${n} and (cover like 'data:%' or cover like 's3:%')`;
  }
  if (target === "post") await sql`update posts set hidden = true where id = ${n}`;
  if (target === "comment") await sql`update comments set held = true where id = ${n}`;
  if (target === "message") await sql`update messages set held = true where id = ${n}`;
  if (target === "wall") await sql`update wall_posts set held = true where id = ${n}`;
  if (target === "roleplay") await sql`update roleplay_turns set held = true where id = ${n}`;
  if (target === "scene") await sql`update roleplay_scenes set held = true where id = ${n}`;
}

/** Brings a held item back (a moderator decided it was fine). */
export async function unhide(sql: Sql, target: string, id: string) {
  const n = Number(id);
  if (target === "post") {
    const parked = await sql<{
      data_url: string;
    }>`delete from post_images where post_id = ${n} and position = ${PARKED_COVER} returning data_url`;
    if (parked[0]) await sql`update posts set cover = ${parked[0].data_url} where id = ${n}`;
    await sql`update posts set hidden = false where id = ${n}`;
  }
  if (target === "comment") {
    const back = await sql<{
      post_id: number;
    }>`update comments set held = false where id = ${n} and held = true returning post_id`;
    if (back[0])
      await sql`update posts set comment_count = comment_count + 1 where id = ${back[0].post_id}`;
  }
  if (target === "message") await sql`update messages set held = false where id = ${n}`;
  if (target === "wall") await sql`update wall_posts set held = false where id = ${n}`;
  if (target === "roleplay") await sql`update roleplay_turns set held = false where id = ${n}`;
  if (target === "scene") await sql`update roleplay_scenes set held = false where id = ${n}`;
}

/** Takes an item down for good (a moderator decided it breaks the rules). Posts stay hidden, the rest are removed. */
export async function takeDown(sql: Sql, target: string, id: string) {
  const n = Number(id);
  if (target === "post") await sql`update posts set hidden = true where id = ${n}`;
  if (target === "comment") {
    const gone = await sql<{
      post_id: number;
      held: unknown;
    }>`delete from comments where id = ${n} returning post_id, held`;
    // A comment that was visible was counted on its post; a held one was not.
    if (gone[0] && !(gone[0].held === true || gone[0].held === "t"))
      await sql`update posts set comment_count = greatest(comment_count - 1, 0) where id = ${gone[0].post_id}`;
  }
  if (target === "message")
    await sql`update messages set deleted = true, held = false where id = ${n}`;
  if (target === "wall") await sql`delete from wall_posts where id = ${n}`;
  if (target === "roleplay") await sql`delete from roleplay_turns where id = ${n}`;
  if (target === "scene") {
    await sql`delete from roleplay_turns where scene_id = ${n}`;
    await sql`delete from roleplay_cast where scene_id = ${n}`;
    await sql`delete from roleplay_scenes where id = ${n}`;
  }
}

const NOUN: Record<SafetyTarget, string> = {
  post: "post",
  comment: "comment",
  message: "message",
  wall: "wall note",
  roleplay: "story turn",
  scene: "role-play story",
};

/**
 * Checks one item and acts on it. Returns whether it was held, so the app can tell its author.
 */
export async function reviewContent(
  sql: Sql,
  input: ReviewInput,
  notify: Notify,
): Promise<{ held: boolean; verdict: Verdict }> {
  const ageGate = input.communityId
    ? Number(
        (
          await sql<{
            age_gate: number;
          }>`select age_gate from communities where id = ${input.communityId}`
        )[0]?.age_gate ?? 13,
      )
    : 13;
  const verdict = await checkContent({
    text: input.text,
    images: input.images,
    ageGate,
    fiction: input.fiction,
  });
  if (!verdict.action) return { held: false, verdict };

  const targetId = String(input.targetId);
  if (verdict.action === "hold") await hide(sql, input.targetType, targetId, verdict.minors);
  const hasPicture = (input.images ?? []).some((image) => image.startsWith("data:image/"));
  const excerpt = excerptOf(input.text) + (hasPicture ? " [contains pictures]" : "");
  await sql`
    insert into safety_flags (community_id, target_type, target_id, author_user_id, action, reasons, severe, minors, excerpt, href)
    values (${input.communityId}, ${input.targetType}, ${targetId}, ${input.authorId}, ${verdict.action},
            ${JSON.stringify(verdict.reasons)}, ${verdict.severe}, ${verdict.minors}, ${excerpt}, ${input.href})
  `;

  const noun = NOUN[input.targetType];
  const what = verdict.reasons.join(", ") || "possible rule break";
  const reviewers = new Set<string>();
  if (input.communityId) {
    const mods = await sql<{ user_id: string }>`
      select user_id from memberships
      where community_id = ${input.communityId} and status = 'active' and role in ('agent', 'leader', 'curator')
    `;
    for (const m of mods) if (m.user_id !== input.authorId) reviewers.add(m.user_id);
  }
  const admins = verdict.severe || !input.communityId ? await adminUserIds(sql) : [];
  for (const id of admins) reviewers.add(id);
  const title =
    verdict.action === "hold" ? `A ${noun} was held for review` : `A ${noun} needs a look`;
  for (const id of reviewers) {
    const href =
      input.communityId && !admins.includes(id) ? `/c/${input.communityId}/mod` : "/admin/safety";
    await notify(sql, id, "safety", title, what, href, input.communityId ? { targetType: "community", targetId: input.communityId } : {});
  }

  // The AI storyteller is not a person to notify.
  const authorIsPerson = !input.authorId.startsWith("kamino:");
  if (verdict.action === "hold" && authorIsPerson)
    await notify(
      sql,
      input.authorId,
      "safety",
      `Your ${noun} is waiting for a moderator`,
      "Kamino's safety check paused it. A person will look at it soon and either put it back or remove it.",
      input.href,
      input.targetType === "post" ? { targetType: "post", targetId: input.targetId } : {},
    );
  if (verdict.selfHarm && authorIsPerson)
    await notify(
      sql,
      input.authorId,
      "support",
      "You don't have to go through it alone",
      "If things feel heavy right now, please reach out to someone you trust or a local crisis line. You matter here.",
      "/safety",
    );
  return { held: verdict.action === "hold", verdict };
}
