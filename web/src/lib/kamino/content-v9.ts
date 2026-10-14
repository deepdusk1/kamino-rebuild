import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { optionalAuth, type Viewer } from "./optional-auth";
import { internals } from "./server";
import { asBool, iso, parseJson } from "./map";
import { canModerate, scanText } from "./safety";
import { reviewContent } from "./safety.server";
import { guard } from "./guard";
import { storeMedia, loadMedia, deleteMedia } from "./media-store.server";
import { POST_EMOJI, CONTENT_LIMITS, checkedContentMedia, safeFilename } from "./content-rules";
import { articleWithImages, moderationTextSegments } from "./media-v10-rules";
import { withStoryOwnerLock } from "./profile-stories.server";

type Sql = Awaited<ReturnType<typeof internals.db>>;
type Authed = { userId: string };
const {
  db,
  requirePostAccess,
  requireRoomAccess,
  requireActiveMember,
  requireMinAge,
  membershipOf,
  requireCommunity,
  canRead,
  canSeePostRow,
  blockedSet,
  assertNotMuted,
  notify,
} = internals;
const id = z.number().int().positive();
const postInput = z.object({ postId: id });
const roomInput = z.object({ roomId: id });
const text = (max: number) => z.string().trim().max(max);
const mediaSchema = z.object({
  kind: z.enum(["image", "gif", "video", "short", "audio", "file"]),
  dataUrl: z.string().max(32_000_100),
  filename: text(120).default("attachment"),
  altText: text(600).default(""),
  captions: text(12000).default(""),
});
const uid = (context: unknown) => (context as Viewer).userId ?? null;
function checkText(value: string) {
  const error = scanText(value);
  if (error) throw new Error(error);
}

export const getUploadAllowance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { hasPremium } = await import("./premium.server");
    const premium = await hasPremium(await db(), String(uid(context)));
    return {
      premium,
      animatedAvatar: premium,
      avatarBytes: premium ? 2_000_000 : 215_000,
      limits: Object.fromEntries(
        Object.entries(CONTENT_LIMITS).map(([kind, size]) => [kind, size * (premium ? 2 : 1)]),
      ),
    };
  });

async function profileReadable(sql: Sql, viewer: string | null, owner: string) {
  const p = (await sql`select user_id,private_account from profiles where user_id=${owner}`)[0];
  if (!p || (await blockedSet(sql, viewer)).has(owner)) throw new Error("Profile unavailable.");
  if (
    asBool(p.private_account) &&
    viewer !== owner &&
    !(
      viewer &&
      (
        await sql`select 1 from profile_follows where follower_id=${viewer} and followee_id=${owner}`
      ).length
    )
  )
    throw new Error("Follow this private profile first.");
}

/** Highlighted stories retain the same community, profile, age, block and hidden-content protections. */
async function contentAccess(sql: Sql, viewer: string | null, postId: number) {
  const post = (await sql`select * from posts where id=${postId}`)[0];
  if (!post) throw new Error("Post unavailable.");
  await internals.assertAccountAllowed(sql,String(post.author_user_id));
  if(viewer&&post.content_warning&&(await sql`select 1 from profiles where user_id=${viewer} and sensitive_content='hide'`).length)throw new Error("Post unavailable.");
  if (!post.expires_at || new Date(String(post.expires_at)).getTime() > Date.now())
    return requirePostAccess(sql, viewer, postId);
  const highlighted =
    await sql`select 1 from profile_highlight_posts hp join profile_highlights h on h.id=hp.highlight_id where hp.post_id=${postId} and h.user_id=${String(post.author_user_id)} limit 1`;
  if (!highlighted.length || post.type !== "story" || asBool(post.hidden))
    throw new Error("Story expired.");
  await profileReadable(sql, viewer, String(post.author_user_id));
  const community = await requireCommunity(sql, String(post.community_id));
  const member = await membershipOf(sql, viewer, community.id);
  if (!canRead(community, member) || !canSeePostRow(post, viewer, member))
    throw new Error("Story unavailable.");
  // The shared guard is added by the account/safety module during this release.
  const guardReadable = (
    internals as typeof internals & {
      assertCommunityReadable?: (s: Sql, v: string | null, c: string) => Promise<unknown>;
    }
  ).assertCommunityReadable;
  if (guardReadable) await guardReadable(sql, viewer, String(post.community_id));
  return post;
}

export const postContentTools = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: unknown) => postInput.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      viewer = uid(context);
    const post = await contentAccess(sql, viewer, data.postId);
    const settings = (
      await sql`select * from post_content_settings where post_id=${data.postId}`
    )[0];
    const mine = viewer
      ? (
          await sql`select * from post_personal_settings where post_id=${data.postId} and user_id=${viewer}`
        )[0]
      : null;
    const reactions = await sql<{
      emoji: string;
      count: number;
      mine: boolean;
    }>`select emoji,count(*)::int as count,bool_or(user_id=${viewer ?? ""}) as mine from post_emoji_reactions where post_id=${data.postId} group by emoji order by count(*) desc`;
    const media = await sql<{
      id: number;
      kind: string;
      filename: string;
      alt_text: string;
      captions: string;
      byte_size: number;
    }>`select id,kind,filename,alt_text,captions,byte_size from content_media where post_id=${data.postId} order by id`;
    const best = (
      await sql<{
        comment_id: number;
      }>`select comment_id from post_best_answers where post_id=${data.postId}`
    )[0];
    const parents = await sql<{
      id: number;
      parent_comment_id: number | null;
    }>`select id,parent_comment_id from comments where post_id=${data.postId} and held=false`;
    const history = await sql<{
      id: number;
      title: string;
      body: string;
      edited_at: string;
    }>`select id,title,body,edited_at from post_edit_history where post_id=${data.postId} order by id desc limit 20`;
    const member = await membershipOf(sql, viewer, String(post.community_id));
    return {
      reactions: reactions.map((r) => ({ ...r, mine: asBool(r.mine) })),
      media: media.filter(m=>m.kind!=="image"||parseJson<{format?:string}>(post.payload,{}).format!=="markdown"||!String(post.body).split("\n").some(line=>new RegExp(`^!\\[[^\\]]*\\]\\(/api/v1/content-media/${m.id}\\)$`).test(line))).map((m) => ({
        id: Number(m.id),
        kind: m.kind,
        filename: m.filename,
        altText: m.alt_text,
        captions: m.captions,
        bytes: Number(m.byte_size),
        url: `/api/v1/content-media/${m.id}`,
      })),
      bestAnswerId: best ? Number(best.comment_id) : null,
      parents: parents.map((p) => ({
        id: Number(p.id),
        parentId: p.parent_comment_id ? Number(p.parent_comment_id) : null,
      })),
      history: history.map((h) => ({
        id: Number(h.id),
        title: h.title,
        body: h.body,
        editedAt: iso(h.edited_at),
      })),
      sharingAllowed: settings ? asBool(settings.sharing_allowed) : true,
      commentRule: String(settings?.comment_rule ?? "members"),
      hidden: asBool(mine?.hidden),
      muted: asBool(mine?.muted),
      following: asBool(mine?.following),
      canChooseAnswer:
        viewer === post.author_user_id || (member?.status === "active" && canModerate(member.role)),
      canManage: viewer === post.author_user_id,
    };
  });

export const reactToPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ postId: id, emoji: z.enum(POST_EMOJI) }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    const p = await requirePostAccess(sql, userId, data.postId);
    await requireActiveMember(sql, userId, String(p.community_id));
    await guard(userId, "follow");
    const gone =
      await sql`delete from post_emoji_reactions where post_id=${data.postId} and user_id=${userId} and emoji=${data.emoji} returning emoji`;
    if (!gone.length)
      await sql`insert into post_emoji_reactions(post_id,user_id,emoji) values(${data.postId},${userId},${data.emoji}) on conflict do nothing`;
    return { reacted: !gone.length };
  });

export const setPostPersonal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        postId: id,
        hidden: z.boolean().optional(),
        muted: z.boolean().optional(),
        following: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    await requirePostAccess(sql, userId, data.postId);
    await sql`insert into post_personal_settings(post_id,user_id) values(${data.postId},${userId}) on conflict do nothing`;
    if (data.hidden !== undefined)
      await sql`update post_personal_settings set hidden=${data.hidden} where post_id=${data.postId} and user_id=${userId}`;
    if (data.muted !== undefined)
      await sql`update post_personal_settings set muted=${data.muted} where post_id=${data.postId} and user_id=${userId}`;
    if (data.following !== undefined)
      await sql`update post_personal_settings set following=${data.following} where post_id=${data.postId} and user_id=${userId}`;
    return { ok: true };
  });

export const setPostContentRules = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        postId: id,
        sharingAllowed: z.boolean(),
        commentRule: z.enum(["members", "followers", "none"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed,
      p = await requirePostAccess(sql, userId, data.postId);
    if (p.author_user_id !== userId)
      throw new Error("Only the author can change sharing permissions.");
    await sql`insert into post_content_settings(post_id,sharing_allowed,comment_rule) values(${data.postId},${data.sharingAllowed},${data.commentRule}) on conflict(post_id) do update set sharing_allowed=excluded.sharing_allowed,comment_rule=excluded.comment_rule`;
    await sql`update posts set comments_disabled=${data.commentRule === "none"} where id=${data.postId}`;
    return { ok: true };
  });

export const recordPostView = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => postInput.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    await requirePostAccess(sql, userId, data.postId);
    await sql`insert into post_views(post_id,user_id) values(${data.postId},${userId}) on conflict(post_id,user_id) do update set last_at=now()`;
    return { ok: true };
  });

export const postAnalytics = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => postInput.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed,
      p = await requirePostAccess(sql, userId, data.postId);
    const m = await membershipOf(sql, userId, String(p.community_id));
    if (p.author_user_id !== userId && !(m?.status === "active" && canModerate(m.role)))
      throw new Error("Analytics are for the author and community moderators.");
    const rows = await sql<{
      views: number;
      followers: number;
      reactions: number;
      saves: number;
      reposts: number;
    }>`select (select count(*)::int from post_views where post_id=${data.postId}) as views,(select count(*)::int from post_personal_settings where post_id=${data.postId} and following=true) as followers,(select count(*)::int from post_emoji_reactions where post_id=${data.postId}) as reactions,(select count(*)::int from favorites where post_id=${data.postId}) as saves,(select count(*)::int from posts where original_post_id=${data.postId}) as reposts`;
    return { ...rows[0], likes: Number(p.like_count), comments: Number(p.comment_count) };
  });

export const replyToComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z.object({ postId: id, parentId: id, body: text(2000).min(1) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed,
      p = await requirePostAccess(sql, userId, data.postId);
    await requireMinAge(sql, userId);
    await requireActiveMember(sql, userId, String(p.community_id));
    await assertNotMuted(sql, userId, String(p.community_id));
    await guard(userId, "comment");
    checkText(data.body);
    const settings = (
      await sql`select comment_rule from post_content_settings where post_id=${data.postId}`
    )[0];
    if (asBool(p.comments_disabled) || settings?.comment_rule === "none")
      throw new Error("Comments are closed.");
    if (
      settings?.comment_rule === "followers" &&
      p.author_user_id !== userId &&
      !(
        await sql`select 1 from profile_follows where follower_id=${userId} and followee_id=${String(p.author_user_id)}`
      ).length
    )
      throw new Error("Only the author's followers can reply.");
    const parent = (
      await sql`select * from comments where id=${data.parentId} and post_id=${data.postId} and held=false`
    )[0];
    if (!parent || (await blockedSet(sql, userId)).has(String(parent.author_user_id)))
      throw new Error("Reply unavailable.");
    const [row] = await sql<{
      id: number;
    }>`insert into comments(post_id,parent_comment_id,author_user_id,body,held) values(${data.postId},${data.parentId},${userId},${data.body},true) returning id`;
    const { held } = await reviewContent(
      sql,
      {
        targetType: "comment",
        targetId: row!.id,
        authorId: userId,
        communityId: String(p.community_id),
        text: data.body,
        href: `/c/${p.community_id}/p/${data.postId}`,
      },
      notify,
    );
    if (!held) {
      await sql`update comments set held=false where id=${row!.id}`;
      await sql`update posts set comment_count=comment_count+1 where id=${data.postId}`;
      const followers = await sql<{
        user_id: string;
      }>`select user_id from post_personal_settings where post_id=${data.postId} and following=true and muted=false`;
      const recipients = new Set([
        String(parent.author_user_id),
        String(p.author_user_id),
        ...followers.map((f) => f.user_id),
      ]);
      for (const recipient of recipients) {
        if (recipient === userId) continue;
        if (
          (
            await sql`select 1 from post_personal_settings where post_id=${data.postId} and user_id=${recipient} and muted=true`
          ).length
        )
          continue;
        try {
          await requirePostAccess(sql, recipient, data.postId);
        } catch {
          continue;
        }
        await notify(
          sql,
          recipient,
          "comment",
          "New reply",
          data.body.slice(0, 80),
          `/c/${p.community_id}/p/${data.postId}`,
          { actorId: userId, targetType: "post", targetId: data.postId },
        );
      }
    }
    return { id: Number(row!.id), held };
  });

export const chooseBestAnswer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ postId: id, commentId: id.nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed,
      p = await requirePostAccess(sql, userId, data.postId),
      m = await membershipOf(sql, userId, String(p.community_id));
    if (p.type !== "question") throw new Error("Best answers are for Q&A posts.");
    if (p.author_user_id !== userId && !(m?.status === "active" && canModerate(m.role)))
      throw new Error("Only the asker or a moderator can choose an answer.");
    if (data.commentId === null) {
      await sql`delete from post_best_answers where post_id=${data.postId}`;
      return { ok: true };
    }
    const answer = (
      await sql`select author_user_id from comments where id=${data.commentId} and post_id=${data.postId} and held=false`
    )[0];
    if (!answer) throw new Error("Answer unavailable.");
    await sql`insert into post_best_answers(post_id,comment_id,chosen_by) values(${data.postId},${data.commentId},${userId}) on conflict(post_id) do update set comment_id=excluded.comment_id,chosen_by=excluded.chosen_by,chosen_at=now()`;
    await notify(
      sql,
      String(answer.author_user_id),
      "achievement",
      "Your answer was accepted",
      String(p.title).slice(0, 80),
      `/c/${p.community_id}/p/${data.postId}`,
      { actorId: userId, targetType: "post", targetId: data.postId },
    );
    return { ok: true };
  });

export const createMediaPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        slug: text(100).min(1),
        title: text(160).min(3),
        body: text(30000).default(""),
        kind: z.enum(["article", "video", "short", "audio", "gif", "story"]),
        media: mediaSchema.optional(),
        images: z.array(mediaSchema.extend({kind:z.literal("image")})).max(6).default([]),
        sharingAllowed: z.boolean().default(true),
        commentRule: z.enum(["members", "followers", "none"]).default("members"),
        visibility: z.enum(["public", "members"]).default("public"),
        contentWarning: text(160).default(""),
        publishAt: z.string().datetime().nullable().optional(),
        story: z
          .object({
            scope: z.enum(["profile", "community"]).default("community"),
            background: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .default("#7548df"),
            overlayText: text(400).default(""),
            sticker: text(32).default(""),
            mentions: z.array(text(30)).max(5).default([]),
            question: text(200).default(""),
            pollOptions: z.array(text(80).min(1)).max(4).default([]),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    await guard(userId, "post");
    await requireMinAge(sql, userId);
    await requireActiveMember(sql, userId, data.slug);
    await assertNotMuted(sql, userId, data.slug);
    const readable = (
      internals as typeof internals & {
        assertCommunityReadable?: (s: Sql, v: string, c: string) => Promise<unknown>;
      }
    ).assertCommunityReadable;
    if (readable) await readable(sql, userId, data.slug);
    for(const segment of moderationTextSegments(`${data.title}\n${data.body}\n${data.story?.overlayText ?? ""}\n${data.story?.question ?? ""}`))checkText(segment);
    if (data.kind !== "article" && data.kind !== "story" && !data.media)
      throw new Error("Attach media first.");
    if (data.images.length && data.kind !== "article") throw new Error("Image blocks belong to articles.");
    if (data.images.length && data.media) throw new Error("Use the article image blocks instead of a separate attachment.");
    if (
      data.media &&
      data.kind !== "story" &&
      data.kind !== "article" &&
      data.media.kind !== data.kind
    )
      throw new Error("The attachment doesn't match this post type.");
    if (data.kind === "story" && data.media?.kind === "file")
      throw new Error("Stories accept pictures, GIFs, video and audio.");
    if (data.story?.pollOptions.length === 1)
      throw new Error("A story poll needs at least two choices.");
    const when = data.publishAt ? new Date(data.publishAt) : null;
    if (when && (when.getTime() > Date.now() + 60 * 86400000 || when.getTime() < Date.now()))
      throw new Error("Schedule within the next 60 days.");
    const { hasPremium } = await import("./premium.server");
    const files = data.images.length ? data.images : data.media ? [data.media] : [];
    const premium = files.length ? await hasPremium(sql,userId) : false;
    const checked = files.map(file=>checkedContentMedia(file.kind,file.dataUrl,premium));
    if(checked.reduce((sum,file)=>sum+file.bytes,0)>24_000_000) throw new Error("Keep the combined attachments under 24 MB.");
    if (files.length) await guard(userId, "upload");
    const stored:string[]=[];
    const type = data.kind === "story" ? "story" : "blog";
    try {
      return await withStoryOwnerLock(sql,userId,async sql=>{
      await requireMinAge(sql,userId);
      await requireActiveMember(sql,userId,data.slug);
      await assertNotMuted(sql,userId,data.slug);
      if(readable)await readable(sql,userId,data.slug);
      for(const file of files) stored.push(await storeMedia("content",file.dataUrl));
      const [post] = await sql<{
        id: number;
      }>`insert into posts(community_id,author_user_id,type,title,body,payload,hidden,content_warning,visibility,comments_disabled,publish_at,expires_at) values(${data.slug},${userId},${type},${data.title},${data.body},${JSON.stringify({ format: data.kind === "article" ? "markdown" : undefined, contentKind: data.kind })},true,${data.contentWarning},${data.visibility},${data.commentRule === "none"},${when?.toISOString() ?? null},${data.kind === "story" ? new Date((when?.getTime() ?? Date.now()) + 86400000).toISOString() : null}) returning id`;
      const postId = Number(post!.id);
      await sql`insert into post_content_settings(post_id,sharing_allowed,comment_rule) values(${postId},${data.sharingAllowed},${data.commentRule})`;
      const articleImages:{id:number;altText:string}[]=[];
      for (const [index,file] of files.entries()) {
        const [asset] = await sql<{
          id: number;
        }>`insert into content_media(post_id,kind,storage_ref,filename,mime,byte_size,alt_text,captions) values(${postId},${file.kind},${stored[index]!},${safeFilename(file.filename)},${checked[index]!.mime},${checked[index]!.bytes},${file.altText},${file.captions}) returning id`;
        if (data.kind === "article" && file.kind === "image")articleImages.push({id:Number(asset!.id),altText:file.altText});
      }
      if(data.kind==="article"&&articleImages.length) await sql`update posts set body=${articleWithImages(data.images.length?data.body:data.body.replaceAll("[image]","[image:1]"),articleImages)} where id=${postId}`;
      if (data.kind === "story")
        await sql`insert into story_details(post_id,scope,background,overlay_text,sticker,mentions,question,poll_options) values(${postId},${data.story?.scope ?? "community"},${data.story?.background ?? "#7548df"},${data.story?.overlayText ?? data.body.slice(0, 400)},${data.story?.sticker ?? ""},${JSON.stringify(data.story?.mentions ?? [])},${data.story?.question ?? ""},${JSON.stringify(data.story?.pollOptions ?? [])})`;
      const { held } = await reviewContent(
        sql,
        {
          targetType: "post",
          targetId: postId,
          authorId: userId,
          communityId: data.slug,
          text: `${data.title}\n${data.body}\n${data.story?.overlayText ?? ""}\n${files.map(file=>`${file.altText}\n${file.captions}`).join("\n")}`,
          images: files.filter(file=>file.kind==="image"||file.kind==="gif").map(file=>file.dataUrl),
          href: `/c/${data.slug}/p/${postId}`,
        },
        notify,
      );
      if (!held) await sql`update posts set hidden=false where id=${postId}`;
      return { id: postId, held, slug: data.slug };
      });
    } catch (error) {
      if (stored.length) await deleteMedia(stored);
      throw error;
    }
  });

export const getContentMedia = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: unknown) => z.object({ mediaId: id }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      viewer = uid(context),
      m = (await sql`select * from content_media where id=${data.mediaId}`)[0];
    if (!m) throw new Error("Attachment unavailable.");
    if (m.post_id) await contentAccess(sql, viewer, Number(m.post_id));
    else {
      if (!viewer) throw new Error("Sign in first.");
      const message = (
        await sql`select * from messages where id=${Number(m.message_id)} and deleted=false and held=false`
      )[0];
      if (!message) throw new Error("Attachment unavailable.");
      await requireRoomAccess(sql, viewer, Number(message.room_id));
      if ((await blockedSet(sql, viewer)).has(String(message.author_user_id)))
        throw new Error("Attachment unavailable.");
    }
    return {
      dataUrl: await loadMedia(String(m.storage_ref)),
      mime: String(m.mime),
      filename: String(m.filename),
      kind: String(m.kind),
      captions: String(m.captions),
    };
  });

export const getStoryTools = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: unknown) => postInput.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      viewer = uid(context),
      p = await contentAccess(sql, viewer, data.postId);
    if (p.type !== "story") throw new Error("Story unavailable.");
    const s = (await sql`select * from story_details where post_id=${data.postId}`)[0];
    const responses = await sql<{
      option_index: number | null;
      count: number;
    }>`select option_index,count(*)::int as count from story_responses where post_id=${data.postId} and option_index is not null group by option_index`;
    const mine = viewer
      ? (
          await sql`select option_index,answer from story_responses where post_id=${data.postId} and user_id=${viewer}`
        )[0]
      : null;
    const answers =
      viewer === p.author_user_id
        ? await sql<{
            answer: string;
          }>`select answer from story_responses where post_id=${data.postId} and answer<>'' order by created_at desc limit 100`
        : [];
    return {
      scope: String(s?.scope ?? "community"),
      background: String(s?.background ?? "#7548df"),
      overlayText: String(s?.overlay_text ?? p.body),
      sticker: String(s?.sticker ?? ""),
      mentions: parseJson<string[]>(s?.mentions, []),
      question: String(s?.question ?? ""),
      pollOptions: parseJson<string[]>(s?.poll_options, []),
      responses,
      mine: mine
        ? {
            optionIndex: mine.option_index == null ? null : Number(mine.option_index),
            answer: String(mine.answer),
          }
        : null,
      answers: answers.map((a) => a.answer),
      authorId: String(p.author_user_id),
      title: String(p.title),
    };
  });

export const respondToStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        postId: id,
        optionIndex: z.number().int().min(0).max(3).optional(),
        answer: text(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed,
      p = await contentAccess(sql, userId, data.postId);
    await requireActiveMember(sql, userId, String(p.community_id));
    await assertNotMuted(sql, userId, String(p.community_id));
    await guard(userId, "comment");
    const s = (await sql`select * from story_details where post_id=${data.postId}`)[0];
    if (!s) throw new Error("Story unavailable.");
    const options = parseJson<string[]>(s.poll_options, []);
    if (data.optionIndex !== undefined && !options[data.optionIndex])
      throw new Error("Choose an available poll option.");
    if (data.answer && !s.question) throw new Error("This story has no question.");
    if (data.optionIndex === undefined && !data.answer)
      throw new Error("Choose an option or write an answer.");
    checkText(data.answer ?? "");
    await sql`insert into story_responses(post_id,user_id,option_index,answer) values(${data.postId},${userId},${data.optionIndex ?? null},${data.answer ?? ""}) on conflict(post_id,user_id) do update set option_index=coalesce(excluded.option_index,story_responses.option_index),answer=case when excluded.answer<>'' then excluded.answer else story_responses.answer end`;
    return { ok: true };
  });

export const saveProfileHighlight = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z.object({ title: text(40).min(1), postIds: z.array(id).min(1).max(20) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    checkText(data.title);
    if (
      Number(
        (
          await sql<{
            n: number;
          }>`select count(*)::int as n from profile_highlights where user_id=${userId}`
        )[0]?.n ?? 0,
      ) >= 20
    )
      throw new Error("Keep up to 20 highlight collections.");
    for (const postId of data.postIds) {
      const p = (
        await sql`select * from posts where id=${postId} and author_user_id=${userId} and type='story'`
      )[0];
      if (!p || asBool(p.hidden)) throw new Error("Choose one of your published stories.");
      await requireActiveMember(sql, userId, String(p.community_id));
    }
    const [h] = await sql<{
      id: number;
    }>`insert into profile_highlights(user_id,title) values(${userId},${data.title}) returning id`;
    for (const postId of [...new Set(data.postIds)])
      await sql`insert into profile_highlight_posts(highlight_id,post_id) values(${h!.id},${postId})`;
    return { id: Number(h!.id) };
  });

export const savePortfolioItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        title: text(100).min(3),
        description: text(1500).default(""),
        url: z.string().url().max(600).optional(),
        postId: id.optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    checkText(`${data.title}\n${data.description}`);
    if (data.url && !data.url.startsWith("https://"))
      throw new Error("Use an HTTPS portfolio link.");
    if (data.postId) {
      const p = await requirePostAccess(sql, userId, data.postId);
      if (p.author_user_id !== userId) throw new Error("Feature your own work.");
    }
    if (
      Number(
        (
          await sql<{
            n: number;
          }>`select count(*)::int as n from profile_portfolio where user_id=${userId}`
        )[0]?.n ?? 0,
      ) >= 40
    )
      throw new Error("Keep up to 40 portfolio items.");
    const [r] = await sql<{
      id: number;
    }>`insert into profile_portfolio(user_id,title,description,url,post_id) values(${userId},${data.title},${data.description},${data.url ?? ""},${data.postId ?? null}) returning id`;
    return { id: Number(r!.id) };
  });

export const removeProfileContent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ kind: z.enum(["highlight", "portfolio"]), id }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    if (data.kind === "highlight")
      await sql`delete from profile_highlights where id=${data.id} and user_id=${userId}`;
    else await sql`delete from profile_portfolio where id=${data.id} and user_id=${userId}`;
    return { ok: true };
  });

export const profileContent = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: unknown) => z.object({ userId: text(200).min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      viewer = uid(context);
    await profileReadable(sql, viewer, data.userId);
    const portfolio = await sql<{
      id: number;
      title: string;
      description: string;
      url: string;
      post_id: number | null;
    }>`select id,title,description,url,post_id from profile_portfolio where user_id=${data.userId} order by position,id desc`;
    const highlightRows = await sql<{
      id: number;
      title: string;
      post_id: number;
    }>`select h.id,h.title,hp.post_id from profile_highlights h join profile_highlight_posts hp on hp.highlight_id=h.id where h.user_id=${data.userId} order by h.id desc`;
    const posts = await sql<{
      id: number;
      title: string;
      community_id: string;
      type: string;
    }>`select id,title,community_id,type from posts where author_user_id=${data.userId} and hidden=false and (type='story' or exists(select 1 from content_media m where m.post_id=posts.id) or cover<>'') order by id desc limit 100`;
    const readable = new Set<number>(),
      media: typeof posts = [];
    for (const p of posts) {
      try {
        await contentAccess(sql, viewer, Number(p.id));
        readable.add(Number(p.id));
        media.push(p);
      } catch {
        /* Never leak private/age-gated titles. */
      }
    }
    const highlights: { id: number; title: string; postIds: number[] }[] = [];
    for (const h of highlightRows) {
      if (!readable.has(Number(h.post_id))) continue;
      let group = highlights.find((x) => x.id === Number(h.id));
      if (!group) {
        group = { id: Number(h.id), title: h.title, postIds: [] };
        highlights.push(group);
      }
      group.postIds.push(Number(h.post_id));
    }
    const shownPortfolio = [];
    for (const item of portfolio) {
      if (item.post_id) {
        try {
          await requirePostAccess(sql, viewer, Number(item.post_id));
        } catch {
          continue;
        }
      }
      shownPortfolio.push({
        id: Number(item.id),
        title: item.title,
        description: item.description,
        url: item.url,
        postId: item.post_id ? Number(item.post_id) : null,
      });
    }
    return {
      portfolio: shownPortfolio,
      highlights,
      media: media.map((p) => ({
        id: Number(p.id),
        title: p.title,
        slug: p.community_id,
        type: p.type,
      })),
      mine: viewer === data.userId,
    };
  });

async function peerAllowed(sql: Sql, userId: string, target: string) {
  const { assertInviteAllowed } = await import("./identity-v9");
  await assertInviteAllowed(sql, userId, target);
  if (target === userId) return;
  if ((await blockedSet(sql, userId)).has(target))
    throw new Error("A blocked account cannot be added to this conversation.");
  const p = (await sql`select dm_privacy from profiles where user_id=${target}`)[0];
  if (!p) throw new Error("Member not found.");
  if (p.dm_privacy === "none") throw new Error("This member has messaging closed.");
  const shared =
    (
      await sql`select 1 from memberships a join memberships b on a.community_id=b.community_id where a.user_id=${userId} and b.user_id=${target} and a.status='active' and b.status='active' limit 1`
    ).length > 0;
  // Membership is added only after the recipient accepts the invitation.
  if (p.dm_privacy === "members" && !shared)
    throw new Error("This member limits chats to shared communities.");
  const helper = (
    internals as typeof internals & {
      assertPeerContactAllowed?: (s: Sql, u: string, t: string) => Promise<unknown>;
    }
  ).assertPeerContactAllowed;
  if (helper) await helper(sql, userId, target);
}

export const createGroupChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        name: text(70).min(3),
        handles: z
          .array(
            z
              .string()
              .trim()
              .toLowerCase()
              .regex(/^[a-z0-9_-]{2,30}$/),
          )
          .min(1)
          .max(19),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    await requireMinAge(sql, userId);
    await guard(userId, "invite");
    checkText(data.name);
    const peers = await sql<{
      user_id: string;
      handle: string;
    }>`select user_id,handle from profiles where handle=any(${[...new Set(data.handles)]})`;
    if (peers.length !== new Set(data.handles).size)
      throw new Error("One of those handles was not found.");
    for (const p of peers) await peerAllowed(sql, userId, p.user_id);
    const ids = [...new Set([userId, ...peers.map((p) => p.user_id)])];
    if (ids.length < 2) throw new Error("Choose another member.");
    if (!sql.transaction) throw new Error("Transactional storage is required.");
    const { stageGroupInvitation } = await import("./social-events-v10.server");
    const roomId = await sql.transaction(async (tx) => {
      const [room] = await tx`insert into chat_rooms(name,kind,created_by) values(${data.name},'group',${userId}) returning id`;
      const roomId = Number(room.id);
      await tx`insert into chat_members(room_id,user_id) values(${roomId},${userId})`;
      for (const peer of peers) if (peer.user_id !== userId) await stageGroupInvitation(tx,roomId,userId,peer.user_id);
      return roomId;
    });
    for (const peer of peers) if (peer.user_id !== userId)
      await notify(sql,peer.user_id,"invite","Group invitation",data.name,"/connections",{actorId:userId});
    return { roomId };
  });

export const updateGroupChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        roomId: id,
        name: text(70).min(3).optional(),
        addHandle: text(30).optional(),
        removeUserId: text(200).optional(),
        leave: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed,
      r = await requireRoomAccess(sql, userId, data.roomId);
    if (r.kind !== "group") throw new Error("This is not a group conversation.");
    if (data.leave) {
      if(!sql.transaction) throw new Error("Transactional storage is required.");
      await sql.transaction(async tx=>{
        const current=(await tx`select created_by from chat_rooms where id=${data.roomId} for update`)[0];
        await tx`delete from chat_members where room_id=${data.roomId} and user_id=${userId}`;
        await tx`update group_invitations set state='cancelled',decided_at=now() where room_id=${data.roomId} and invited_by=${userId} and state='pending'`;
        if(current.created_by===userId){
          const next=(await tx`select user_id from chat_members where room_id=${data.roomId} and room_removed=false order by case group_role when 'coadmin' then 0 when 'moderator' then 1 else 2 end,user_id limit 1`)[0];
          if(next)await tx`update chat_rooms set created_by=${String(next.user_id)} where id=${data.roomId}`;
          else await tx`update chat_rooms set locked=true where id=${data.roomId}`;
        }
      });
      return { ok: true };
    }
    const { requireGroupPower, assertGroupRemoval, stageGroupInvitation } = await import("./social-events-v10.server");
    if (!sql.transaction) throw new Error("Transactional storage is required.");
    await sql.transaction(async (tx) => {
      await tx`select id from chat_rooms where id=${data.roomId} for update`;
      if (data.name) {
        await requireGroupPower(tx,data.roomId,userId,"rename");
        checkText(data.name);
        await tx`update chat_rooms set name=${data.name} where id=${data.roomId}`;
      }
      if (data.addHandle) {
        await requireGroupPower(tx,data.roomId,userId,"invite");
        await guard(userId,"invite");
        const peer=(await tx`select user_id from profiles where handle=${data.addHandle.replace(/^@/,"").toLowerCase()} and search_visible=true`)[0];
        if(!peer) throw new Error("Handle not found.");
        await peerAllowed(tx,userId,String(peer.user_id));
        await stageGroupInvitation(tx,data.roomId,userId,String(peer.user_id));
      }
      if (data.removeUserId) {
        await assertGroupRemoval(tx,data.roomId,userId,data.removeUserId);
        await tx`update chat_members set room_removed=true,in_voice=false,group_role='member' where room_id=${data.roomId} and user_id=${data.removeUserId}`;
      }
    });
    if(data.addHandle) {
      const peer=(await sql`select user_id from profiles where handle=${data.addHandle.replace(/^@/,"").toLowerCase()}`)[0];
      if(peer) await notify(sql,String(peer.user_id),"invite","Group invitation",String(r.name),"/connections",{actorId:userId});
    }
    return { ok: true };
  });

export const pinChatMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ roomId: id, messageId: id, pinned: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed,
      r = await requireRoomAccess(sql, userId, data.roomId);
    if (r.community_id) {
      const m = await requireActiveMember(sql, userId, String(r.community_id));
      if (!canModerate(m.role)) throw new Error("Only moderators can pin community messages.");
    } else if (r.kind === "group") {
      const { requireGroupPower } = await import("./social-events-v10.server");
      await requireGroupPower(sql,data.roomId,userId,"pin");
    }
    if (
      !(
        await sql`select 1 from messages where id=${data.messageId} and room_id=${data.roomId} and deleted=false and held=false`
      ).length
    )
      throw new Error("Message unavailable.");
    if (data.pinned) {
      if (
        Number(
          (
            await sql<{
              n: number;
            }>`select count(*)::int as n from chat_message_pins where room_id=${data.roomId}`
          )[0]?.n ?? 0,
        ) >= 10
      )
        throw new Error("Pin up to ten messages.");
      await sql`insert into chat_message_pins(room_id,message_id,pinned_by) values(${data.roomId},${data.messageId},${userId}) on conflict do nothing`;
    } else
      await sql`delete from chat_message_pins where room_id=${data.roomId} and message_id=${data.messageId}`;
    return { ok: true };
  });

export const blockChatPeer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ roomId: id, userId: text(200).min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    await requireRoomAccess(sql, userId, data.roomId);
    if (
      data.userId === userId ||
      !(
        await sql`select 1 from chat_members where room_id=${data.roomId} and user_id=${data.userId}`
      ).length
    )
      throw new Error("Choose another participant.");
    await sql`insert into blocks(blocker_id,blocked_id) values(${userId},${data.userId}) on conflict do nothing`;
    return { ok: true };
  });

export const sendChatAttachment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z.object({ roomId: id, body: text(2000).default(""), media: mediaSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    await requireMinAge(sql, userId);
    await guard(userId, "message");
    await guard(userId, "upload");
    const r = await requireRoomAccess(sql, userId, data.roomId);
    if (r.community_id) await assertNotMuted(sql, userId, String(r.community_id));
    checkText(
      [
        data.body || `Shared ${safeFilename(data.media.filename)}`,
        data.media.altText,
        data.media.captions,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const { hasPremium } = await import("./premium.server");
    const checked = checkedContentMedia(
        data.media.kind,
        data.media.dataUrl,
        await hasPremium(sql, userId),
      ),
      stored = await storeMedia("content", data.media.dataUrl);
    let messageId: number | null = null;
    try {
      const [m] = await sql<{
        id: number;
      }>`insert into messages(room_id,author_user_id,body,held) values(${data.roomId},${userId},${data.body || `Shared ${data.media.filename}`},true) returning id`;
      messageId = Number(m!.id);
      await sql`insert into content_media(message_id,kind,storage_ref,filename,mime,byte_size,alt_text,captions) values(${messageId},${data.media.kind},${stored},${safeFilename(data.media.filename)},${checked.mime},${checked.bytes},${data.media.altText},${data.media.captions})`;
      const { held } = await reviewContent(
        sql,
        {
          targetType: "message",
          targetId: messageId,
          authorId: userId,
          communityId: r.community_id ? String(r.community_id) : null,
          text: data.body,
          images: ["image", "gif"].includes(data.media.kind) ? [data.media.dataUrl] : [],
          href: `/chats/${data.roomId}`,
        },
        notify,
      );
      if (!held) {
        await sql`update messages set held=false where id=${messageId}`;
        await groupNotify(sql, userId, data.roomId, data.body || data.media.filename);
      }
      return { id: messageId, held };
    } catch (e) {
      if (messageId) await sql`delete from messages where id=${messageId}`;
      await deleteMedia([stored]);
      throw e;
    }
  });

async function groupNotify(sql: Sql, userId: string, roomId: number, body: string) {
  const others = await sql<{
    user_id: string;
  }>`select user_id from chat_members where room_id=${roomId} and user_id<>${userId} and muted=false`;
  for (const o of others)
    await notify(
      sql,
      o.user_id,
      "chat",
      "New group message",
      body.slice(0, 80),
      `/chats/${roomId}`,
      { actorId: userId, targetType: "room", targetId: roomId },
    );
}

async function cardFor(sql: Sql, viewer: string, kind: string, target: string) {
  if (kind === "post") {
    const p = await requirePostAccess(sql, viewer, Number(target)),
      s = (
        await sql`select sharing_allowed from post_content_settings where post_id=${Number(target)}`
      )[0];
    if (s && !asBool(s.sharing_allowed)) throw new Error("The author has disabled sharing.");
    return {
      kind,
      title: String(p.title),
      subtitle: "Post",
      href: `/c/${p.community_id}/p/${target}`,
    };
  }
  if (kind === "community") {
    const c = await requireCommunity(sql, target),
      m = await membershipOf(sql, viewer, target);
    if (!canRead(c, m)) throw new Error("Community unavailable.");
    const helper = (
      internals as typeof internals & {
        assertCommunityReadable?: (s: Sql, v: string, c: string) => Promise<unknown>;
      }
    ).assertCommunityReadable;
    if (helper) await helper(sql, viewer, target);
    return { kind, title: c.name, subtitle: c.tagline, href: `/c/${target}` };
  }
  await profileReadable(sql, viewer, target);
  const p = (await sql`select display_name,handle,bio from profiles where user_id=${target}`)[0]!;
  return {
    kind,
    title: String(p.display_name),
    subtitle: String(p.bio).slice(0, 100),
    href: `/u/${p.handle}`,
  };
}

export const shareInChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        roomId: id,
        kind: z.enum(["post", "profile", "community"]),
        targetId: text(200).min(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed;
    const r = await requireRoomAccess(sql, userId, data.roomId);
    if (r.community_id) await assertNotMuted(sql, userId, String(r.community_id));
    await guard(userId, "message");
    let target = data.targetId;
    if (data.kind === "profile") {
      const handle = target
        .replace(/^.*\/u\//, "")
        .replace(/^@/, "")
        .split(/[?#/]/)[0]!;
      const p = (
        await sql`select user_id from profiles where user_id=${target} or handle=${handle.toLowerCase()} limit 1`
      )[0];
      if (!p) throw new Error("Profile not found.");
      target = String(p.user_id);
    }
    if (data.kind === "post") target = target.replace(/^.*\/p\//, "").split(/[?#/]/)[0]!;
    if (data.kind === "community") target = target.replace(/^.*\/c\//, "").split(/[?#/]/)[0]!;
    await cardFor(sql, userId, data.kind, target);
    // All members must be able to read the target before its title is placed in the conversation.
    const peers = await sql<{
      user_id: string;
    }>`select user_id from chat_members where room_id=${data.roomId}`;
    for (const peer of peers) await cardFor(sql, peer.user_id, data.kind, target);
    const [m] = await sql<{
      id: number;
    }>`insert into messages(room_id,author_user_id,body) values(${data.roomId},${userId},${`Shared a ${data.kind}`}) returning id`;
    await sql`insert into chat_share_cards(message_id,kind,target_id) values(${m!.id},${data.kind},${target})`;
    await groupNotify(sql, userId, data.roomId, `Shared a ${data.kind}`);
    return { id: Number(m!.id) };
  });

export const chatContentTools = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => roomInput.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await db(),
      { userId } = context as Authed,
      r = await requireRoomAccess(sql, userId, data.roomId),
      blocked = await blockedSet(sql, userId);
    const pins = await sql<{
      id: number;
      body: string;
      author_user_id: string;
    }>`select m.id,m.body,m.author_user_id from chat_message_pins p join messages m on m.id=p.message_id where p.room_id=${data.roomId} and m.held=false and m.deleted=false order by p.pinned_at desc`;
    const attachments = await sql<{
      id: number;
      message_id: number;
      filename: string;
      kind: string;
      alt_text: string;
      captions: string;
      author_user_id: string;
    }>`select a.id,a.message_id,a.filename,a.kind,a.alt_text,a.captions,m.author_user_id from content_media a join messages m on m.id=a.message_id where m.room_id=${data.roomId} and m.deleted=false and m.held=false order by a.id desc limit 100`;
    const cardsRaw = await sql<{
      message_id: number;
      kind: string;
      target_id: string;
      author_user_id: string;
    }>`select c.*,m.author_user_id from chat_share_cards c join messages m on m.id=c.message_id where m.room_id=${data.roomId} and m.deleted=false and m.held=false order by m.id desc limit 100`;
    const cards = [];
    for (const c of cardsRaw) {
      if (blocked.has(c.author_user_id)) continue;
      try {
        cards.push({
          messageId: Number(c.message_id),
          ...(await cardFor(sql, userId, c.kind, c.target_id)),
        });
      } catch {
        /* The recipient cannot see the shared target. */
      }
    }
    const people = await sql<{
      user_id: string;
      display_name: string;
      handle: string;
      show_online: boolean;
      last_seen_at: string;
    }>`select p.user_id,p.display_name,p.handle,p.show_online,p.last_seen_at from chat_members m join profiles p on p.user_id=m.user_id where m.room_id=${data.roomId}`;
    return {
      kind: String(r.kind),
      ownerId: String(r.created_by),
      canPin: !r.community_id
        ? r.kind !== "group" || await (await import("./social-events-v10.server")).groupRoleAllows(sql,data.roomId,userId,"pin")
        : canModerate((await requireActiveMember(sql, userId, String(r.community_id))).role),
      pins: pins
        .filter((p) => !blocked.has(p.author_user_id))
        .map((p) => ({ id: Number(p.id), body: p.body })),
      attachments: attachments
        .filter((a) => !blocked.has(a.author_user_id))
        .map((a) => ({
          id: Number(a.id),
          messageId: Number(a.message_id),
          filename: a.filename,
          kind: a.kind,
          altText: a.alt_text,
          captions: a.captions,
          url: `/api/v1/content-media/${a.id}`,
        })),
      cards,
      people: people
        .filter((p) => !blocked.has(p.user_id))
        .map((p) => ({
          userId: p.user_id,
          name: p.display_name,
          handle: p.handle,
          lastActive: asBool(p.show_online) ? iso(p.last_seen_at) : null,
        })),
    };
  });
