import { internals } from "./server";
import { paidResourceAccessSql } from "./billing-policy";
import {
  parseNotifyPrefs,
  shouldPush,
  localHour,
  inQuietHours,
  muteSilences,
} from "./social-rules";
import { sendPush } from "./push.server";
import { processMediaDeletionQueue } from "./media-deletion.server";
import {
  processPushDeliveries,
  processEmailDigests,
  enqueueWeeklyDigest,
} from "./delivery-v10.server";
import { enqueueDueMediaJobs, mediaJobConfig, processMediaJobs } from "./media-jobs.server";
import { reconcileMissingEarnings } from "./money.server";
type Row = Record<string, unknown>;
type Sql = Awaited<ReturnType<typeof internals.db>>;

async function deliver(
  sql: Sql,
  p: Row,
  key: string,
  kind: string,
  title: string,
  body: string,
  href: string,
  targetType = "",
  targetId = "",
) {
  // Unique delivery key makes concurrent schedulers safe and repeat runs idempotent.
  const rows =
    await sql<Row>`insert into notifications(user_id,kind,title,body,href,target_type,target_id,delivery_key)
    values(${String(p.user_id)},${kind},${title},${body},${href},${targetType},${targetId},${key}) on conflict(user_id,delivery_key) where delivery_key is not null do nothing returning id`;
  if (!rows.length) return 0;
  const prefs = parseNotifyPrefs(p.notify_prefs);
  const pushAllowed =
    kind === "digest"
      ? prefs.digest &&
        !inQuietHours(
          localHour(new Date(), String(p.timezone ?? "")),
          p.quiet_start == null ? null : Number(p.quiet_start),
          p.quiet_end == null ? null : Number(p.quiet_end),
        )
      : shouldPush({
          kind,
          prefs,
          quietStart: p.quiet_start == null ? null : Number(p.quiet_start),
          quietEnd: p.quiet_end == null ? null : Number(p.quiet_end),
          timezone: String(p.timezone ?? ""),
        });
  if (pushAllowed)
    await sendPush(sql, String(p.user_id), {
      title,
      body,
      href,
      notificationId: Number(rows[0].id),
    });
  return 1;
}

/** Called by a protected scheduler endpoint; does not depend on members opening the app. */
export async function runNotificationJobs() {
  const sql = await internals.db();
  const mediaDeletion = await processMediaDeletionQueue(sql);
  let earningsReconciled: unknown = { credited: 0 };
  try {
    earningsReconciled = { credited: await reconcileMissingEarnings(sql) };
  } catch { earningsReconciled = { credited: 0, unavailable: true }; }
  let mediaJobs: unknown = { processed: 0 };
  try {
    const config = mediaJobConfig();
    await enqueueDueMediaJobs(sql, config);
    mediaJobs = { processed: await processMediaJobs(sql, config) };
  } catch { mediaJobs = { processed: 0, unavailable: true }; }
  let semanticIndex: unknown = { indexed: 0 };
  try {
    const { indexSemanticBatch } = await import("./search-v10.server");
    semanticIndex = await indexSemanticBatch(sql, { limit: 4 });
  } catch {
    semanticIndex = { indexed: 0, unavailable: true };
  }
  let delivered = 0;
  const eventRows =
    await sql.query<Row>(`select p.*,e.id as event_id,e.title as event_title,e.community_id,c.name as community_name
    from event_rsvps r join events e on e.id=r.event_id join communities c on c.id=e.community_id join profiles p on p.user_id=r.user_id
    where e.status<>'cancelled' and r.response='going' and e.starts_at>now() and e.starts_at<=now()+interval '24 hours' and p.user_id not like 'seed:%'
    and not exists(select 1 from identity_account_status s where s.user_id=p.user_id and s.status<>'active' and (s.until is null or s.until>now()))
    and ${internals.communityAccessSql("p.user_id", "c")}
    and ${paidResourceAccessSql("p.user_id", "event", "e.id")}
    and not exists(select 1 from notifications n where n.user_id=p.user_id and n.kind='event' and n.target_type='event' and n.target_id=cast(e.id as text)) limit 500`);
  for (const p of eventRows)
    if (parseNotifyPrefs(p.notify_prefs).events)
      delivered += await deliver(
        sql,
        p,
        `event:${p.event_id}`,
        "event",
        `Reminder: ${p.event_title}`,
        `Starts soon in ${p.community_name}.`,
        `/c/${p.community_id}/events`,
        "event",
        String(p.event_id),
      );
  const profiles =
    await sql<Row>`select p.* from profiles p where p.user_id not like 'seed:%' and min_age_confirmed_at is not null
    and not exists(select 1 from identity_account_status s where s.user_id=p.user_id and s.status<>'active' and (s.until is null or s.until>now())) order by user_id`;
  const now = new Date(),
    day = now.toISOString().slice(0, 10),
    weekStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
      ),
    )
      .toISOString()
      .slice(0, 10);
  for (const p of profiles) {
    const prefs = parseNotifyPrefs(p.notify_prefs),
      hour = localHour(now, String(p.timezone ?? ""));
    if (prefs.digest && hour >= 9) {
      const stats = (
        await sql.query<Row>(
          `select count(*)::int as posts,coalesce(sum(p.comment_count),0)::int as replies from posts p join communities c on c.id=p.community_id
        join memberships m on m.community_id=c.id and m.user_id=$1 and m.status='active' where p.created_at>now()-interval '7 days' and coalesce(p.hidden,false)=false and ${internals.visiblePosts("$1")}`,
          [String(p.user_id)],
        )
      )[0];
      delivered += await deliver(
        sql,
        p,
        `digest:${weekStart}`,
        "digest",
        "Your weekly community digest",
        `${stats.posts} posts and ${stats.replies} replies this week in your communities.`,
        "/",
      );
    }
    if (p.email_digest === true && hour >= 9) {
      await enqueueWeeklyDigest(sql, String(p.user_id), weekStart, internals.visiblePosts("$1"));
    }
    if (
      prefs.community &&
      Number(p.streak) > 0 &&
      hour >= 18 &&
      (!p.last_checkin_at || new Date(String(p.last_checkin_at)).toISOString().slice(0, 10) !== day)
    )
      delivered += await deliver(
        sql,
        p,
        `streak:${day}`,
        "streak",
        "Keep your streak going",
        "A quick check-in keeps your community streak alive.",
        "/",
      );
  }
  const followPosts =
    await sql.query<Row>(`select p.*,post.id as post_id,post.title as post_title,post.community_id,author.display_name as author_name
    from profile_follows f join profiles p on p.user_id=f.follower_id join posts post on post.author_user_id=f.followee_id join profiles author on author.user_id=f.followee_id
    join communities c on c.id=post.community_id where post.created_at>now()-interval '24 hours' and coalesce(post.hidden,false)=false
    and post.type not in ('story','wiki') and ${internals.visiblePosts("p.user_id", "post")}
    and not exists(select 1 from blocks b where (b.blocker_id=p.user_id and b.blocked_id=post.author_user_id) or (b.blocked_id=p.user_id and b.blocker_id=post.author_user_id))
    and not exists(select 1 from muted_people m where m.user_id=p.user_id and m.muted_user_id=post.author_user_id)
    and not exists(select 1 from identity_account_status s where s.user_id=p.user_id and s.status<>'active' and (s.until is null or s.until>now())) and p.user_id not like 'seed:%' limit 500`);
  for (const p of followPosts)
    if (parseNotifyPrefs(p.notify_prefs).social)
      delivered += await deliver(
        sql,
        p,
        `follow-post:${p.post_id}`,
        "follow_post",
        `${p.author_name} posted`,
        String(p.post_title).slice(0, 160),
        `/c/${p.community_id}/p/${p.post_id}`,
        "post",
        String(p.post_id),
      );
  const campaigns =
    await sql<Row>`select * from notification_campaigns where published_at>now()-interval '7 days' order by id`;
  for (const campaign of campaigns)
    for (const p of profiles)
      if (parseNotifyPrefs(p.notify_prefs).community)
        delivered += await deliver(
          sql,
          p,
          `campaign:${campaign.id}`,
          "community",
          String(campaign.title),
          String(campaign.body),
          String(campaign.href),
        );
  const push = await processPushDeliveries(sql, {
    allowed: async (notification) => {
      const userId = String(notification.user_id),
        prefs = parseNotifyPrefs(notification.notify_prefs),
        kind = String(notification.kind);
      try {
        await internals.assertAccountAllowed(sql, userId);
      } catch {
        return "cancel";
      }
      const visible = await sql.query(
        `select 1 from notifications n where n.id=$1 and n.user_id=$2 and (${internals.notificationAccessSql("$2", "n")})`,
        [notification.id, userId],
      );
      if (!visible.length) return "cancel";
      const switches: Record<string, unknown> = {
        like: notification.notify_likes,
        comment: notification.notify_comments,
        follow: notification.notify_follows,
        follow_request: notification.notify_follows,
        chat: notification.notify_chat,
        wall: notification.notify_wall,
      };
      if (kind in switches && switches[kind] !== true) return "cancel";
      if (
        notification.actor_id &&
        muteSilences(kind) &&
        (
          await sql`select 1 from muted_people where user_id=${userId} and muted_user_id=${String(notification.actor_id)}`
        ).length
      )
        return "cancel";
      if (kind === "digest") {
        if (!prefs.digest) return "cancel";
        return inQuietHours(
          localHour(new Date(), String(notification.timezone ?? "")),
          notification.quiet_start == null ? null : Number(notification.quiet_start),
          notification.quiet_end == null ? null : Number(notification.quiet_end),
        )
          ? "quiet"
          : "allow";
      }
      if (
        !shouldPush({
          kind: String(notification.kind),
          prefs,
          quietStart: null,
          quietEnd: null,
          timezone: String(notification.timezone ?? ""),
        })
      )
        return "cancel";
      if (
        !shouldPush({
          kind: String(notification.kind),
          prefs,
          quietStart: notification.quiet_start == null ? null : Number(notification.quiet_start),
          quietEnd: notification.quiet_end == null ? null : Number(notification.quiet_end),
          timezone: String(notification.timezone ?? ""),
        })
      )
        return "quiet";
      return "allow";
    },
  });
  const email = await processEmailDigests(sql, {
    compose: async (userId, week) => {
      const row = (
        await sql.query<Row>(
          `select u.email,p.email_digest,q.post_count,q.reply_count from "user" u join profiles p on p.user_id=u.id
      join email_digest_queue q on q.user_id=u.id and q.week_start=$2::date where u.id=$1 and u."emailVerified"=true`,
          [userId, week],
        )
      )[0];
      if (!row || row.email_digest !== true) return null;
      try {
        await internals.assertAccountAllowed(sql, userId);
      } catch {
        return null;
      }
      const origin = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "");
      if (!origin || !/^https?:\/\//.test(origin))
        throw new Error("Email origin is not configured.");
      return {
        to: String(row.email),
        subject: "Your weekly Kamino digest",
        text: `Your communities shared ${row.post_count} posts and ${row.reply_count} replies during the week before ${week}.\n\nCatch up: ${origin}/\n\nManage or disable email digests: ${origin}/operations\n\nThis email contains activity totals only. Content access is checked when you open Kamino.`,
      };
    },
  });
  await sql`update progression_seasons set status='active' where status='scheduled' and starts_at<=now() and ends_at>now()`;
  await sql`update progression_seasons set status='ended' where status in ('scheduled','active') and ends_at<=now()`;
  return { delivered, mediaDeletion, push, email, semanticIndex, checkedAt: now.toISOString() };
}
