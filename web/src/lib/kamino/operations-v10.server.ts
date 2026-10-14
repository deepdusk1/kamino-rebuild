import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "../db.ts";
import { platformFlagBucket } from "./platform-flag-rules.ts";

export const EXPERIMENT_FEATURES = ["related_discovery", "discovery_assistant"] as const;
export type ExperimentFeature = (typeof EXPERIMENT_FEATURES)[number];
export type OperationRow = Record<string, unknown>;
export async function transaction<T>(sql: Sql, work: (sql: Sql) => Promise<T>) {
  if (!sql.transaction) throw new Error("A transaction-capable database is required.");
  return sql.transaction(work);
}

/** The real server-side feature consumer records exposure and obeys assignment. */
export async function consumeExperiment(
  sql: Sql,
  userId: string,
  feature: string,
  fallback: boolean,
) {
  if (
    !EXPERIMENT_FEATURES.includes(feature as ExperimentFeature) ||
    !fallback ||
    userId.startsWith("seed:")
  )
    return fallback;
  const experiment = (
    await sql.query<OperationRow>(
      "select * from platform_experiments where feature_key=$1 and status='running'",
      [feature],
    )
  )[0];
  if (!experiment) return fallback;
  const variant =
    platformFlagBucket(userId, `experiment:${experiment.id}:${experiment.key}`) <
    Number(experiment.treatment_percent)
      ? "treatment"
      : "control";
  const rows = await sql.query<OperationRow>(
    `insert into experiment_assignments(experiment_id,user_id,variant)
    select $1,$2,$3 where exists(select 1 from "user" where id=$2)
    on conflict(experiment_id,user_id) do update set user_id=excluded.user_id returning variant`,
    [experiment.id, userId, variant],
  );
  return rows[0]?.variant === "treatment";
}
/** Only exposed members can record the experiment's defined outcome, at most once. */
export async function convertExperiment(sql: Sql, userId: string, feature: ExperimentFeature) {
  await sql.query(
    `update experiment_assignments a set converted_at=now() from platform_experiments e
    where e.id=a.experiment_id and e.feature_key=$1 and e.status='running' and a.user_id=$2 and a.converted_at is null`,
    [feature, userId],
  );
}

/** Capped daily participation, counted from published data rather than client-submitted XP. */
export async function seasonProgress(sql: Sql, userId: string, seasonId: number) {
  const season = (
    await sql.query<OperationRow>("select * from progression_seasons where id=$1", [seasonId])
  )[0];
  if (!season) throw new Error("Season not found.");
  const rows = await sql.query<{ points: number }>(
    `with activity as (
    select (p.created_at at time zone 'UTC')::date as day,'post' as kind,count(*)::int as count
      from posts p where p.author_user_id=$1 and coalesce(p.hidden,false)=false and p.type not in ('story','wiki')
      and (p.publish_at is null or p.publish_at<=now()) and p.created_at>=$2::timestamptz and p.created_at<least($3::timestamptz,now()) group by day
    union all select (c.created_at at time zone 'UTC')::date,'comment',count(*)::int from comments c join posts p on p.id=c.post_id
      where c.author_user_id=$1 and coalesce(c.held,false)=false and coalesce(p.hidden,false)=false and (p.publish_at is null or p.publish_at<=now()) and c.created_at>=$2::timestamptz and c.created_at<least($3::timestamptz,now()) group by 1
    union all select d.day,'checkin',count(*)::int from community_checkin_days d
      where d.user_id=$1 and d.day>=($2::timestamptz at time zone 'UTC')::date and d.day<($3::timestamptz at time zone 'UTC')::date and d.day<=(now() at time zone 'UTC')::date group by d.day
    ) select coalesce(sum(case kind when 'post' then least(count,5)*10 when 'comment' then least(count,10)*2 else least(count,1)*5 end),0)::int as points from activity`,
    [userId, season.starts_at, season.ends_at],
  );
  return {
    points: Number(rows[0]?.points ?? 0),
    level: Math.floor(Number(rows[0]?.points ?? 0) / 100) + 1,
  };
}
export async function claimCollectible(sql: Sql, userId: string, setId: number) {
  return transaction(sql, async (tx) => {
    const item = (
      await tx.query<OperationRow>(
        `select c.*,s.starts_at,s.ends_at,s.status as season_status from collectible_sets c
      join progression_seasons s on s.id=c.season_id where c.id=$1 for update of c`,
        [setId],
      )
    )[0];
    if (
      !item ||
      item.season_status !== "active" ||
      new Date(String(item.starts_at)).getTime() > Date.now() ||
      new Date(String(item.ends_at)).getTime() <= Date.now()
    )
      throw new Error("This collectible season is not active.");
    if (
      (
        await tx.query("select 1 from collectible_awards where set_id=$1 and user_id=$2", [
          setId,
          userId,
        ])
      ).length
    )
      return { ok: true, alreadyClaimed: true };
    if (Number(item.awarded) >= Number(item.supply))
      throw new Error("This limited set is fully claimed.");
    const progress = await seasonProgress(tx, userId, Number(item.season_id));
    if (progress.points < Number(item.required_points))
      throw new Error("Earn more season points before claiming this collectible.");
    await tx.query("insert into collectible_awards(set_id,user_id) values($1,$2)", [setId, userId]);
    await tx.query("update collectible_sets set awarded=awarded+1 where id=$1", [setId]);
    await tx.query(
      "insert into earned_cosmetics(user_id,cosmetic,source) values($1,$2,$3) on conflict do nothing",
      [userId, item.cosmetic, `season:${item.season_id}`],
    );
    return { ok: true, alreadyClaimed: false };
  });
}

export async function decideCase(
  sql: Sql,
  actorId: string,
  input: {
    id: number;
    decision: "no_action" | "warning" | "suspended" | "banned";
    reason: string;
    days: number;
  },
) {
  return transaction(sql, async (tx) => {
    const item = (
      await tx.query<OperationRow>("select * from moderation_cases where id=$1 for update", [
        input.id,
      ])
    )[0];
    if (!item || !["open", "investigating"].includes(String(item.status)))
      throw new Error("This case has already been decided.");
    if (item.subject_id === actorId)
      throw new Error("Another administrator must decide your case.");
    if (item.assigned_to && item.assigned_to !== actorId)
      throw new Error("Assign this case to yourself before deciding it.");
    let revision: unknown = null;
    if (input.decision === "suspended" || input.decision === "banned") {
      const existing = (
        await tx.query<OperationRow>(
          "select * from identity_account_status where user_id=$1 for update",
          [item.subject_id],
        )
      )[0];
      if (
        existing &&
        (existing.status === "banned" ||
          (existing.status === "suspended" &&
            (!existing.until || new Date(String(existing.until)).getTime() > Date.now())))
      )
        throw new Error(
          "This account already has an active sanction. Review that action before issuing another.",
        );
      const until =
        input.decision === "suspended"
          ? new Date(Date.now() + input.days * 86400000).toISOString()
          : null;
      const state = await tx.query<OperationRow>(
        `insert into identity_account_status(user_id,status,reason,until,actor_id)
        values($1,$2,$3,$4,$5) on conflict(user_id) do update set status=excluded.status,reason=excluded.reason,until=excluded.until,actor_id=excluded.actor_id,updated_at=now() returning revision`,
        [item.subject_id, input.decision, input.reason, until, actorId],
      );
      revision = state[0].revision;
      await tx.query('delete from "session" where "userId"=$1', [item.subject_id]);
      await tx.query(
        "insert into identity_audit(actor_id,target_user_id,action,detail) values($1,$2,$3,$4)",
        [actorId, item.subject_id, input.decision, input.reason],
      );
    }
    await tx.query(
      `update moderation_cases set status='decided',decision=$2,public_reason=$3,decided_by=$4,decided_at=now(),sanction_revision=$5,updated_at=now() where id=$1`,
      [input.id, input.decision, input.reason, actorId, revision],
    );
    await tx.query(
      "insert into moderation_case_events(case_id,actor_id,kind,note,member_visible) values($1,$2,'decision',$3,true)",
      [input.id, actorId, input.reason],
    );
    if (item.report_id)
      await tx.query("update reports set status='resolved' where id=$1 and status='open'", [
        item.report_id,
      ]);
    await tx.query(
      "insert into platform_audit(actor_id,action,detail) values($1,'case.decision',$2)",
      [actorId, JSON.stringify({ caseId: input.id, decision: input.decision })],
    );
    return { ok: true };
  });
}
export async function decideCaseAppeal(
  sql: Sql,
  actorId: string,
  input: { id: number; decision: "upheld" | "overturned"; note: string },
) {
  return transaction(sql, async (tx) => {
    const appeal = (
      await tx.query<OperationRow>(
        `select a.*,c.decided_by as issuer,c.decision,c.subject_id,c.sanction_revision
      from moderation_case_appeals a join moderation_cases c on c.id=a.case_id where a.id=$1 for update of a,c`,
        [input.id],
      )
    )[0];
    if (!appeal || appeal.status !== "open")
      throw new Error("This appeal has already been reviewed.");
    if (appeal.issuer === actorId || appeal.user_id === actorId)
      throw new Error("Another administrator must review this appeal.");
    if (
      input.decision === "overturned" &&
      ["suspended", "banned"].includes(String(appeal.decision))
    ) {
      // Never undo a newer sanction issued by a different case or reviewer.
      const changed = await tx.query(
        `update identity_account_status set status='active',reason=$3,until=null,actor_id=$4,updated_at=now()
        where user_id=$1 and revision=$2 and actor_id=$5 and status=$6 returning user_id`,
        [
          appeal.subject_id,
          appeal.sanction_revision,
          input.note,
          actorId,
          appeal.issuer,
          appeal.decision,
        ],
      );
      if (!changed.length)
        throw new Error(
          "A newer account action exists. Review it before overturning this sanction.",
        );
      await tx.query(
        "insert into identity_audit(actor_id,target_user_id,action,detail) values($1,$2,'appeal.overturned',$3)",
        [actorId, appeal.subject_id, input.note],
      );
    }
    await tx.query(
      "update moderation_case_appeals set status=$2,decided_by=$3,decision_note=$4,decided_at=now() where id=$1",
      [input.id, input.decision, actorId, input.note],
    );
    await tx.query("update moderation_cases set status='closed',updated_at=now() where id=$1", [
      appeal.case_id,
    ]);
    await tx.query(
      "insert into moderation_case_events(case_id,actor_id,kind,note,member_visible) values($1,$2,$3,$4,true)",
      [appeal.case_id, actorId, `appeal.${input.decision}`, input.note],
    );
    await tx.query(
      "insert into platform_audit(actor_id,action,detail) values($1,'case.appeal',$2)",
      [actorId, JSON.stringify({ appealId: input.id, decision: input.decision })],
    );
    return { ok: true };
  });
}

type Proof = { caseId: number; userId: string; expires: number };
export function makeAppealProof(proof: Proof, secret: string) {
  if (secret.length < 32) throw new Error("Secure appeal signing is not configured.");
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(`kamino-case-appeal:${payload}`).digest("base64url")}`;
}
export function readAppealProof(token: string, secret: string, now = Date.now()): Proof {
  if (secret.length < 32 || token.length > 1000)
    throw new Error("This appeal link is invalid or expired.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("This appeal link is invalid or expired.");
  const expected = createHmac("sha256", secret).update(`kamino-case-appeal:${parts[0]}`).digest(),
    actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("This appeal link is invalid or expired.");
  const value = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Proof;
  if (
    !Number.isInteger(value.caseId) ||
    value.caseId < 1 ||
    typeof value.userId !== "string" ||
    value.expires <= now ||
    value.expires > now + 3600000
  )
    throw new Error("This appeal link is invalid or expired.");
  return value;
}
