import { paidResourceAccessSql } from './billing-policy.ts';

/** Reposts keep source previews, so every source in the chain must retain its paid-resource access. */
export function paidPostAccessSql(viewerSql: string, postIdSql: string, sourceCommunitySql = 'true') {
  return `not exists (
    with recursive paid_ancestors as (
      select ancestor.id,ancestor.community_id,ancestor.original_post_id,array[ancestor.id] as path
      from posts ancestor where ancestor.id=${postIdSql}
      union all
      select parent.id,parent.community_id,parent.original_post_id,child.path||parent.id
      from posts parent join paid_ancestors child on parent.id=child.original_post_id
      where not parent.id=any(child.path) and cardinality(child.path)<20
    ) select 1 from paid_ancestors paid_source
      where not ${paidResourceAccessSql(viewerSql, 'post', 'paid_source.id')}
        or not ${paidResourceAccessSql(viewerSql, 'community', 'paid_source.community_id')}
        or not (${sourceCommunitySql})
        or (paid_source.original_post_id is not null and not exists(select 1 from posts original where original.id=paid_source.original_post_id))
        or (paid_source.original_post_id is not null and (cardinality(paid_source.path)>=20 or paid_source.original_post_id=any(paid_source.path)))
  )`;
}
