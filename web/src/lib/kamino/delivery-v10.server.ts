import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";
import { sendMailStrict, type Mail } from "../auth/mailer.server.ts";

type Row = Record<string, unknown>;
type ProviderReply = { status?: string; id?: string; details?: { error?: string } };
export const MAX_DELIVERY_ATTEMPTS = 6;
export const deliveryDelay = (attempt: number) =>
  Math.min(6 * 3600, 60 * 2 ** Math.max(0, attempt - 1));
const permanentPush = new Set([
  "DeviceNotRegistered",
  "MessageTooBig",
  "MismatchSenderId",
  "InvalidCredentials",
  "UNAUTHORIZED",
]);
const safeHref = (href: unknown) =>
  typeof href === "string" && /^\/(?!\/)[A-Za-z0-9/_?=&.%#-]{0,500}$/.test(href)
    ? href
    : "/notifications";

/** How long a call push may ring for. After this the caller has usually given up, so the push is dropped. */
export const CALL_RING_SECONDS = 45;

/**
 * Android notification channels the phone app creates (mobile/src/lib/push.ts, PUSH_CHANNELS). A push naming a channel
 * the phone doesn't have is not shown at all, so these ids must match the app exactly.
 */
export const PUSH_CHANNEL_IDS = {
  calls: "kamino_calls_critical_v2",
  messages: "kamino_messages_high_v2",
  events: "kamino_events_high_v2",
  general: "kamino_general_v2",
} as const;

/** Notification action sets the phone app registers (PUSH_CATEGORIES in the app). */
export const PUSH_CATEGORY_IDS = {
  call: "KAMINO_INCOMING_CALL",
  chat: "KAMINO_CHAT_MESSAGE",
  live: "KAMINO_LIVE_EVENT",
} as const;

type PushKind = "call" | "chat" | "live" | "general";

/** Sorts a notification into the four push styles, using the same rules as the phone app. */
export function pushKindOf(kind: string, href: string): PushKind {
  if (kind === "call" || /[?&]call=1\b/.test(href)) return "call";
  if (["live", "event", "events", "watch_party"].includes(kind) || href.startsWith("/live/")) return "live";
  if (["chat", "message", "dm"].includes(kind) || /^\/chats\/\d+/.test(href)) return "chat";
  return "general";
}

/**
 * The message sent to Expo's push service for one notification. Expo hands it to Firebase (Android) or APNs (iOS).
 *
 * - The lock-screen text only says what kind of thing happened ("New message"), never who sent it or what it says:
 *   the phone may be locked in someone else's hands. The app shows the details once opened.
 * - `priority: "high"` lets Android wake a sleeping or closed app straight away instead of batching the push.
 * - `channelId` picks the app's loud channel for calls and messages (sound, heads-up banner).
 * - A call only rings for CALL_RING_SECONDS; a ring that arrives a minute late is useless.
 */
export function buildExpoPushMessage(
  token: string,
  n: { id?: unknown; kind?: unknown; href?: unknown },
) {
  const href = safeHref(n.href);
  const style = pushKindOf(String(n.kind ?? ""), href);
  const roomId = Number(/^\/(?:chats|live)\/(\d+)/.exec(href)?.[1] ?? 0) || undefined;
  const text: Record<PushKind, { title: string; body: string }> = {
    call: { title: "Incoming call", body: "Open Kamino to answer." },
    chat: { title: "New message", body: "Open Kamino to read it." },
    live: { title: "Happening now on Kamino", body: "Open Kamino to see what's on." },
    general: { title: "Kamino", body: "You have a new notification. Open Kamino to view it." },
  };
  const channel: Record<PushKind, string> = {
    call: PUSH_CHANNEL_IDS.calls,
    chat: PUSH_CHANNEL_IDS.messages,
    live: PUSH_CHANNEL_IDS.events,
    general: PUSH_CHANNEL_IDS.general,
  };
  const category: Partial<Record<PushKind, string>> = {
    call: PUSH_CATEGORY_IDS.call,
    // Reply / Mark as read need a room to act on.
    chat: roomId ? PUSH_CATEGORY_IDS.chat : undefined,
    live: PUSH_CATEGORY_IDS.live,
  };
  const notificationId = Number(n.id) || undefined;
  return {
    to: token,
    ...text[style],
    sound: "default",
    priority: "high" as const,
    channelId: channel[style],
    ...(category[style] ? { categoryId: category[style] } : {}),
    ttl: style === "call" ? CALL_RING_SECONDS : 86400,
    data: {
      href,
      kind: style === "general" ? String(n.kind ?? "") : style,
      ...(roomId ? { roomId } : {}),
      ...(notificationId ? { notificationId } : {}),
    },
  };
}

/** Fixed totals are privacy-safe and keep retries identical within provider idempotency limits. */
export async function enqueueWeeklyDigest(
  sql: Sql,
  userId: string,
  weekStart: string,
  visiblePostSql: string,
) {
  await sql.query(
    `insert into email_digest_queue(user_id,week_start,post_count,reply_count)
    select $1,$2,(select count(*)::int from posts p join memberships m on m.community_id=p.community_id and m.user_id=$1 and m.status='active'
      where p.created_at>=$2::date-interval '7 days' and p.created_at<$2::date and coalesce(p.hidden,false)=false and (${visiblePostSql})
      and not exists(select 1 from blocks b where (b.blocker_id=$1 and b.blocked_id=p.author_user_id) or (b.blocked_id=$1 and b.blocker_id=p.author_user_id))
      and not exists(select 1 from muted_people mp where mp.user_id=$1 and mp.muted_user_id=p.author_user_id)),
      (select count(*)::int from comments reply join posts p on p.id=reply.post_id join memberships m on m.community_id=p.community_id and m.user_id=$1 and m.status='active'
      where reply.created_at>=$2::date-interval '7 days' and reply.created_at<$2::date and coalesce(reply.held,false)=false and coalesce(p.hidden,false)=false and (${visiblePostSql})
      and not exists(select 1 from blocks b where (b.blocker_id=$1 and b.blocked_id=reply.author_user_id) or (b.blocked_id=$1 and b.blocker_id=reply.author_user_id))
      and not exists(select 1 from muted_people mp where mp.user_id=$1 and mp.muted_user_id=reply.author_user_id))
    where exists(select 1 from "user" u join profiles p on p.user_id=u.id where u.id=$1 and u."emailVerified"=true and p.email_digest=true)
    on conflict(user_id,week_start) do nothing`,
    [userId, weekStart],
  );
}

export async function processPushDeliveries(
  sql: Sql,
  options: {
    limit?: number;
    now?: Date;
    request?: typeof fetch;
    allowed: (row: Row) => Promise<"allow" | "quiet" | "cancel">;
    /** Only deliver this notification's pushes (used to ring a call right away instead of waiting for the scheduler). */
    notificationId?: number;
  },
) {
  const result = {
    sent: 0,
    delivered: 0,
    failed: 0,
    cancelled: 0,
    deferred: 0,
    configured: process.env.KAMINO_PUSH_ENABLED === "true",
  };
  const now = options.now ?? new Date(),
    lease = randomUUID(),
    limit = Math.max(1, Math.min(24, options.limit ?? 12));
  await sql.query(
    "update push_delivery_queue set status='cancelled',last_error='notification expired',completed_at=$1,lease_token=null,lease_until=null where status in ('pending','receipt') and created_at<$1::timestamptz-interval '2 days' and (lease_until is null or lease_until<$1)",
    [now.toISOString()],
  );
  await sql.query(
    "delete from push_delivery_queue where completed_at<$1::timestamptz-interval '30 days'",
    [now.toISOString()],
  );
  if (!result.configured && !options.request) return result;
  const rows = await sql.query<Row>(
    `with due as (select id from push_delivery_queue
    where status in ('pending','receipt') and next_attempt_at<=$1 and (lease_until is null or lease_until<$1)
    and ($4::int is null or notification_id=$4)
    order by id for update skip locked limit $2)
    update push_delivery_queue q set lease_token=$3,lease_until=$1::timestamptz+interval '2 minutes'
    from due where q.id=due.id returning q.*`,
    [now.toISOString(), limit, lease, options.notificationId ?? null],
  );
  const request = options.request ?? fetch;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN?.trim())
    headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN.trim()}`;
  let cursor = 0;
  const worker = async () => {
    for (let index; (index = cursor++) < rows.length;) {
      const row = rows[index];
      const attempt = Number(row.attempts) + 1,
        receipt = row.status === "receipt";
      let retrySend = !receipt;
      const finish = async (status: string, error = "", attempts = Number(row.attempts)) => {
        await sql.query(
          `update push_delivery_queue set status=$3,last_error=$4,lease_token=null,lease_until=null,completed_at=$5,attempts=$6
        where id=$1 and lease_token=$2`,
          [row.id, lease, status, error, now.toISOString(), attempts],
        );
      };
      try {
        const n = (
          await sql.query<Row>(
            `select n.*,p.notify_prefs,p.quiet_start,p.quiet_end,p.timezone,p.notify_likes,p.notify_comments,p.notify_follows,p.notify_chat,p.notify_wall,t.token
        from notifications n join profiles p on p.user_id=n.user_id join push_tokens t on t.user_id=n.user_id
        where n.id=$1 and n.user_id=$2 and t.token=$3`,
            [row.notification_id, row.user_id, row.token],
          )
        )[0];
        if (!n) {
          await finish("cancelled", "recipient unavailable");
          result.cancelled++;
          continue;
        }
        const isCall = pushKindOf(String(n.kind ?? ""), safeHref(n.href)) === "call";
        const createdAt =
          n.created_at instanceof Date ? n.created_at.getTime() : new Date(String(n.created_at)).getTime();
        if (!receipt && isCall && now.getTime() - createdAt > CALL_RING_SECONDS * 1000) {
          await finish("cancelled", "call is over");
          result.cancelled++;
          continue;
        }
        const allowed = await options.allowed(n);
        if (allowed === "cancel") {
          await finish("cancelled", "recipient preferences or access changed");
          result.cancelled++;
          continue;
        }
        if (allowed === "quiet" && isCall) {
          // A call can't wait for quiet hours to end; the in-app list still shows it as missed.
          await finish("cancelled", "quiet hours");
          result.cancelled++;
          continue;
        }
        if (allowed === "quiet") {
          await sql.query(
            `update push_delivery_queue set next_attempt_at=$3::timestamptz+interval '1 hour',lease_token=null,lease_until=null where id=$1 and lease_token=$2`,
            [row.id, lease, now.toISOString()],
          );
          result.deferred++;
          continue;
        }
        // Never put another member's text, identity, community or media on a lock screen (see buildExpoPushMessage).
        const body = receipt ? { ids: [String(row.ticket_id)] } : [buildExpoPushMessage(String(row.token), n)];
        const response = await request(
          `https://exp.host/--/api/v2/push/${receipt ? "getReceipts" : "send"}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!response.ok) {
          if (response.status < 500 && response.status !== 429) {
            await finish(
              "failed",
              `provider HTTP ${response.status}`,
              receipt ? Number(row.attempts) : attempt,
            );
            result.failed++;
            continue;
          }
          throw new Error("temporary provider failure");
        }
        const json = (await response.json()) as {
          data?: ProviderReply[] | Record<string, ProviderReply>;
        };
        const ticket = receipt
          ? (json.data as Record<string, ProviderReply> | undefined)?.[String(row.ticket_id)]
          : (json.data as ProviderReply[] | undefined)?.[0];
        if (ticket?.status === "ok") {
          if (receipt) {
            await finish("delivered");
            result.delivered++;
          } else if (ticket.id) {
            await sql.query(
              `update push_delivery_queue set status='receipt',attempts=$3,ticket_id=$4,next_attempt_at=$5::timestamptz+interval '15 minutes',lease_token=null,lease_until=null,last_error='' where id=$1 and lease_token=$2`,
              [row.id, lease, attempt, ticket.id, now.toISOString()],
            );
            result.sent++;
          } else throw new Error("missing provider ticket");
          continue;
        }
        const error =
          ticket?.details?.error ?? (receipt ? "receipt unavailable" : "invalid provider response");
        if (error === "DeviceNotRegistered") {
          await sql.query("delete from push_tokens where token=$1 and user_id=$2", [
            row.token,
            row.user_id,
          ]);
          result.cancelled++;
          continue;
        }
        if (permanentPush.has(error)) {
          await finish("failed", error, receipt ? Number(row.attempts) : attempt);
          result.failed++;
          continue;
        }
        if (receipt && !ticket && Number(row.receipt_checks) < 8) {
          await sql.query(
            `update push_delivery_queue set receipt_checks=receipt_checks+1,next_attempt_at=$3::timestamptz+interval '30 minutes',lease_token=null,lease_until=null,last_error='receipt unavailable' where id=$1 and lease_token=$2`,
            [row.id, lease, now.toISOString()],
          );
          result.deferred++;
          continue;
        }
        if (receipt && !ticket) {
          await finish("failed", "provider receipt remained unavailable");
          result.failed++;
          continue;
        }
        if (receipt && ticket?.status === "error") retrySend = true;
        throw new Error(error);
      } catch {
        if (receipt && !retrySend) {
          if (Number(row.receipt_checks) >= 8) {
            await finish("failed", "receipt retry limit reached");
            result.failed++;
          } else {
            await sql.query(
              `update push_delivery_queue set receipt_checks=receipt_checks+1,next_attempt_at=$3::timestamptz+interval '30 minutes',lease_token=null,lease_until=null,last_error='temporary receipt lookup failure' where id=$1 and lease_token=$2`,
              [row.id, lease, now.toISOString()],
            );
            result.deferred++;
          }
        } else if (attempt >= MAX_DELIVERY_ATTEMPTS) {
          await finish("failed", "retry limit reached", attempt);
          result.failed++;
        } else {
          await sql.query(
            `update push_delivery_queue set status='pending',attempts=$3,ticket_id=null,next_attempt_at=$4::timestamptz+$5*interval '1 second',last_error='temporary delivery failure',lease_token=null,lease_until=null where id=$1 and lease_token=$2`,
            [row.id, lease, attempt, now.toISOString(), deliveryDelay(attempt)],
          );
          result.deferred++;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, () => worker()));
  await sql.query(
    "delete from push_delivery_queue where completed_at < $1::timestamptz-interval '30 days'",
    [now.toISOString()],
  );
  return result;
}

export async function processEmailDigests(
  sql: Sql,
  options: {
    limit?: number;
    now?: Date;
    send?: (mail: Mail, key: string) => Promise<string>;
    compose: (userId: string, weekStart: string) => Promise<Mail | null>;
  },
) {
  const configured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
  const result = { sent: 0, failed: 0, cancelled: 0, deferred: 0, configured };
  const now = options.now ?? new Date(),
    lease = randomUUID();
  await sql.query(
    "update email_digest_queue set status='cancelled',last_error='digest expired',completed_at=$1,lease_token=null,lease_until=null where status='pending' and created_at<$1::timestamptz-interval '14 days' and (lease_until is null or lease_until<$1)",
    [now.toISOString()],
  );
  await sql.query(
    "delete from email_digest_queue where completed_at<$1::timestamptz-interval '90 days'",
    [now.toISOString()],
  );
  if (!configured && !options.send) return result;
  const rows = await sql.query<Row>(
    `with due as(select id from email_digest_queue where status='pending' and next_attempt_at<=$1 and (lease_until is null or lease_until<$1)
    order by id for update skip locked limit $2)
    update email_digest_queue q set lease_token=$3,lease_until=$1::timestamptz+interval '2 minutes' from due where q.id=due.id returning q.*`,
    [now.toISOString(), Math.max(1, Math.min(24, options.limit ?? 12)), lease],
  );
  let cursor = 0;
  const worker = async () => {
    for (let index; (index = cursor++) < rows.length;) {
      const row = rows[index];
      const attempt = Number(row.attempts) + 1;
      try {
        const mail = await options.compose(
          String(row.user_id),
          String(row.week_start).slice(0, 10),
        );
        if (!mail) {
          await sql.query(
            "update email_digest_queue set status='cancelled',completed_at=$3,lease_token=null,lease_until=null where id=$1 and lease_token=$2",
            [row.id, lease, now.toISOString()],
          );
          result.cancelled++;
          continue;
        }
        // Stop retrying before the provider's 24-hour idempotency window closes.
        if (
          now.getTime() - new Date(String(row.created_at)).getTime() > 20 * 3600000 &&
          attempt > 1
        )
          throw new Error("idempotency window expired");
        const provider = await (options.send ?? sendMailStrict)(mail, `kamino-digest-${row.id}`);
        await sql.query(
          "update email_digest_queue set status='sent',attempts=$3,provider_id=$4,completed_at=$5,lease_token=null,lease_until=null,last_error='' where id=$1 and lease_token=$2",
          [row.id, lease, attempt, provider, now.toISOString()],
        );
        result.sent++;
      } catch (error) {
        const exhausted =
          attempt >= MAX_DELIVERY_ATTEMPTS ||
          (error instanceof Error && error.message === "idempotency window expired");
        await sql.query(
          `update email_digest_queue set status=$3,attempts=$4,next_attempt_at=$5::timestamptz+$6*interval '1 second',last_error=$7,completed_at=$8,lease_token=null,lease_until=null where id=$1 and lease_token=$2`,
          [
            row.id,
            lease,
            exhausted ? "failed" : "pending",
            attempt,
            now.toISOString(),
            deliveryDelay(attempt),
            exhausted ? "delivery requires review" : "temporary delivery failure",
            exhausted ? now.toISOString() : null,
          ],
        );
        if (exhausted) result.failed++;
        else result.deferred++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, () => worker()));
  await sql.query(
    "delete from email_digest_queue where completed_at<$1::timestamptz-interval '90 days'",
    [now.toISOString()],
  );
  return result;
}
