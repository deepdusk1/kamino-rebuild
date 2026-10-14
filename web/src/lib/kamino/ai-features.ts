/**
 * Features that use Kamino's (free) AI services: the safety review queue and role-play stories.
 *
 * Same conventions as `server.ts`: validate input, check access on the server, never trust ids from the client.
 * Everything here also works without AI keys: the safety queue then only shows what the built-in rules found, and
 * role-play scenes can still be played by members, just without the AI storyteller.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Sql } from "@/lib/db";
import { AiUnavailableError, aiConfig, budgetLeft, chatComplete } from "./ai.server";
import { guard } from "./guard";
import { asBool, iso, parseJson } from "./map";
import { optionalAuth, type Viewer } from "./optional-auth";
import {
  MAX_CHARACTERS,
  MAX_TURN_CHARS,
  STORYTELLER_ENDING_TOKENS,
  STORYTELLER_NARRATION_TOKENS,
  checkScene,
  cleanReply,
  draftPrompt,
  endingPrompt,
  narrationPrompt,
  parseDraft,
  type SceneCharacter,
  type TurnForPrompt,
} from "./roleplay";
import { canModerate, scanText } from "./safety";
import { isSiteAdmin, reviewContent, takeDown, unhide } from "./safety.server";
import { internals } from "./server";
import type {
  AiStatus,
  RoleplayScene,
  RoleplaySceneSummary,
  RoleplayTurn,
  SafetyFlag,
} from "./types";

type Authed = { userId: string };
const {
  db,
  notify,
  membershipOf,
  requireCommunity,
  requireMinAge,
  requireActiveMember,
  assertNotMuted,
  canRead,
  blockedSet,
} = internals;

/** The storyteller's author id in the safety queue (it is not a person and gets no notifications). */
const STORYTELLER = "kamino:storyteller";

// ───────────────────────────── AI status ─────────────────────────────

export const getAiStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiStatus> => {
    const config = aiConfig();
    const sql = await db();
    return {
      moderation: Boolean(config.moderation),
      storyteller: Boolean(config.chat),
      repliesLeft: await budgetLeft(sql),
    };
  },
);

// ───────────────────────────── Safety review queue ─────────────────────────────

function mapFlag(row: Record<string, unknown>): SafetyFlag {
  return {
    id: Number(row.id),
    communityId: row.community_id ? String(row.community_id) : null,
    targetType: String(row.target_type) as SafetyFlag["targetType"],
    targetId: String(row.target_id),
    authorId: String(row.author_user_id),
    authorName: String(row.author_user_id).startsWith("kamino:")
      ? "AI storyteller"
      : String(row.author_name ?? "Member"),
    action: row.action === "hold" ? "hold" : "flag",
    reasons: parseJson<string[]>(row.reasons, []),
    severe: asBool(row.severe),
    minors: asBool(row.minors),
    excerpt: String(row.excerpt ?? ""),
    href: String(row.href ?? ""),
    status: (["open", "restored", "removed", "dismissed"].includes(String(row.status))
      ? String(row.status)
      : "open") as SafetyFlag["status"],
    createdAt: iso(row.created_at),
  };
}

const FLAG_SELECT = `select f.*, coalesce(pr.display_name, 'Member') as author_name
  from safety_flags f left join profiles pr on pr.user_id = f.author_user_id`;

/** A community's safety queue, for its moderators. Open items first. */
export const listSafetyFlags = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { slug: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const m = await membershipOf(sql, userId, data.slug);
    if (m?.status !== "active" || !canModerate(m.role)) throw new Error("Moderators only.");
    const rows = await sql.query(
      `${FLAG_SELECT} where f.community_id = $1 order by (f.status = 'open') desc, f.id desc limit 100`,
      [data.slug],
    );
    return rows.map(mapFlag);
  });

/** Everything serious across the whole site (and profile walls), for the site owner (`KAMINO_ADMIN_EMAILS`). */
export const listSiteSafetyFlags = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const { userId } = context as Authed;
    if (!(await isSiteAdmin(sql, userId))) throw new Error("Site owners only.");
    const rows = await sql.query(
      `${FLAG_SELECT} where f.severe = true or f.community_id is null order by (f.status = 'open') desc, f.id desc limit 200`,
    );
    return rows.map(mapFlag);
  });

/** Whether the signed-in person is a site owner (shows the site-wide safety page). */
export const getSafetyRole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    return { siteAdmin: await isSiteAdmin(sql, (context as Authed).userId) };
  });

const NOUN: Record<string, string> = {
  post: "post",
  comment: "comment",
  message: "message",
  wall: "wall note",
  roleplay: "story turn",
  scene: "role-play story",
};

/**
 * A person's decision on a flagged item: "restore" (it was fine), "remove" (it breaks the rules) or "dismiss" (a
 * visible item that is fine and needs nothing). Community moderators decide for their community; the site owner for all.
 */
export const reviewSafetyFlag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: number; decision: "restore" | "remove" | "dismiss" }) => {
    if (!["restore", "remove", "dismiss"].includes(d?.decision))
      throw new Error("Choose restore, remove or dismiss.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const row = (await sql`select * from safety_flags where id = ${data.id}`)[0];
    if (!row) throw new Error("That item is no longer in the queue.");
    const flag = mapFlag(row);
    const admin = await isSiteAdmin(sql, userId);
    if (!admin) {
      if (!flag.communityId) throw new Error("Site owners only.");
      const m = await membershipOf(sql, userId, flag.communityId);
      if (m?.status !== "active" || !canModerate(m.role)) throw new Error("Moderators only.");
      // A leader cannot quietly restore something tied to minors in their own community; the site owner decides that.
      if (flag.minors && data.decision !== "remove")
        throw new Error("Only the site owner can restore this item.");
    }
    if (flag.status !== "open") throw new Error("Someone already decided on this item.");
    if (data.decision === "dismiss" && flag.action === "hold")
      throw new Error("A held item must be restored or removed.");
    if (data.decision === "restore") await unhide(sql, flag.targetType, flag.targetId);
    if (data.decision === "remove") await takeDown(sql, flag.targetType, flag.targetId);
    const status =
      data.decision === "restore"
        ? "restored"
        : data.decision === "remove"
          ? "removed"
          : "dismissed";
    // Every open flag on the same item is settled together.
    await sql`
      update safety_flags set status = ${status}, reviewed_by = ${userId}, reviewed_at = now()
      where target_type = ${flag.targetType} and target_id = ${flag.targetId} and status = 'open'
    `;
    if (flag.communityId)
      await sql`insert into audit_log (community_id, actor_id, action, detail)
        values (${flag.communityId}, ${userId}, ${"safety:" + status}, ${`${flag.targetType} ${flag.targetId}`})`;
    if (!flag.authorId.startsWith("kamino:") && data.decision !== "dismiss") {
      const noun = NOUN[flag.targetType] ?? "item";
      await notify(
        sql,
        flag.authorId,
        "safety",
        data.decision === "restore" ? `Your ${noun} is back` : `Your ${noun} was removed`,
        data.decision === "restore"
          ? "A moderator checked it and put it back. Thanks for your patience."
          : "A moderator reviewed it and found it breaks the rules.",
        flag.href || "/",
      );
    }
    return { ok: true, status };
  });

// ───────────────────────────── Role-play stories ─────────────────────────────

type SceneRow = {
  id: number;
  community_id: string;
  creator_id: string;
  title: string;
  source: string;
  premise: string;
  characters: string;
  status: string;
  created_at: string;
  updated_at: string;
  held: boolean;
};

async function loadScene(sql: Sql, sceneId: number) {
  const row = (await sql<SceneRow>`select * from roleplay_scenes where id = ${sceneId}`)[0];
  if (!row) throw new Error("Story not found.");
  row.held = asBool(row.held);
  const characters = parseJson<SceneCharacter[]>(row.characters, []);
  const cast = await sql<{ user_id: string; character_name: string; name: string }>`
    select c.user_id, c.character_name, coalesce(m.nickname, pr.display_name, 'Member') as name
    from roleplay_cast c
    left join memberships m on m.user_id = c.user_id and m.community_id = ${row.community_id}
    left join profiles pr on pr.user_id = c.user_id
    where c.scene_id = ${sceneId}
  `;
  return { row, characters, cast };
}

/** The viewer may read the scene's community. Returns the viewer's membership. */
async function requireSceneRead(sql: Sql, userId: string | null, communityId: string) {
  const community = await requireCommunity(sql, communityId);
  const m = await membershipOf(sql, userId, communityId);
  if (!canRead(community, m)) throw new Error("This community is private.");
  return m;
}

/** The viewer may write in the scene: an active member who is not muted and passed the age check. */
async function requireScenePlay(sql: Sql, userId: string, communityId: string) {
  await requireMinAge(sql, userId);
  const m = await requireActiveMember(sql, userId, communityId);
  await assertNotMuted(sql, userId, communityId);
  return m;
}

async function turnsForPrompt(sql: Sql, sceneId: number): Promise<TurnForPrompt[]> {
  const rows = await sql<{ kind: string; character_name: string; body: string }>`
    select kind, character_name, body from roleplay_turns where scene_id = ${sceneId} and held = false order by id desc limit 60
  `;
  return rows
    .reverse()
    .map((r) => ({
      kind: (r.kind as TurnForPrompt["kind"]) ?? "turn",
      character: r.character_name,
      body: r.body,
    }));
}

/** Asks the storyteller for narration or an ending, saves it (after the safety check) and returns the new turn's id. */
async function storytellerWrites(
  sql: Sql,
  scene: Awaited<ReturnType<typeof loadScene>>,
  kind: "narration" | "ending",
  extra: string,
): Promise<number> {
  const turns = await turnsForPrompt(sql, scene.row.id);
  const cast = scene.cast.map((c) => ({ name: c.character_name, player: c.user_id }));
  const header = {
    title: scene.row.title,
    source: scene.row.source,
    premise: scene.row.premise,
    characters: scene.characters,
  };
  const messages =
    kind === "ending"
      ? endingPrompt(header, cast, turns, extra)
      : narrationPrompt(header, cast, turns, extra);
  const text = cleanReply(
    await chatComplete(
      sql,
      messages,
      { maxTokens: kind === "ending" ? STORYTELLER_ENDING_TOKENS : STORYTELLER_NARRATION_TOKENS },
    ),
  );
  const inserted = await sql<{ id: number }>`
    insert into roleplay_turns (scene_id, author_user_id, character_name, kind, body)
    values (${scene.row.id}, ${null}, ${""}, ${kind}, ${text}) returning id
  `;
  const id = Number(inserted[0]!.id);
  await reviewContent(
    sql,
    {
      targetType: "roleplay",
      targetId: id,
      authorId: STORYTELLER,
      communityId: scene.row.community_id,
      text,
      href: `/c/${scene.row.community_id}/roleplay/${scene.row.id}`,
      fiction: true,
    },
    notify,
  );
  await sql`update roleplay_scenes set updated_at = now() where id = ${scene.row.id}`;
  return id;
}

/** Runs the storyteller but never lets its failure undo what the member did; returns a message to show instead. */
async function tryStoryteller(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof AiUnavailableError) return error.message;
    console.warn("[roleplay] storyteller failed", error);
    return "The AI storyteller could not answer. Try again in a moment.";
  }
}

function summaryOf(row: Record<string, unknown>): RoleplaySceneSummary {
  return {
    id: Number(row.id),
    communityId: String(row.community_id),
    title: String(row.title),
    source: String(row.source ?? ""),
    premise: String(row.premise ?? ""),
    status: row.status === "ended" ? "ended" : "open",
    castCount: Number(row.cast_count ?? 0),
    turnCount: Number(row.turn_count ?? 0),
    endingCount: Number(row.ending_count ?? 0),
    creatorName: String(row.creator_name ?? "Member"),
    updatedAt: iso(row.updated_at),
  };
}

/** The community's role-play stories, most recently active first. */
export const listScenes = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { slug: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as unknown as Viewer;
    await requireSceneRead(sql, userId, data.slug);
    const rows = await sql.query(
      `select s.*,
         coalesce(m.nickname, pr.display_name, 'Member') as creator_name,
         (select count(*)::int from roleplay_cast c where c.scene_id = s.id) as cast_count,
         (select count(*)::int from roleplay_turns t where t.scene_id = s.id and t.held = false) as turn_count,
         (select count(*)::int from roleplay_turns t where t.scene_id = s.id and t.held = false and t.kind = 'ending') as ending_count
       from roleplay_scenes s
       left join memberships m on m.user_id = s.creator_id and m.community_id = s.community_id
       left join profiles pr on pr.user_id = s.creator_id
       where s.community_id = $1 and (s.held = false or s.creator_id = $2)
       order by (s.status = 'open') desc, s.updated_at desc
       limit 60`,
      [data.slug, userId ?? ""],
    );
    return rows.map(summaryOf);
  });

/** One story with its characters and every visible turn. */
export const getScene = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: { sceneId: number }) => d)
  .handler(async ({ context, data }): Promise<RoleplayScene> => {
    const sql = await db();
    const { userId } = context as unknown as Viewer;
    const scene = await loadScene(sql, data.sceneId);
    const m = await requireSceneRead(sql, userId, scene.row.community_id);
    if (
      scene.row.held &&
      scene.row.creator_id !== userId &&
      !(m?.status === "active" && canModerate(m.role))
    )
      throw new Error("Story not found.");
    const blocked = await blockedSet(sql, userId);
    const turnRows = await sql.query(
      `select t.*, coalesce(m.nickname, pr.display_name, 'Member') as name, coalesce(pr.avatar_hue, 260) as hue,
              coalesce(pr.avatar_version, 0) as avatar_v
       from roleplay_turns t
       left join memberships m on m.user_id = t.author_user_id and m.community_id = $2
       left join profiles pr on pr.user_id = t.author_user_id
       where t.scene_id = $1 and t.held = false
       order by t.id
       limit 400`,
      [data.sceneId, scene.row.community_id],
    );
    const turns: RoleplayTurn[] = turnRows
      .filter((r) => !r.author_user_id || !blocked.has(String(r.author_user_id)))
      .map((r) => ({
        id: Number(r.id),
        kind: (["turn", "narration", "ending"].includes(String(r.kind))
          ? String(r.kind)
          : "turn") as RoleplayTurn["kind"],
        character: String(r.character_name ?? ""),
        author: r.author_user_id
          ? {
              userId: String(r.author_user_id),
              name: String(r.name),
              hue: Number(r.hue),
              avatarV: Number(r.avatar_v),
            }
          : null,
        body: String(r.body),
        createdAt: iso(r.created_at),
      }));
    const played = new Map(
      scene.cast.map((c) => [c.character_name.toLowerCase(), { userId: c.user_id, name: c.name }]),
    );
    const summary = summaryOf({
      ...scene.row,
      creator_name:
        (
          await sql<{ name: string }>`
            select coalesce(m.nickname, pr.display_name, 'Member') as name from profiles pr
            left join memberships m on m.user_id = pr.user_id and m.community_id = ${scene.row.community_id}
            where pr.user_id = ${scene.row.creator_id}`
        )[0]?.name ?? "Member",
      cast_count: scene.cast.length,
      turn_count: turns.length,
      ending_count: turns.filter((t) => t.kind === "ending").length,
    });
    return {
      ...summary,
      creatorId: scene.row.creator_id,
      characters: scene.characters.map((c) => ({
        ...c,
        playedBy: played.get(c.name.toLowerCase()) ?? null,
      })),
      turns,
      myCharacter: scene.cast.find((c) => c.user_id === userId)?.character_name ?? null,
      canManage: Boolean(
        userId &&
        (userId === scene.row.creator_id || (m?.status === "active" && canModerate(m.role))),
      ),
      canPlay: m?.status === "active" && summary.status === "open",
    };
  });

/** The AI storyteller sets up a whole story from a short idea. Nothing is saved; the creator can edit it first. */
export const draftScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { slug: string; source?: string; idea: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await requireScenePlay(sql, userId, data.slug);
    await guard(userId, "ai");
    const idea = String(data.idea ?? "").trim();
    if (idea.length < 5) throw new Error("Describe your idea in a few words first.");
    const err = scanText(`${data.source ?? ""}\n${idea}`);
    if (err) throw new Error(err);
    const reply = await chatComplete(sql, draftPrompt(String(data.source ?? ""), idea), {
      maxTokens: 900,
    }).catch((error: unknown) => {
      throw error instanceof AiUnavailableError ? new Error(error.message) : error;
    });
    return {
      source: String(data.source ?? "")
        .trim()
        .slice(0, 80),
      ...parseDraft(reply),
    };
  });

/**
 * Starts a story. With `opening` (from a draft) that text opens the story; otherwise the storyteller writes the opening
 * when it is available. The creator may pick a character to play straight away.
 */
export const createScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      slug: string;
      title: string;
      source?: string;
      premise: string;
      characters: SceneCharacter[];
      opening?: string;
      playAs?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await requireScenePlay(sql, userId, data.slug);
    await guard(userId, "post");
    const scene = checkScene(data);
    const err = scanText(
      `${scene.title}\n${scene.source}\n${scene.premise}\n${scene.characters.map((c) => `${c.name} ${c.description}`).join("\n")}`,
    );
    if (err) throw new Error(err);
    const created = await sql<{ id: number }>`
      insert into roleplay_scenes (community_id, creator_id, title, source, premise, characters)
      values (${data.slug}, ${userId}, ${scene.title}, ${scene.source}, ${scene.premise}, ${JSON.stringify(scene.characters)})
      returning id
    `;
    const sceneId = Number(created[0]!.id);
    const href = `/c/${data.slug}/roleplay/${sceneId}`;
    // The set-up itself is checked like a post (it is shown to the whole community).
    const { held } = await reviewContent(
      sql,
      {
        targetType: "scene",
        targetId: sceneId,
        authorId: userId,
        communityId: data.slug,
        text: `${scene.title}\n${scene.premise}\n${scene.characters.map((c) => `${c.name}: ${c.description}`).join("\n")}`,
        href,
        fiction: true,
      },
      notify,
    );
    if (data.playAs) {
      const character = scene.characters.find(
        (c) => c.name.toLowerCase() === String(data.playAs).trim().toLowerCase(),
      );
      if (character)
        await sql`insert into roleplay_cast (scene_id, user_id, character_name) values (${sceneId}, ${userId}, ${character.name})`;
    }
    let aiError: string | null = null;
    const opening = cleanReply(String(data.opening ?? ""), 1500);
    if (!held && opening) {
      const turn = await sql<{ id: number }>`
        insert into roleplay_turns (scene_id, author_user_id, character_name, kind, body)
        values (${sceneId}, ${null}, ${""}, 'narration', ${opening}) returning id
      `;
      await reviewContent(
        sql,
        {
          targetType: "roleplay",
          targetId: Number(turn[0]!.id),
          authorId: STORYTELLER,
          communityId: data.slug,
          text: opening,
          href,
          fiction: true,
        },
        notify,
      );
    } else if (!held && aiConfig().chat) {
      aiError = await tryStoryteller(async () =>
        storytellerWrites(sql, await loadScene(sql, sceneId), "narration", ""),
      );
    }
    return { id: sceneId, held, aiError };
  });

/** Claims a character. A member plays one character per story; a new character can be added if there is room. */
export const joinScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number; character: string; description?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const scene = await loadScene(sql, data.sceneId);
    await requireScenePlay(sql, userId, scene.row.community_id);
    if (scene.row.status !== "open" || scene.row.held)
      throw new Error("This story is not open for new players.");
    const wanted = String(data.character ?? "")
      .trim()
      .slice(0, 40);
    if (wanted.length < 2) throw new Error("Choose a character.");
    const err = scanText(`${wanted}\n${data.description ?? ""}`);
    if (err) throw new Error(err);
    let character = scene.characters.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
    if (!character) {
      if (scene.characters.length >= MAX_CHARACTERS)
        throw new Error("This story already has all its characters.");
      character = {
        name: wanted,
        description: String(data.description ?? "")
          .trim()
          .slice(0, 200),
      };
      await sql`update roleplay_scenes set characters = ${JSON.stringify([...scene.characters, character])} where id = ${data.sceneId}`;
    }
    const taken = scene.cast.find(
      (c) => c.character_name.toLowerCase() === character.name.toLowerCase(),
    );
    if (taken && taken.user_id !== userId)
      throw new Error(`${character.name} is already played by ${taken.name}.`);
    await sql`
      insert into roleplay_cast (scene_id, user_id, character_name) values (${data.sceneId}, ${userId}, ${character.name})
      on conflict (scene_id, user_id) do update set character_name = excluded.character_name
    `;
    return { character: character.name };
  });

export const leaveScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await sql`delete from roleplay_cast where scene_id = ${data.sceneId} and user_id = ${userId}`;
    return { ok: true };
  });

/**
 * A member's turn as their character. The storyteller then narrates what happens next (when it is set up and
 * `narrate` is not false). A storyteller problem never loses the member's turn: it comes back as `aiError`.
 */
export const addTurn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number; body: string; narrate?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    await guard(userId, "message");
    const scene = await loadScene(sql, data.sceneId);
    await requireScenePlay(sql, userId, scene.row.community_id);
    if (scene.row.status !== "open" || scene.row.held) throw new Error("This story has ended.");
    const me = scene.cast.find((c) => c.user_id === userId);
    if (!me) throw new Error("Pick a character to play first.");
    const body = String(data.body ?? "")
      .trim()
      .slice(0, MAX_TURN_CHARS);
    if (!body) throw new Error("Write what your character says or does.");
    const err = scanText(body);
    if (err) throw new Error(err);
    const turn = await sql<{ id: number }>`
      insert into roleplay_turns (scene_id, author_user_id, character_name, kind, body)
      values (${data.sceneId}, ${userId}, ${me.character_name}, 'turn', ${body}) returning id
    `;
    await sql`update roleplay_scenes set updated_at = now() where id = ${data.sceneId}`;
    const { held } = await reviewContent(
      sql,
      {
        targetType: "roleplay",
        targetId: Number(turn[0]!.id),
        authorId: userId,
        communityId: scene.row.community_id,
        text: body,
        href: `/c/${scene.row.community_id}/roleplay/${data.sceneId}`,
        fiction: true,
      },
      notify,
    );
    let aiError: string | null = null;
    if (!held && data.narrate !== false && aiConfig().chat) {
      await guard(userId, "ai");
      aiError = await tryStoryteller(async () =>
        storytellerWrites(sql, await loadScene(sql, data.sceneId), "narration", ""),
      );
    }
    return { id: Number(turn[0]!.id), held, aiError };
  });

/** Anyone in the cast asks the storyteller to move the story on, optionally with a suggestion ("a storm hits"). */
export const continueScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number; nudge?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const scene = await loadScene(sql, data.sceneId);
    await requireScenePlay(sql, userId, scene.row.community_id);
    if (scene.row.status !== "open") throw new Error("This story has ended.");
    if (!scene.cast.some((c) => c.user_id === userId) && scene.row.creator_id !== userId)
      throw new Error("Pick a character to play first.");
    const nudge = String(data.nudge ?? "")
      .trim()
      .slice(0, 200);
    const err = nudge ? scanText(nudge) : null;
    if (err) throw new Error(err);
    await guard(userId, "ai");
    const aiError = await tryStoryteller(() => storytellerWrites(sql, scene, "narration", nudge));
    if (aiError) throw new Error(aiError);
    return { ok: true };
  });

/** Asks the storyteller for an alternate ending in the direction a member chose. A story can collect several endings. */
export const writeEnding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number; direction: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    const { userId } = context as Authed;
    const scene = await loadScene(sql, data.sceneId);
    await requireScenePlay(sql, userId, scene.row.community_id);
    if (!scene.cast.some((c) => c.user_id === userId) && scene.row.creator_id !== userId)
      throw new Error("Pick a character to play first.");
    const direction = String(data.direction ?? "")
      .trim()
      .slice(0, 300);
    if (direction.length < 5) throw new Error("Say how you would like the story to end.");
    const err = scanText(direction);
    if (err) throw new Error(err);
    await guard(userId, "ai");
    const aiError = await tryStoryteller(() => storytellerWrites(sql, scene, "ending", direction));
    if (aiError) throw new Error(aiError);
    return { ok: true };
  });

async function requireSceneManager(sql: Sql, userId: string, sceneId: number) {
  const scene = await loadScene(sql, sceneId);
  if (scene.row.creator_id === userId) return scene;
  const m = await membershipOf(sql, userId, scene.row.community_id);
  if (m?.status === "active" && canModerate(m.role)) return scene;
  throw new Error("Only the story's creator or a moderator can do that.");
}

/** Closes a story: it can still be read, but nobody can add to it. */
export const endScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    await requireSceneManager(sql, (context as Authed).userId, data.sceneId);
    await sql`update roleplay_scenes set status = 'ended', updated_at = now() where id = ${data.sceneId}`;
    return { ok: true };
  });

export const deleteScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { sceneId: number }) => d)
  .handler(async ({ context, data }) => {
    const sql = await db();
    await requireSceneManager(sql, (context as Authed).userId, data.sceneId);
    await sql`delete from roleplay_turns where scene_id = ${data.sceneId}`;
    await sql`delete from roleplay_cast where scene_id = ${data.sceneId}`;
    await sql`delete from roleplay_scenes where id = ${data.sceneId}`;
    return { ok: true };
  });
