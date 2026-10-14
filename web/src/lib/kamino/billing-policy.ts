export type PaidResourceKind = "community" | "post" | "chat" | "event";

/** Arguments are trusted SQL expressions/placeholders supplied by the server, never user input. */
export function paidResourceAccessSql(
  viewerSql: string,
  kind: PaidResourceKind,
  targetIdSql: string,
): string {
  if (!["community", "post", "chat", "event"].includes(kind))
    throw new Error("Invalid paid resource kind.");
  return `(not exists(select 1 from billing_resource_requirements br where br.resource_kind='${kind}' and br.resource_id=cast(${targetIdSql} as text))
    or exists(select 1 from billing_resource_requirements br where br.resource_kind='${kind}' and br.resource_id=cast(${targetIdSql} as text)
      and (br.owner_id=${viewerSql}
        or exists(select 1 from memberships bm where bm.community_id=br.community_id and bm.user_id=${viewerSql} and bm.status='active' and bm.role in ('agent','leader','curator'))
        or exists(select 1 from billing_entitlements be where be.offer_id=br.offer_id and be.beneficiary_id=${viewerSql}
          and be.state='active' and (be.expires_at is null or be.expires_at>now())))))`;
}
