/**
 * Referral program internals (database logic, no request context) so the rules are unit-testable:
 * `referrals.ts` wraps these in server functions for the web and phone apps.
 */
import type { Sql } from "@/lib/db";

export const REFERRER_REP = 150;
export const INVITED_REP = 50;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1 — unambiguous to read out

function newCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

type Row = Record<string, unknown>;

export async function ensureReferralCode(sql: Sql, userId: string): Promise<string> {
  const existing = await sql<{ code: string }>`
    select code from referral_codes where user_id = ${userId} limit 1`;
  if (existing[0]?.code) return existing[0].code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    try {
      await sql`insert into referral_codes(code, user_id) values(${code}, ${userId})`;
      return code;
    } catch {
      // Code collision — try a fresh one.
    }
  }
  throw new Error("Could not create your invite code. Try again in a moment.");
}

export async function referralStats(sql: Sql, userId: string) {
  const stats = await sql<{ invited: string | number }>`
    select count(*) as invited from referrals where referrer_id = ${userId}`;
  const invited = Number(stats[0]?.invited ?? 0);
  return { invited, repEarned: invited * REFERRER_REP, repPerInvite: REFERRER_REP, repForFriend: INVITED_REP };
}

export async function referralPreview(sql: Sql, code: string): Promise<{ valid: false } | { valid: true; name: string }> {
  const row = (
    await sql`
      select p.display_name
      from referral_codes c join profiles p on p.user_id = c.user_id
      where c.code = ${code} limit 1`
  )[0] as Row | undefined;
  if (!row) return { valid: false };
  return { valid: true, name: String(row.display_name ?? "A member") };
}

/**
 * Credits a referral for the signed-in member: validates the code, records the referral once per
 * person, then grants reputation to both sides. Throws a readable error for every refusal.
 */
export async function claimReferralForUser(sql: Sql, userId: string, code: string) {
  const codeRow = (await sql`select user_id from referral_codes where code = ${code}`)[0] as Row | undefined;
  if (!codeRow) throw new Error("That invite code is not valid.");
  const referrerId = String(codeRow.user_id);
  if (referrerId === userId) throw new Error("You cannot use your own invite code.");
  const already = await sql`select 1 from referrals where invited_user_id = ${userId} limit 1`;
  if (already.length) throw new Error("This account has already been referred.");
  // Guard against a deleted referrer between the two checks (the FK also cascades).
  const inserted = (await sql`
    insert into referrals(referrer_id, invited_user_id, code)
    values(${referrerId}, ${userId}, ${code})
    on conflict (invited_user_id) do nothing
    returning id`) as { id: string | number }[];
  if (!inserted.length) throw new Error("This account has already been referred.");
  await sql`update profiles set rep = rep + ${REFERRER_REP} where user_id = ${referrerId}`;
  await sql`update profiles set rep = rep + ${INVITED_REP} where user_id = ${userId}`;
  const referrer = (await sql`select display_name from profiles where user_id = ${referrerId}`)[0] as Row | undefined;
  return { referrerName: String(referrer?.display_name ?? "A member"), repEarned: INVITED_REP };
}
