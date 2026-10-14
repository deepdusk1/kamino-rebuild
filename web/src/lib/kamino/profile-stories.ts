import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { optionalAuth, type Viewer } from "./optional-auth";
import { internals } from "./server";
import { asBool, iso } from "./map";
import { checkContent, isSiteAdmin } from "./safety.server";
import { guard } from "./guard";
import { checkedContentMedia, safeFilename } from "./content-rules";
import { storeMedia, loadMedia, deleteMedia } from "./media-store.server";
import { stageMediaDeletion, processMediaDeletionQueue } from "./media-deletion.server";
import { readStoryLayers, storyLayersSchema } from "./media-v10-rules";
import {
  profileStoryAccessSql,
  readableProfileStory,
  storyAgeAllowed,
  withStoryOwnerLock,
} from "./profile-stories.server";

const id = z.number().int().positive();
const storyInput = z.object({ storyId: id });
const mediaSchema = z.object({
  kind: z.enum(["image", "gif", "video", "audio"]),
  dataUrl: z.string().max(32_000_100),
  filename: z.string().max(120),
  altText: z.string().max(600).default(""),
  captions: z.string().max(12000).default(""),
});
const createSchema = z.object({
  caption: z.string().trim().max(1500).default(""),
  background: z.enum(["violet", "ocean", "rose", "midnight"]).default("violet"),
  audience: z.enum(["public", "followers", "close_friends"]).default("public"),
  minimumAge: z.union([z.literal(13), z.literal(16), z.literal(18)]).default(13),
  contentWarning: z.string().trim().max(120).default(""),
  question: z.string().trim().max(200).default(""),
  pollOptions: z.array(z.string().trim().min(1).max(80)).max(4).default([]),
  media: mediaSchema.optional(),
  music: mediaSchema.extend({kind:z.literal("audio")}).optional(),
  layers: storyLayersSchema.default([]),
});

export const getProfileStories = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: unknown) => z.object({ userId: z.string().max(200).optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      viewer = (context as Viewer).userId ?? null,
      owner = data.userId ?? viewer;
    if (!owner) throw new Error("Sign in to open your stories.");
    const p = (
      await sql`select handle,display_name,private_account from profiles where user_id=${owner}`
    )[0];
    if (!p || (await internals.blockedSet(sql, viewer)).has(owner))
      throw new Error("Profile unavailable.");
    await internals.assertAccountAllowed(sql, owner);
    if (
      owner !== viewer &&
      asBool(p.private_account) &&
      !(
        await sql`select 1 from profile_follows where follower_id=${viewer ?? ""} and followee_id=${owner}`
      ).length
    )
      throw new Error("Follow this private profile first.");
    const rows = await sql.query(
      `select s.* from profile_stories s where s.owner_id=$2 and ${profileStoryAccessSql()} order by s.id desc limit 100`,
      [viewer ?? "", owner],
    );
    const sensitivity = viewer
      ? (await sql`select sensitive_content from profiles where user_id=${viewer}`)[0]
      : null;
    return {
      mine: viewer === owner,
      ownerId: owner,
      handle: String(p.handle),
      displayName: String(p.display_name),
      stories: rows.map((s) => ({
        id: Number(s.id),
        caption: String(s.caption),
        background: String(s.background),
        audience: String(s.audience),
        minimumAge: Number(s.minimum_age),
        contentWarning: String(s.content_warning),
        blur:
          viewer !== owner &&
          String(s.content_warning) !== "" &&
          sensitivity?.sensitive_content !== "show",
        highlighted: asBool(s.highlighted),
        hidden: asBool(s.hidden),
        expired: new Date(String(s.expires_at)).getTime() <= Date.now(),
        createdAt: iso(s.created_at),
        expiresAt: iso(s.expires_at),
        question: String(s.question),
        pollOptions: JSON.parse(String(s.poll_options)) as string[],
        layers: readStoryLayers(s.layers),
        media: s.media_ref
          ? {
              id: Number(s.id),
              kind: String(s.kind),
              filename: String(s.filename),
              altText: String(s.alt_text),
              captions: String(s.captions),
              url: `/api/v1/profile-story-media/${s.id}`,
            }
          : null,
        music: s.music_ref?{id:Number(s.id),kind:"audio",filename:String(s.music_filename),altText:String(s.music_alt_text),captions:String(s.music_captions),url:`/api/v1/profile-story-media/${s.id}?music=1`}:null,
      })),
    };
  });

export const publishProfileStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = context.userId;
    await storyAgeAllowed(sql, userId, data.minimumAge);
    await guard(userId, "post");
    if (!data.caption && !data.media && !data.music && !data.layers.length) throw new Error("Add text or a media file.");
    if(data.music&&data.media?.kind==="audio")throw new Error("Use one audio track per story.");
    if (data.pollOptions.length === 1 || new Set(data.pollOptions).size !== data.pollOptions.length)
      throw new Error("Add two to four different poll choices.");
    const checked = data.media ? checkedContentMedia(data.media.kind, data.media.dataUrl) : null;
    const musicChecked = data.music?checkedContentMedia("audio",data.music.dataUrl):null;
    const verdict = await checkContent({
      text: [
        data.caption,
        data.question,
        ...data.pollOptions,
        ...data.layers.map(layer => layer.text),
        data.media?.altText ?? "",
        data.media?.captions ?? "",
        data.music?.altText??"",
        data.music?.captions??"",
      ].join("\n"),
      images: data.media ? [data.media.dataUrl] : [],
      ageGate: data.minimumAge,
    });
    if (verdict.action === "hold")
      throw new Error(
        "Please edit this story before publishing; it did not pass the safety checks.",
      );
    let reference:string|null=null,musicReference:string|null=null;
    try{return await withStoryOwnerLock(sql, userId, async (tx) => {
      await internals.requireMinAge(tx,userId);
      await storyAgeAllowed(tx,userId,data.minimumAge);
      const n = (
        await tx`select count(*)::int as total,count(*) filter(where created_at>now()-interval '24 hours')::int as today from profile_stories where owner_id=${userId}`
      )[0]!;
      if (Number(n.today) >= 10 || Number(n.total) >= 100)
        throw new Error(
          "Keep up to 100 stories and publish up to 10 each day. Remove an old story to make room.",
        );
        if (data.media||data.music) await guard(userId, "upload");
        if (data.media) {
          reference = await storeMedia("content", data.media.dataUrl);
        }
        if(data.music)musicReference=await storeMedia("content",data.music.dataUrl);
        const r = (
          await tx`insert into profile_stories(owner_id,caption,background,audience,minimum_age,content_warning,question,poll_options,media_ref,kind,filename,mime,byte_size,alt_text,captions,layers,music_ref,music_mime,music_filename,music_byte_size,music_alt_text,music_captions)
   values(${userId},${data.caption},${data.background},${data.audience},${data.minimumAge},${data.contentWarning},${data.question},${JSON.stringify(data.pollOptions)},${reference},${data.media?.kind ?? ""},${safeFilename(data.media?.filename ?? "")},${checked?.mime ?? ""},${checked?.bytes ?? 0},${data.media?.altText ?? ""},${data.media?.captions ?? ""},${JSON.stringify(data.layers)},${musicReference},${musicChecked?.mime??""},${safeFilename(data.music?.filename??"")},${musicChecked?.bytes??0},${data.music?.altText??""},${data.music?.captions??""}) returning id`
        )[0]!;
        if (verdict.action === "flag")
          await tx`insert into reports(reporter_id,target_type,target_id,reason,details) values('system:safety','profile_story',${String(r.id)},'Automatic story safety review',${verdict.reasons.join("; ").slice(0, 1000)}) on conflict do nothing`;
        return { id: Number(r.id) };
    });}catch(error){await deleteMedia([reference,musicReference]);throw error;}
  });
export const getProfileStoryMedia = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator((d: unknown) => storyInput.extend({track:z.literal("music").optional()}).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      row = await readableProfileStory(sql, (context as Viewer).userId ?? null, data.storyId);
    const music=data.track==="music";
    if (!(music?row.music_ref:row.media_ref)) throw new Error("Story has no media.");
    return {
      dataUrl: await loadMedia(String(music?row.music_ref:row.media_ref)),
      mime: String(music?row.music_mime:row.mime),
      kind: music?"audio":String(row.kind),
      filename: String(music?row.music_filename:row.filename),
      captions: String(music?row.music_captions:row.captions),
    };
  });
export const setProfileStoryHighlight = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => storyInput.extend({ highlighted: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = context.userId;
    await internals.requireMinAge(sql, userId);
    return withStoryOwnerLock(sql, userId, async (tx) => {
      const rows =
        await tx`update profile_stories set highlighted=${data.highlighted} where id=${data.storyId} and owner_id=${userId}
  and (${!data.highlighted} or highlighted=true or (select count(*) from profile_stories where owner_id=${userId} and highlighted=true)<20) returning id`;
      if (!rows.length) throw new Error("Story unavailable or your 20 highlights are full.");
      return { ok: true };
    });
  });
export const deleteProfileStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => storyInput.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      rows = await withStoryOwnerLock(sql, context.userId, async (tx) => {
        const removed = await tx`delete from profile_stories where id=${data.storyId} and owner_id=${context.userId} returning media_ref,music_ref`;
        await stageMediaDeletion(tx, removed.flatMap(r=>[r.media_ref?String(r.media_ref):null,r.music_ref?String(r.music_ref):null]));
        return removed;
      });
    if (!rows.length) throw new Error("Story unavailable.");
    void processMediaDeletionQueue(sql, {limit:4}).catch(error=>console.warn('[story-deletion] queued cleanup:',error));
    return { ok: true };
  });
export const getProfileStoryResponses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => storyInput.parse(d))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      s = await readableProfileStory(sql, context.userId, data.storyId),
      owner = s.owner_id === context.userId;
    const rows =
      await sql`select option_index,count(*)::int as count from profile_story_responses where story_id=${data.storyId} group by option_index`;
    const mine = (
      await sql`select option_index,answer from profile_story_responses where story_id=${data.storyId} and user_id=${context.userId}`
    )[0];
    const answers = owner
      ? await sql`select answer from profile_story_responses where story_id=${data.storyId} and answer<>'' order by updated_at desc limit 100`
      : [];
    return {
      votes: rows.map((r) => ({
        optionIndex: r.option_index === null ? null : Number(r.option_index),
        count: Number(r.count),
      })),
      mine: mine
        ? {
            optionIndex: mine.option_index === null ? null : Number(mine.option_index),
            answer: String(mine.answer),
          }
        : null,
      answers: answers.map((r) => String(r.answer)),
    };
  });
export const respondToProfileStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    storyInput
      .extend({
        optionIndex: z.number().int().min(0).max(3).nullable().optional(),
        answer: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    await internals.requireMinAge(sql, context.userId);
    const s = await readableProfileStory(sql, context.userId, data.storyId);
    if (asBool(s.hidden) || new Date(String(s.expires_at)).getTime() <= Date.now())
      throw new Error("This story is closed for responses.");
    if (
      data.optionIndex != null &&
      data.optionIndex >= (JSON.parse(String(s.poll_options)) as string[]).length
    )
      throw new Error("Choose a valid poll option.");
    if (data.answer && !s.question) throw new Error("This story has no question.");
    if (data.optionIndex == null && !data.answer) throw new Error("Add an answer or a vote.");
    await guard(context.userId, "comment");
    if ((await checkContent({ text: data.answer ?? "" })).action !== null)
      throw new Error("Please edit your answer; it did not pass the safety checks.");
    await sql`insert into profile_story_responses(story_id,user_id,option_index,answer) values(${data.storyId},${context.userId},${data.optionIndex ?? null},${data.answer ?? ""}) on conflict(story_id,user_id) do update set option_index=case when ${data.optionIndex !== undefined} then excluded.option_index else profile_story_responses.option_index end,answer=case when ${data.answer !== undefined} then excluded.answer else profile_story_responses.answer end,updated_at=now()`;
    return { ok: true };
  });
export const reportProfileStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    storyInput
      .extend({
        reason: z.string().trim().min(1).max(300),
        details: z.string().trim().max(5000).default(""),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    await internals.requireMinAge(sql, context.userId);
    await readableProfileStory(sql, context.userId, data.storyId);
    await guard(context.userId, "report");
    await sql`insert into reports(reporter_id,target_type,target_id,reason,details) values(${context.userId},'profile_story',${String(data.storyId)},${data.reason},${data.details}) on conflict do nothing`;
    return { ok: true };
  });
export const setProfileStoryHidden = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    storyInput.extend({ hidden: z.boolean(), reason: z.string().trim().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    if (!(await isSiteAdmin(sql, context.userId)))
      throw new Error("Verified site administrators only.");
    const rows = await sql.query(
      `with changed as(update profile_stories set hidden=$2 where id=$1 returning id),audit as(insert into platform_audit(actor_id,action,detail) select $3,'story.visibility',$4 from changed returning id) select id from changed`,
      [
        data.storyId,
        data.hidden,
        context.userId,
        JSON.stringify({ storyId: data.storyId, hidden: data.hidden, reason: data.reason }),
      ],
    );
    if (!rows.length) throw new Error("Story unavailable.");
    return { ok: true };
  });
