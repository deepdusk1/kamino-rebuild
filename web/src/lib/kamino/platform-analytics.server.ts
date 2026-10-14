import type { Sql } from "@/lib/db";

const dayText = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
/** Aggregate only real account activity. Never return identities or backfill invented history. */
export async function collectPlatformAnalytics(sql: Sql) {
  const metrics = (
    await sql`select
    (select count(*)::int from profiles p join "user" u on u.id=p.user_id where p.user_id not like 'seed:%') as members,
    (select count(distinct a.user_id)::int from daily_member_activity a where a.active_on=(now() at time zone 'UTC')::date and a.user_id not like 'seed:%') as dau,
    (select count(distinct a.user_id)::int from daily_member_activity a where a.active_on between (now() at time zone 'UTC')::date-6 and (now() at time zone 'UTC')::date and a.user_id not like 'seed:%') as wau,
    (select count(distinct a.user_id)::int from daily_member_activity a where a.active_on between (now() at time zone 'UTC')::date-29 and (now() at time zone 'UTC')::date and a.user_id not like 'seed:%') as mau,
    (select count(*)::int from profiles p join "user" u on u.id=p.user_id where p.created_at>=now()-interval '7 days' and p.user_id not like 'seed:%') as new_members_7`
  )[0];
  const activity = await sql`with dates as (
    select generate_series((now() at time zone 'UTC')::date-29,(now() at time zone 'UTC')::date,interval '1 day')::date as day
  ) select d.day,
    (select count(*)::int from daily_member_activity a where a.active_on=d.day and a.user_id not like 'seed:%') as active_members,
    (select count(*)::int from profiles p join "user" u on u.id=p.user_id where (p.created_at at time zone 'UTC')::date=d.day and p.user_id not like 'seed:%') as new_members
    from dates d order by d.day`;
  const cohorts = await sql`with members as (
    select p.user_id,(p.created_at at time zone 'UTC')::date as joined from profiles p join "user" u on u.id=p.user_id
    where p.user_id not like 'seed:%' and p.created_at>=now()-interval '70 days'
  ) select date_trunc('week',m.joined)::date as week,count(*)::int as members,
    count(*) filter(where m.joined<=(now() at time zone 'UTC')::date-14)::int as eligible_7,
    count(*) filter(where m.joined<=(now() at time zone 'UTC')::date-14 and exists(select 1 from daily_member_activity a where a.user_id=m.user_id and a.active_on between m.joined+7 and m.joined+13))::int as retained_7,
    count(*) filter(where m.joined<=(now() at time zone 'UTC')::date-37)::int as eligible_30,
    count(*) filter(where m.joined<=(now() at time zone 'UTC')::date-37 and exists(select 1 from daily_member_activity a where a.user_id=m.user_id and a.active_on between m.joined+30 and m.joined+36))::int as retained_30
    from members m group by date_trunc('week',m.joined) order by week desc limit 11`;
  return {
    metrics: {
      members: Number(metrics.members),
      dau: Number(metrics.dau),
      wau: Number(metrics.wau),
      mau: Number(metrics.mau),
      newMembers7: Number(metrics.new_members_7),
    },
    activity: activity.map((r) => ({
      day: dayText(r.day),
      activeMembers: Number(r.active_members),
      newMembers: Number(r.new_members),
    })),
    cohorts: cohorts.map((r) => {
      const members = Number(r.members),
        eligible7 = Number(r.eligible_7),
        eligible30 = Number(r.eligible_30);
      return {
        week: dayText(r.week),
        members: members >= 5 ? members : null,
        eligible7: eligible7 >= 5 ? eligible7 : null,
        retained7: eligible7 >= 5 ? Number(r.retained_7) : null,
        retention7: eligible7 >= 5 ? Math.round((100 * Number(r.retained_7)) / eligible7) : null,
        eligible30: eligible30 >= 5 ? eligible30 : null,
        retained30: eligible30 >= 5 ? Number(r.retained_30) : null,
        retention30:
          eligible30 >= 5 ? Math.round((100 * Number(r.retained_30)) / eligible30) : null,
      };
    }),
    definition:
      "Activity is an authenticated app request, recorded once per member per UTC day starting with release 9. Seven-day retention means a return on signup days 7–13, after day 14. Thirty-day retention means a return on days 30–36, after day 37. Cohorts smaller than five eligible members are withheld. Earlier history is not backfilled.",
  };
}
