import { paidResourceAccessSql } from "./billing-policy.ts";

/** Matches the legacy parseHref rules before any saved preview or unread count is returned. */
export function notificationTargetSql(n = "n") {
  const type = `coalesce(nullif(${n}.target_type,''),case
    when ${n}.href ~ '^/c/[^/?#]+/p/[0-9]+' then 'post'
    when ${n}.href ~ '^/chats/[0-9]+' then 'room'
    when ${n}.href ~ '^/c/[^/?#]+' then 'community'
    else '' end)`;
  const id = `coalesce(nullif(${n}.target_id,''),case
    when ${n}.href ~ '^/c/[^/?#]+/p/[0-9]+' then substring(${n}.href from '^/c/[^/?#]+/p/([0-9]+)')
    when ${n}.href ~ '^/chats/[0-9]+' then substring(${n}.href from '^/chats/([0-9]+)')
    when ${n}.href ~ '^/c/[^/?#]+' then substring(${n}.href from '^/c/([^/?#]+)')
    else null end)`;
  return {
    type,
    id,
    numericId: `(case when (${id}) ~ '^[0-9]{1,15}$' then (${id})::bigint else null end)`,
  };
}

/** Older event notices link to a community calendar without identifying one event. Fail closed on ambiguous paid previews. */
export function legacyEventNotificationAccessSql(
  viewer: string,
  n: string,
  communityIdSql: string,
) {
  return `(${n}.kind not in ('event','challenge') or not exists(select 1 from events legacy_event
    where legacy_event.community_id=(${communityIdSql}) and not ${paidResourceAccessSql(viewer, "event", "legacy_event.id")}))`;
}
