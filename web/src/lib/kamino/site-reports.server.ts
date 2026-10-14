import type { Sql } from "@/lib/db";

/** Closing a report and recording the reviewer are one statement. A second reviewer cannot overwrite it. */
export async function closeSiteReport(
  sql: Sql,
  userId: string,
  input: { id: number; status: "resolved" | "dismissed"; note: string },
) {
  const rows = await sql.query<{ id: number }>(
    `with closed as (
      update reports set status = $2 where id = $1 and status = 'open' returning id
    ), audited as (
      insert into platform_audit(actor_id,action,detail)
      select $3, 'report.' || $2, $4 from closed returning id
    ) select id from closed`,
    [input.id, input.status, userId, JSON.stringify({ reportId: input.id, note: input.note })],
  );
  if (!rows.length) throw new Error("That report was already reviewed or no longer exists.");
  return { ok: true as const, status: input.status };
}
