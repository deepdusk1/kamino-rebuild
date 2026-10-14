/**
 * The referral program, served: every member gets a personal invite code; when somebody creates
 * an account through their link and claims it, both sides earn reputation. One code per member,
 * one referral per person, never your own code, and reputation is only ever earned — it cannot
 * be bought (house rule). The database rules live in `referrals.server.ts` with unit tests.
 *
 * Same conventions as `server.ts`: every function validates its input, checks permissions on
 * the server, and is reachable from the phone app over `/api/v1/rpc/<name>` (see `mobile-api.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { optionalAuth } from "./optional-auth";
import { internals } from "./server";
import {
  claimReferralForUser,
  ensureReferralCode,
  referralPreview,
  referralStats,
} from "./referrals.server";

type Authed = { userId: string };

const codeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{6,12}$/, "That invite code does not look right."));

export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const code = await ensureReferralCode(sql, userId);
    const stats = await referralStats(sql, userId);
    return { code, ...stats, path: `/login?mode=up&ref=${code}` };
  });

/** Public preview of whose invite link this is, shown on the sign-up page. No account needed. */
export const getReferralPreview = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .validator(codeSchema)
  .handler(async ({ data: code }) => referralPreview(await internals.db(), code));

/** Called once by a brand-new member (or anyone who has never been referred) after signing up. */
export const claimReferral = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: codeSchema }))
  .handler(async ({ context, data }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    const result = await claimReferralForUser(sql, userId, data.code);
    const { syncAchievements } = internals;
    const codeRow = (await sql`select user_id from referral_codes where code = ${data.code}`)[0];
    if (codeRow) await syncAchievements(sql, String(codeRow.user_id)).catch(() => undefined);
    await syncAchievements(sql, userId).catch(() => undefined);
    return result;
  });
