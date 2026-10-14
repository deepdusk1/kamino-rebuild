import type { Sql } from "../db";
export type PushPayload = { title: string; body: string; href: string; notificationId?: number };
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

/** Persist intent; network delivery belongs to the scheduler, never to a member's request. */
export async function sendPush(sql: Sql, userId: string, payload: PushPayload): Promise<void> {
  try {
    if (userId.startsWith("seed:")) return;
    await sql.query(
      `insert into push_delivery_queue(user_id,notification_id,token)
      select $1,n.id,t.token from notifications n join push_tokens t on t.user_id=n.user_id join "user" u on u.id=n.user_id
      where n.user_id=$1 and n.id=coalesce($5::int,(select id from notifications where user_id=$1 and title=$2 and body=$3 and href=$4 order by id desc limit 1))
      and t.token ~ '^Expo(nent)?PushToken\\[[A-Za-z0-9_-]+\\]$'
      on conflict(notification_id,token) do nothing`,
      [userId, payload.title, payload.body, payload.href, payload.notificationId ?? null],
    );
  } catch {
    console.warn("[push] Unable to queue a notification.");
  }
}
