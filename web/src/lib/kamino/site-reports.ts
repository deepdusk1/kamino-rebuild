import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { iso } from "./map";
import { isSiteAdmin } from "./safety.server";
import { internals } from "./server";
import { closeSiteReport } from "./site-reports.server";

/** Reports contain reporter-supplied details. Original private messages/media are never returned by this list. */
export const listSiteReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: unknown) => z.object({
    closed: z.boolean().default(false),
    beforeId: z.number().int().positive().optional(),
  }).parse(data ?? {}))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as { userId: string };
    if (!(await isSiteAdmin(sql, userId))) throw new Error("Verified site administrators only.");
    const rows = await sql.query(
      `select r.id,r.community_id,left(c.name,120) as community_name,left(r.target_type,40) as target_type,left(r.target_id,200) as target_id,
        left(r.reason,300) as reason,left(r.details,5000) as details,r.status,r.created_at
       from reports r left join communities c on c.id=r.community_id
       where ${data.closed ? "r.status <> 'open'" : "r.status = 'open'"}
         and ($1::bigint is null or r.id < $1)
       order by r.id desc limit 101`, [data.beforeId ?? null],
    );
    const reports = rows.slice(0, 100).map(row => ({
      id: Number(row.id),
      communityId: row.community_id ? String(row.community_id) : null,
      communityName: String(row.community_name ?? ""),
      targetType: String(row.target_type),
      targetId: String(row.target_id),
      reason: String(row.reason),
      details: String(row.details ?? ""),
      status: String(row.status),
      createdAt: iso(row.created_at),
    }));
    return { reports, nextBeforeId: rows.length > 100 ? reports.at(-1)!.id : null };
  });

/** Resolving a human report records a decision; content removal remains a separate explicit moderation action. */
export const reviewSiteReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => z.object({
    id: z.number().int().positive(),
    status: z.enum(["resolved", "dismissed"]),
    note: z.string().trim().max(1000).default(""),
  }).parse(data))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as { userId: string };
    if (!(await isSiteAdmin(sql, userId))) throw new Error("Verified site administrators only.");
    return closeSiteReport(sql, userId, data);
  });

/** Own moderation records remain reachable after a community ban, without revealing other members or content. */
export const listMySafetyCommunities = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db();
    const { userId } = context as { userId: string };
    const rows = await sql`select c.id,c.name,m.status,m.role from memberships m
      join communities c on c.id=m.community_id where m.user_id=${userId}
      order by (m.status='banned') desc,m.joined_at desc limit 100`;
    return rows.map(row => ({
      id: String(row.id), name: String(row.name), status: String(row.status), role: String(row.role),
    }));
  });
