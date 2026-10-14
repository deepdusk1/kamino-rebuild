import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import { optionalAuth, type Viewer } from './optional-auth';
import { internals } from './server';
import { asBool, mapProfile } from './map';
import { isSiteAdmin, checkContent } from './safety.server';
import type { Sql } from '@/lib/db';

const { db, ensureProfile, blockedSet, assertAccountAllowed } = internals;
const access = z.enum(['everyone', 'following', 'none']);
function sessionDevice(value: unknown) {
  const agent = String(value ?? '');
  const platform = /iPhone|iPad|iPod/i.test(agent) ? 'iPhone or iPad' : /Android/i.test(agent) ? 'Android' : /Windows/i.test(agent) ? 'Windows' : /Macintosh|Mac OS X/i.test(agent) ? 'Mac' : /Linux/i.test(agent) ? 'Linux' : '';
  const browser = /Edg(?:e|A|iOS)?\//i.test(agent) ? 'Edge' : /Firefox|FxiOS/i.test(agent) ? 'Firefox' : /Chrome|Chromium|CriOS/i.test(agent) ? 'Chrome' : /Safari/i.test(agent) ? 'Safari' : '';
  return browser && platform ? `${browser} on ${platform}` : platform || browser || 'Other device';
}
export const getSignInCapabilities=createServerFn({method:'GET'}).handler(async()=>{
  const {configuredSocialProviders}=await import('@/lib/auth/mobile-oauth.server');
  const {phoneOtpConfigured}=await import('@/lib/auth/sms.server');
  return {...configuredSocialProviders(),phone:phoneOtpConfigured(),captchaSiteKey:process.env.TURNSTILE_SECRET_KEY?process.env.TURNSTILE_SITE_KEY??null:null};
});
export const beginMobileOAuth=createServerFn({method:'POST'}).validator((provider:'google'|'apple')=>z.enum(['google','apple']).parse(provider)).handler(async({data})=>{
  const {getRequest}=await import('@tanstack/react-start/server');
  const {assertSameSiteRequest}=await import('@/lib/auth/isolation.server');assertSameSiteRequest();
  const request=getRequest();if(!request)throw new Error('Request unavailable.');
  const {guard}=await import('./guard');await guard(`oauth:${request.headers.get('x-forwarded-for')??'local'}`,'invite');
  const origin=process.env.BETTER_AUTH_URL?.replace(/\/+$/,'')??new URL(request.url).origin;
  const {beginOAuth}=await import('@/lib/auth/mobile-oauth.server');return beginOAuth(data,origin);
});
export const finishMobileOAuth=createServerFn({method:'POST'}).validator((data:{flowId:string;verifier:string;callbackProof:string})=>z.object({flowId:z.string().min(20).max(100),verifier:z.string().min(30).max(100),callbackProof:z.string().min(30).max(100)}).parse(data)).handler(async({data})=>{
  const {assertSameSiteRequest}=await import('@/lib/auth/isolation.server');assertSameSiteRequest();
  const {exchangeOAuth}=await import('@/lib/auth/mobile-oauth.server');return exchangeOAuth(data.flowId,data.verifier,data.callbackProof);
});
const preferenceSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{2,29}$/, 'Use 3–30 letters, numbers, underscores or hyphens.').optional(),
  language: z.enum(['en','fr','es','de','pt','ja','ko','zh','hi','ar']).optional(),
  socialLinks: z.array(z.object({ label: z.string().trim().min(1).max(30), url: z.url().refine(value => /^https:\/\//.test(value), 'Use an HTTPS link.') })).max(6).optional(),
  profileHue: z.number().int().min(0).max(360).optional(),
  mentionPrivacy: access.optional(), invitePrivacy: access.optional(),
  searchVisible: z.boolean().optional(), hideFollowers: z.boolean().optional(), hideFollowing: z.boolean().optional(),
  restrictedMode: z.boolean().optional(), sensitiveContent: z.enum(['blur','hide','show']).optional(),
  highContrast: z.boolean().optional(), textScale: z.enum(['standard','large','largest']).optional(),
  tutorialComplete: z.boolean().optional(),
});

function preferences(row: Record<string, unknown>) {
  const parsed = JSON.parse(String(row.social_links ?? '[]')) as { label: string; url: string }[];
  return { handle: String(row.handle), language: String(row.language ?? 'en'), socialLinks: parsed,
    profileHue: Number(row.profile_hue ?? 250), mentionPrivacy: String(row.mention_privacy ?? 'everyone'), invitePrivacy: String(row.invite_privacy ?? 'everyone'),
    searchVisible: asBool(row.search_visible), hideFollowers: asBool(row.hide_followers), hideFollowing: asBool(row.hide_following),
    restrictedMode: asBool(row.restricted_mode), sensitiveContent: String(row.sensitive_content ?? 'blur'), highContrast: asBool(row.high_contrast),
    textScale: String(row.text_scale ?? 'standard'), tutorialComplete: Boolean(row.tutorial_completed_at) };
}

export async function assertInviteAllowed(sql: Sql, actor: string, target: string) {
  await assertAccountAllowed(sql, target);
  if ((await blockedSet(sql, actor)).has(target)) throw new Error('This person is unavailable.');
  const row = (await sql`select invite_privacy from profiles where user_id = ${target}`)[0];
  if (!row || row.invite_privacy === 'none') throw new Error('This person has invitations closed.');
  if (row.invite_privacy === 'following' && !(await sql`select 1 from profile_follows where follower_id = ${target} and followee_id = ${actor}`).length) throw new Error('This person accepts invitations only from people they follow.');
}

export const getIdentityDashboard = createServerFn({ method: 'GET' }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await db(); const { userId } = context;
  await ensureProfile(sql, { userId, email: null, name: null });
  const row = (await sql`select * from profiles where user_id = ${userId}`)[0]!;
  const account = (await sql`select email, "emailVerified", "twoFactorEnabled" from "user" where id = ${userId}`)[0];
  const rels = await sql`select r.kind, p.user_id, p.handle, p.display_name, p.avatar_hue from identity_relationships r join profiles p on p.user_id = r.target_user_id where r.user_id = ${userId} order by r.created_at desc`;
  const muted = await sql`select p.user_id, p.handle, p.display_name, p.avatar_hue from muted_people m join profiles p on p.user_id = m.muted_user_id where m.user_id = ${userId} order by p.display_name`;
  const sessions = await sql`select id, "createdAt", "updatedAt", "expiresAt", "userAgent" from "session" where "userId" = ${userId} and "expiresAt" > now() order by "updatedAt" desc`;
  const eligible = (value: unknown) => Boolean(value && new Date(String(value)).getTime() <= Date.now());
  return { preferences: preferences(row), email: String(account?.email ?? ''), emailVerified: asBool(account?.emailVerified), twoFactorEnabled: asBool(account?.twoFactorEnabled),
    ageChecked: Boolean(row.age_checked_at), ageBand: eligible(row.age_eligible_at_18) ? '18+' : eligible(row.age_eligible_at_16) ? '16–17' : '13–15',
    people: rels.map(r => ({ kind: String(r.kind), userId: String(r.user_id), handle: String(r.handle), name: String(r.display_name), hue: Number(r.avatar_hue) })),
    muted: muted.map(r => ({ userId: String(r.user_id), handle: String(r.handle), name: String(r.display_name), hue: Number(r.avatar_hue) })),
    sessions: sessions.map(r => ({ id: String(r.id), createdAt: new Date(String(r.createdAt)).toISOString(), lastActive: new Date(String(r.updatedAt)).toISOString(), expiresAt: new Date(String(r.expiresAt)).toISOString(), device: sessionDevice(r.userAgent) })),
    isAdmin: await isSiteAdmin(sql, userId), emailDeliveryConfigured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM), captchaConfigured: Boolean(process.env.TURNSTILE_SECRET_KEY),
  };
});

export const updateIdentityPreferences = createServerFn({ method: 'POST' }).middleware([authMiddleware]).validator((data: z.input<typeof preferenceSchema>) => preferenceSchema.parse(data)).handler(async ({ context, data }) => {
  const sql = await db(); const { userId } = context;
  await ensureProfile(sql, { userId, email: null, name: null });
  if (data.handle) {
    if (['admin','support','kamino','moderator','help','system'].includes(data.handle)) throw new Error('That username is reserved.');
    const occupied = await sql`select 1 from profiles where handle = ${data.handle} and user_id <> ${userId}`;
    if (occupied.length) throw new Error('That username is already taken.');
    const verdict = await checkContent({ text: data.handle });
    if (verdict.action === 'hold') throw new Error('Choose a different username.');
  }
  if (data.socialLinks) {
    const verdict = await checkContent({ text: data.socialLinks.map(link => `${link.label} ${link.url}`).join('\n') });
    if (verdict.action === 'hold') throw new Error('Those links cannot be used on your profile.');
  }
  const row = (await sql`select * from profiles where user_id = ${userId}`)[0]!;
  const cur = preferences(row); const adult = Boolean(row.age_eligible_at_18 && new Date(String(row.age_eligible_at_18)).getTime() <= Date.now());
  if (data.sensitiveContent === 'show' && !adult) throw new Error('Teen accounts keep sensitive content blurred or hidden.');
  await sql`update profiles set handle = ${data.handle ?? cur.handle}, language = ${data.language ?? cur.language}, social_links = ${JSON.stringify(data.socialLinks ?? cur.socialLinks)}, profile_hue = ${data.profileHue ?? cur.profileHue},
    mention_privacy = ${data.mentionPrivacy ?? cur.mentionPrivacy}, invite_privacy = ${data.invitePrivacy ?? cur.invitePrivacy}, search_visible = ${data.searchVisible ?? cur.searchVisible},
    hide_followers = ${data.hideFollowers ?? cur.hideFollowers}, hide_following = ${data.hideFollowing ?? cur.hideFollowing}, restricted_mode = ${data.restrictedMode ?? cur.restrictedMode},
    sensitive_content = ${data.sensitiveContent ?? cur.sensitiveContent}, high_contrast = ${data.highContrast ?? cur.highContrast}, text_scale = ${data.textScale ?? cur.textScale},
    tutorial_completed_at = case when ${data.tutorialComplete === true} then now() else tutorial_completed_at end where user_id = ${userId}`;
  return { ok: true };
});

export const setPersonRelationship = createServerFn({ method: 'POST' }).middleware([authMiddleware]).validator((data: { targetHandle: string; kind: 'restrict'|'close_friend'|'favorite'|'mute'; enabled: boolean }) => z.object({ targetHandle: z.string().trim().toLowerCase().transform(v => v.replace(/^@/, '')), kind: z.enum(['restrict','close_friend','favorite','mute']), enabled: z.boolean() }).parse(data)).handler(async ({ context, data }) => {
  const sql = await db(); const userId = context.userId;
  const target = (await sql`select user_id from profiles where handle = ${data.targetHandle}`)[0];
  if (!target || target.user_id === userId) throw new Error('Choose another member.');
  const targetId = String(target.user_id);
  if (data.kind === 'mute') {
    if (data.enabled) await sql`insert into muted_people(user_id, muted_user_id) values(${userId}, ${targetId}) on conflict do nothing`;
    else await sql`delete from muted_people where user_id = ${userId} and muted_user_id = ${targetId}`;
  } else {
    if (data.enabled) await sql`insert into identity_relationships(user_id,target_user_id,kind) values(${userId},${targetId},${data.kind}) on conflict do nothing`;
    else await sql`delete from identity_relationships where user_id = ${userId} and target_user_id = ${targetId} and kind = ${data.kind}`;
  }
  return { ok: true };
});

export const revokeIdentitySession = createServerFn({ method: 'POST' }).middleware([authMiddleware]).validator((id: string) => z.string().min(1).max(200).parse(id)).handler(async ({ context, data }) => {
  const sql = await db();
  await sql`delete from "session" where id = ${data} and "userId" = ${context.userId}`;
  return { ok: true };
});

/** User-entered addresses are matched transiently, never retained or exposed. Requires search visibility. */
export const findContacts = createServerFn({ method: 'POST' }).middleware([authMiddleware]).validator((emails: string[]) => z.array(z.email()).max(100).parse(emails)).handler(async ({ context, data }) => {
  const sql = await db(); const blocked = await blockedSet(sql, context.userId);
  const people = await sql`select p.* from profiles p join "user" u on u.id = p.user_id where lower(u.email) = any(${data.map(email => email.toLowerCase())}) and p.search_visible = true and p.user_id <> ${context.userId}
    and not exists(select 1 from identity_account_status s where s.user_id=p.user_id and(s.status='banned' or(s.status='suspended' and(s.until is null or s.until>now()))))`;
  return people.filter(p => !blocked.has(String(p.user_id))).map(p => ({ userId: String(p.user_id), handle: String(p.handle), name: String(p.display_name), hue: Number(p.avatar_hue) }));
});

export const getProfileIdentity = createServerFn({ method: 'GET' }).middleware([optionalAuth]).validator((handle: string) => z.string().max(30).parse(handle)).handler(async ({ context, data }) => {
  const sql = await db(); const viewer = (context as unknown as Viewer).userId;
  const row = (await sql`select * from profiles where handle = ${data}`)[0];
  if (!row) throw new Error('Profile not found.');
  const id = String(row.user_id); await assertAccountAllowed(sql,id);
  if ((await blockedSet(sql, viewer)).has(id)) throw new Error('Profile not found.');
  const follows = viewer ? (await sql`select 1 from profile_follows where follower_id = ${viewer} and followee_id = ${id}`).length > 0 : false;
  if (asBool(row.private_account) && id !== viewer && !follows) return { links: [], interests: [], profileHue: Number(row.profile_hue), mutuals: [], supporterBadges:[] as string[] };
  const mutuals = viewer ? await sql`select p.handle, p.display_name from profile_follows a join profile_follows b on a.followee_id = b.followee_id join profiles p on p.user_id = a.followee_id where a.follower_id = ${viewer} and b.follower_id = ${id} and p.private_account = false and p.search_visible = true limit 12` : [];
  const support=asBool(row.show_supporter_badges)?await sql`select distinct o.kind from billing_entitlements e join billing_orders o on o.id=e.order_id where e.beneficiary_id=${id} and e.state='active' and (e.expires_at is null or e.expires_at>now()) and o.kind in ('premium','membership','gift')`:[];
  const supporterBadges=support.map(r=>r.kind==='premium'?'Kamino+ (test)':r.kind==='gift'?'Gift supporter (test)':'Subscriber (test)');
  return { links: preferences(row).socialLinks, interests: mapProfile(row).interests, profileHue: Number(row.profile_hue), mutuals: mutuals.map(r => ({ handle: String(r.handle), name: String(r.display_name) })), supporterBadges };
});

export const adminListAccounts = createServerFn({ method: 'GET' }).middleware([authMiddleware]).validator((query: string = '') => z.string().max(100).parse(query)).handler(async ({ context, data }) => {
  const sql = await db(); if (!(await isSiteAdmin(sql, context.userId))) throw new Error('Administrator access required.');
  const term = `%${data.replace(/[%_]/g,'')}%`;
  const rows = await sql`select p.user_id,p.handle,p.display_name,u.email,u."emailVerified", coalesce(s.status,'active') as status,s.reason,s.until from profiles p left join "user" u on u.id = p.user_id left join identity_account_status s on s.user_id = p.user_id where p.handle ilike ${term} or p.display_name ilike ${term} order by p.created_at desc limit 100`;
  return rows.map(r => ({ userId: String(r.user_id), handle: String(r.handle), name: String(r.display_name), email: String(r.email ?? ''), emailVerified: asBool(r.emailVerified), status: String(r.status), reason: String(r.reason ?? ''), until: r.until ? new Date(String(r.until)).toISOString() : null }));
});

export const adminSetAccountStatus = createServerFn({ method: 'POST' }).middleware([authMiddleware]).validator((data: { userId: string; status: 'active'|'suspended'|'banned'; reason: string; days?: number }) => z.object({ userId: z.string().min(1), status: z.enum(['active','suspended','banned']), reason: z.string().trim().min(5).max(500), days: z.number().int().min(1).max(365).optional() }).parse(data)).handler(async ({ context, data }) => {
  const sql = await db(); if (!(await isSiteAdmin(sql, context.userId))) throw new Error('Administrator access required.');
  if (data.userId === context.userId) throw new Error('Another administrator must change your account status.');
  const until = data.status === 'suspended' ? new Date(Date.now() + (data.days ?? 7) * 86400000).toISOString() : null;
  await sql`insert into identity_account_status(user_id,status,reason,until,actor_id) values(${data.userId},${data.status},${data.reason},${until},${context.userId}) on conflict(user_id) do update set status=excluded.status,reason=excluded.reason,until=excluded.until,actor_id=excluded.actor_id,updated_at=now()`;
  await sql`insert into identity_audit(actor_id,target_user_id,action,detail) values(${context.userId},${data.userId},${data.status},${data.reason})`;
  if (data.status !== 'active') await sql`delete from "session" where "userId" = ${data.userId}`;
  return { ok: true };
});
