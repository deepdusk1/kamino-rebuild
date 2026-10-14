import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";
import { isSiteAdmin, checkContent } from "./safety.server";
import { guard } from "./guard";
import { iso } from "./map";
import {
  claimCollectible,
  seasonProgress,
  decideCase,
  decideCaseAppeal,
  transaction,
  EXPERIMENT_FEATURES,
  makeAppealProof,
  readAppealProof,
} from "./operations-v10.server";
import type { Sql } from "@/lib/db";

type JsonRow = Record<string, string | number | boolean | null>;
const jsonRows = (rows: Record<string, unknown>[]): JsonRow[] =>
  rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date
          ? value.toISOString()
          : typeof value === "bigint"
            ? Number(value)
            : value == null
              ? null
              : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                ? value
                : String(value),
      ]),
    ),
  );
const positive = z.number().int().positive();
const uid = (context: unknown) => (context as { userId: string }).userId;
async function admin(sql: Sql, userId: string) {
  if (!(await isSiteAdmin(sql, userId)))
    throw new Error("Verified platform administrator access required.");
}

async function seasonRows(sql: Sql, userId: string) {
  const rows = await sql`select * from progression_seasons order by starts_at desc limit 20`;
  return Promise.all(
    rows.map(async (row) => ({
      id: Number(row.id),
      title: String(row.title),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      status: String(row.status),
      ...(await seasonProgress(sql, userId, Number(row.id))),
      sets: jsonRows(
        await sql`select c.*,exists(select 1 from collectible_awards a where a.set_id=c.id and a.user_id=${userId}) as claimed from collectible_sets c where c.season_id=${Number(row.id)} order by required_points`,
      ),
    })),
  );
}
export const getOperationsCenter = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await internals.ensureProfile(sql, { userId, email: null, name: null });
    const p = (await sql`select email_digest from profiles where user_id=${userId}`)[0];
    const cases = jsonRows(
      await sql`select id,status,decision,public_reason,decided_at,created_at from moderation_cases where subject_id=${userId} order by id desc limit 100`,
    );
    const appeals = jsonRows(
      await sql`select id,case_id,message,status,decision_note,created_at,decided_at from moderation_case_appeals where user_id=${userId} order by id desc limit 100`,
    );
    const events = jsonRows(
      await sql`select e.case_id,e.kind,e.note,e.created_at from moderation_case_events e join moderation_cases c on c.id=e.case_id where c.subject_id=${userId} and e.member_visible=true order by e.id desc limit 200`,
    );
    return {
      emailDigest: p?.email_digest === true,
      emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
      pushConfigured: process.env.KAMINO_PUSH_ENABLED === "true",
      cases,
      appeals,
      events,
      seasons: await seasonRows(sql, userId),
      deliveries: jsonRows(
        await sql`select id,week_start,status,attempts,created_at,completed_at,last_error from email_digest_queue where user_id=${userId} order by id desc limit 12`,
      ),
      isAdmin: await isSiteAdmin(sql, userId),
    };
  });
export const setEmailDigest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((value: boolean) => z.boolean().parse(value))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await internals.ensureProfile(sql, { userId, email: null, name: null });
    if (data) {
      const u = (await sql`select "emailVerified" from "user" where id=${userId}`)[0];
      if (u?.emailVerified !== true)
        throw new Error("Verify your email address before enabling digests.");
    }
    await sql`update profiles set email_digest=${data} where user_id=${userId}`;
    if (!data)
      await sql`update email_digest_queue set status='cancelled',completed_at=now(),lease_token=null,lease_until=null where user_id=${userId} and status='pending'`;
    return { ok: true };
  });
export const claimSeasonCollectible = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((setId: number) => positive.parse(setId))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await internals.requireMinAge(sql, userId);
    await guard(userId, "invite");
    return claimCollectible(sql, userId, data);
  });
const appealInput = z.object({ caseId: positive, message: z.string().trim().min(20).max(3000) });
async function submitAppeal(sql: Sql, userId: string, input: z.infer<typeof appealInput>) {
  await guard(userId, "invite");
  if ((await checkContent({ text: input.message })).action === "hold")
    throw new Error("Please edit your appeal before submitting it.");
  return transaction(sql, async (tx) => {
    const item = (
      await tx`select * from moderation_cases where id=${input.caseId} and subject_id=${userId} for update`
    )[0];
    if (
      !item ||
      !["decided", "closed"].includes(String(item.status)) ||
      item.decision === "no_action"
    )
      throw new Error("This case cannot be appealed.");
    const rows =
      await tx`insert into moderation_case_appeals(case_id,user_id,message) values(${input.caseId},${userId},${input.message}) on conflict(case_id) do nothing returning id`;
    if (!rows.length) throw new Error("You have already submitted an appeal for this case.");
    await tx`insert into moderation_case_events(case_id,actor_id,kind,note,member_visible) values(${input.caseId},${userId},'appeal.submitted',${input.message},true)`;
    return { id: Number(rows[0].id) };
  });
}
export const submitCaseAppeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => appealInput.parse(input))
  .handler(async ({ context, data }) => submitAppeal(await internals.db(), uid(context), data));

export const getAdminOperations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await admin(sql, userId);
    const cases = jsonRows(
      await sql`select c.*,p.handle,p.display_name from moderation_cases c left join profiles p on p.user_id=c.subject_id order by (c.status in ('open','investigating')) desc,c.id desc limit 100`,
    );
    const events = jsonRows(
      await sql`select e.* from moderation_case_events e where e.case_id in(select id from moderation_cases order by id desc limit 100) order by e.id desc limit 500`,
    );
    const appeals = jsonRows(
      await sql`select a.*,c.decision,c.decided_by as issuer,c.public_reason from moderation_case_appeals a join moderation_cases c on c.id=a.case_id order by (a.status='open') desc,a.id desc limit 100`,
    );
    const reports = jsonRows(
      await sql`select r.id,r.target_type,r.target_id,r.reason,r.details from reports r where r.status='open' and not exists(select 1 from moderation_cases c where c.report_id=r.id) order by r.id desc limit 100`,
    );
    const experiments = jsonRows(
      await sql`select e.*,(select count(*)::int from experiment_assignments a where a.experiment_id=e.id and a.variant='control') as control_exposures,
    (select count(*)::int from experiment_assignments a where a.experiment_id=e.id and a.variant='treatment') as treatment_exposures,
    (select count(*)::int from experiment_assignments a where a.experiment_id=e.id and a.variant='control' and a.converted_at is not null) as control_conversions,
    (select count(*)::int from experiment_assignments a where a.experiment_id=e.id and a.variant='treatment' and a.converted_at is not null) as treatment_conversions
    from platform_experiments e order by id desc limit 50`,
    );
    return {
      cases,
      events,
      appeals,
      reports,
      experiments,
      seasons: await seasonRows(sql, userId),
      deliveryStats: jsonRows(
        await sql`select 'push' as channel,status,count(*)::int as count from push_delivery_queue group by status union all select 'email',status,count(*)::int from email_digest_queue group by status`,
      ),
      emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
      pushConfigured: process.env.KAMINO_PUSH_ENABLED === "true",
      userId,
    };
  });
const caseInput = z.object({
  reportId: positive.optional(),
  subjectId: z.string().trim().min(1).max(100).optional(),
  summary: z.string().trim().min(5).max(2000),
  priority: z.enum(["normal", "urgent"]).default("normal"),
});
export const openModerationCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => caseInput.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await admin(sql, userId);
    return transaction(sql, async (tx) => {
      let subject = data.subjectId;
      if (data.reportId) {
        const report = (await tx`select * from reports where id=${data.reportId} for update`)[0];
        if (!report) throw new Error("Report not found.");
        const kind = String(report.target_type),
          target = String(report.target_id);
        if (kind === "user") subject = target;
        else if (
          ["post", "comment", "message", "profile_story"].includes(kind) &&
          /^\d+$/.test(target)
        ) {
          const tables = {
            post: ["posts", "author_user_id"],
            comment: ["comments", "author_user_id"],
            message: ["messages", "author_user_id"],
            profile_story: ["profile_stories", "owner_id"],
          } as const;
          const [table, column] = tables[kind as keyof typeof tables];
          const author = (
            await tx.query(`select ${column} as subject from ${table} where id=$1`, [
              Number(target),
            ])
          )[0];
          subject = author ? String(author.subject) : undefined;
        } else if (kind === "community")
          subject = String(
            (await tx`select created_by from communities where id=${target}`)[0]?.created_by ?? "",
          );
      }
      if (!subject || !(await tx`select 1 from "user" where id=${subject}`).length)
        throw new Error("Choose an existing member account for this case.");
      const rows =
        await tx`insert into moderation_cases(report_id,subject_id,opened_by,assigned_to,summary,priority) values(${data.reportId ?? null},${subject},${userId},${userId},${data.summary},${data.priority}) on conflict do nothing returning id`;
      if (!rows.length) throw new Error("This report already has a case.");
      await tx`insert into moderation_case_events(case_id,actor_id,kind,note) values(${Number(rows[0].id)},${userId},'opened',${data.summary})`;
      await tx`insert into platform_audit(actor_id,action,detail) values(${userId},'case.open',${String(rows[0].id)})`;
      return { id: Number(rows[0].id) };
    });
  });
export const updateModerationCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: positive,
        action: z.enum(["claim", "unassign", "investigating", "close", "note"]),
        note: z.string().trim().max(2000).default(""),
        memberVisible: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await admin(sql, userId);
    return transaction(sql, async (tx) => {
      const item = (await tx`select * from moderation_cases where id=${data.id} for update`)[0];
      if (!item) throw new Error("Case not found.");
      if (data.action === "claim")
        await tx`update moderation_cases set assigned_to=${userId},updated_at=now() where id=${data.id}`;
      else if (data.action === "unassign")
        await tx`update moderation_cases set assigned_to=null,updated_at=now() where id=${data.id}`;
      else if (data.action === "investigating") {
        if (!["open", "investigating"].includes(String(item.status)))
          throw new Error("This case is already decided.");
        await tx`update moderation_cases set status='investigating',updated_at=now() where id=${data.id}`;
      } else if (data.action === "close") {
        if (item.status !== "decided")
          throw new Error("Record a decision before closing this case.");
        await tx`update moderation_cases set status='closed',updated_at=now() where id=${data.id}`;
      }
      if (data.action === "note" && data.note.length < 5)
        throw new Error("Add a note of at least five characters.");
      await tx`insert into moderation_case_events(case_id,actor_id,kind,note,member_visible) values(${data.id},${userId},${data.action},${data.note || data.action},${data.memberVisible})`;
      await tx`insert into platform_audit(actor_id,action,detail) values(${userId},${`case.${data.action}`},${String(data.id)})`;
      return { ok: true };
    });
  });
export const decideModerationCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: positive,
        decision: z.enum(["no_action", "warning", "suspended", "banned"]),
        reason: z.string().trim().min(5).max(2000),
        days: z.number().int().min(1).max(365).default(7),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await admin(sql, userId);
    return decideCase(sql, userId, data);
  });
export const reviewCaseAppeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: positive,
        decision: z.enum(["upheld", "overturned"]),
        note: z.string().trim().min(5).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await admin(sql, userId);
    return decideCaseAppeal(sql, userId, data);
  });

export const savePlatformExperiment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: positive.optional(),
        key: z.string().regex(/^[a-z][a-z0-9_-]{2,60}$/),
        title: z.string().trim().min(3).max(100),
        featureKey: z.enum(EXPERIMENT_FEATURES),
        treatmentPercent: z.number().int().min(1).max(99).default(50),
        status: z.enum(["draft", "running", "ended"]).default("draft"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await admin(sql, userId);
    return transaction(sql, async (tx) => {
      if (data.id) {
        const current = (
          await tx`select * from platform_experiments where id=${data.id} for update`
        )[0];
        if (!current) throw new Error("Experiment not found.");
        if (
          current.status !== "draft" &&
          (data.key !== current.key ||
            data.featureKey !== current.feature_key ||
            data.treatmentPercent !== Number(current.treatment_percent) ||
            data.status === "draft")
        )
          throw new Error(
            "A started experiment keeps its feature and allocation. Create a new experiment to change them.",
          );
        if (current.status === "ended" && data.status !== "ended")
          throw new Error("Ended experiments cannot restart.");
        await tx`update platform_experiments set title=${data.title},key=${data.key},feature_key=${data.featureKey},treatment_percent=${data.treatmentPercent},status=${data.status},started_at=case when ${data.status}='running' then coalesce(started_at,now()) else started_at end,ended_at=case when ${data.status}='ended' then coalesce(ended_at,now()) else ended_at end where id=${data.id}`;
      } else
        await tx`insert into platform_experiments(key,title,feature_key,treatment_percent,status,created_by,started_at,ended_at) values(${data.key},${data.title},${data.featureKey},${data.treatmentPercent},${data.status},${userId},${data.status === "running" ? new Date().toISOString() : null},${data.status === "ended" ? new Date().toISOString() : null})`;
      await tx`insert into platform_audit(actor_id,action,detail) values(${userId},'experiment.save',${data.key})`;
      return { ok: true };
    });
  });
const seasonInput = z.object({
  title: z.string().trim().min(3).max(100),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  sets: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(100),
        description: z.string().max(1000).default(""),
        cosmetic: z.enum(["aurora", "sunrise", "ocean", "forest"]),
        requiredPoints: z.number().int().min(1).max(100000),
        supply: z.number().int().min(1).max(100000),
      }),
    )
    .min(1)
    .max(4),
});
export const createProgressionSeason = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => seasonInput.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await admin(sql, userId);
    if (
      Date.parse(data.endsAt) <= Date.now() ||
      Date.parse(data.endsAt) <= Date.parse(data.startsAt) ||
      Date.parse(data.endsAt) - Date.parse(data.startsAt) > 366 * 86400000
    )
      throw new Error("Choose a season ending in the future, within one year of its start.");
    if (new Set(data.sets.map((s) => s.cosmetic)).size !== data.sets.length)
      throw new Error("Each collectible colour can appear once per season.");
    return transaction(sql, async (tx) => {
      const rows =
        await tx`insert into progression_seasons(title,starts_at,ends_at,status,created_by) values(${data.title},${data.startsAt},${data.endsAt},${Date.parse(data.startsAt) <= Date.now() ? "active" : "scheduled"},${userId}) returning id`;
      for (const item of data.sets)
        await tx`insert into collectible_sets(season_id,title,description,cosmetic,required_points,supply) values(${Number(rows[0].id)},${item.title},${item.description},${item.cosmetic},${item.requiredPoints},${item.supply})`;
      await tx`insert into platform_audit(actor_id,action,detail) values(${userId},'season.create',${String(rows[0].id)})`;
      return { id: Number(rows[0].id) };
    });
  });
export const endProgressionSeason = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => positive.parse(id))
  .handler(async ({ context, data }) => {
    const sql = await internals.db(),
      userId = uid(context);
    await admin(sql, userId);
    await sql`update progression_seasons set status='ended',ends_at=greatest(starts_at+interval '1 second',least(ends_at,now())) where id=${data}`;
    await sql`insert into platform_audit(actor_id,action,detail) values(${userId},'season.end',${String(data)})`;
    return { ok: true };
  });

/** Signed-out sanctioned members can verify their email without opening general account access. */
export const requestCaseAppealLink = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ caseId: positive.optional(), email: z.email().max(254) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    assertSameSiteRequest();
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    await guard(`case-appeal:${request?.headers.get("x-forwarded-for") ?? "local"}`, "invite");
    const origin = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "");
    if (
      !process.env.RESEND_API_KEY ||
      !process.env.MAIL_FROM ||
      !origin ||
      (process.env.BETTER_AUTH_SECRET ?? "").length < 32
    )
      throw new Error("Email appeal links are not configured. Contact Kamino support.");
    const sql = await internals.db();
    const row = (
      await sql`select c.id,c.subject_id from moderation_cases c join "user" u on u.id=c.subject_id where (${data.caseId ?? null}::bigint is null or c.id=${data.caseId ?? null}) and lower(u.email)=${data.email.toLowerCase()} and u."emailVerified"=true order by c.id desc limit 1`
    )[0];
    if (row) {
      const expires = (Math.floor(Date.now() / 3600000) + 1) * 3600000,
        proof = makeAppealProof(
          { caseId: Number(row.id), userId: String(row.subject_id), expires },
          process.env.BETTER_AUTH_SECRET ?? "",
        );
      const { sendMailStrict } = await import("@/lib/auth/mailer.server");
      try {
        await sendMailStrict(
          {
            to: data.email,
            subject: `Kamino case #${row.id}: review and appeal`,
            text: `Review your case and submit an appeal: ${origin}/appeal#proof=${proof}\n\nThis link expires within one hour. Do not share it.`,
          },
          `kamino-case-${row.id}-${expires}`,
        );
      } catch {
        console.warn("[case-appeal] Email provider did not accept the appeal link.");
      }
    }
    return {
      ok: true,
      message: "If the verified email matches this case, an appeal link has been sent.",
    };
  });
export const getVerifiedCaseAppeal = createServerFn({ method: "POST" })
  .validator((proof: string) => z.string().max(1000).parse(proof))
  .handler(async ({ data }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    assertSameSiteRequest();
    const proof = readAppealProof(data, process.env.BETTER_AUTH_SECRET ?? ""),
      sql = await internals.db();
    await guard(`case-proof:${proof.userId}`, "invite");
    const item = (
      await sql`select id,status,decision,public_reason,decided_at,created_at from moderation_cases where id=${proof.caseId} and subject_id=${proof.userId}`
    )[0];
    if (!item) throw new Error("This case is no longer available.");
    return {
      case: jsonRows([item])[0],
      events: jsonRows(
        await sql`select kind,note,created_at from moderation_case_events where case_id=${proof.caseId} and member_visible=true order by id`,
      ),
      appeals: jsonRows(
        await sql`select id,message,status,decision_note,created_at from moderation_case_appeals where case_id=${proof.caseId} and user_id=${proof.userId}`,
      ),
    };
  });
export const submitVerifiedCaseAppeal = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({ proof: z.string().max(1000), message: z.string().trim().min(20).max(3000) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    assertSameSiteRequest();
    const proof = readAppealProof(data.proof, process.env.BETTER_AUTH_SECRET ?? "");
    await guard(`case-proof:${proof.userId}`, "invite");
    return submitAppeal(await internals.db(), proof.userId, {
      caseId: proof.caseId,
      message: data.message,
    });
  });
