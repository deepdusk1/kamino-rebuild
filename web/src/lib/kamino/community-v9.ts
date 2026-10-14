import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { authMiddleware } from '@/lib/auth/middleware';
import { internals } from './server';
import { optionalAuth, type Viewer } from './optional-auth';
import { canLead, canModerate, scanText } from './safety';
import { asBool, iso, mapHallEvent, parseJson } from './map';
import { guard } from './guard';
import { paidResourceAccessSql } from './billing-policy';
import { assertPaidResourceAccess } from './billing.server';
import { shiftedSeriesTime, validTimeZone, zonedOccurrences } from './event-time-v10';
import { COMMUNITY_PERMISSIONS, EARNED_COSMETICS, calendarEvent, communityLevel, eventOccurrences, validatedWebUrl, type CommunityPermission } from './community-v9-rules';

type Authed = {userId:string};
type Row = Record<string,unknown>;
const slugSchema = z.string().trim().min(1).max(100);
const idSchema = z.number().int().positive();
const { db, requireActiveMember, membershipOf, notify } = internals;
function cleanText(value:string,max:number) { const text=value.trim().slice(0,max); if(text){const error=scanText(text);if(error)throw new Error(error);}return text; }
async function audit(sql:Sql,slug:string,uid:string,action:string,detail:string) { await sql`insert into audit_log(community_id,actor_id,action,detail) values(${slug},${uid},${action},${detail.slice(0,300)})`; }
async function readable(sql:Sql,uid:string|null,slug:string) {
  await internals.assertCommunityReadable(sql,uid,slug);
  return internals.requireCommunity(sql,slug);
}
async function moderator(sql:Sql,uid:string,slug:string,leader=false) {
  const member=await requireActiveMember(sql,uid,slug);
  if(leader?!canLead(member.role):!canModerate(member.role)) throw new Error(leader?'Only community leaders can do that.':'Only community moderators can do that.');
  return member;
}
export async function hasCommunityPermission(sql:Sql,uid:string,slug:string,permission:CommunityPermission) {
  const member=await requireActiveMember(sql,uid,slug);
  if(canLead(member.role))return true;
  if(canModerate(member.role)&&permission!=='trusted')return true;
  const rows=await sql`select r.permissions from community_role_assignments a join community_role_definitions r on r.id=a.role_id and r.community_id=a.community_id where a.community_id=${slug} and a.user_id=${uid}`;
  return rows.some(r=>parseJson<string[]>(r.permissions,[]).includes(permission));
}
export async function enforceCommunityPolicy(sql:Sql,uid:string,slug:string,kind:'post'|'live'|'event',text='') {
  const member=await requireActiveMember(sql,uid,slug);
  const row=(await sql`select post_policy,live_policy,event_policy,keyword_filters from communities where id=${slug}`)[0];
  const policy=String(row?.[`${kind}_policy`]??'members');
  if(policy==='moderators'&&!canModerate(member.role)&&!await hasCommunityPermission(sql,uid,slug,kind==='event'?'events':kind)) throw new Error('Community leaders limited who can create this here.');
  if(policy==='trusted'&&!canModerate(member.role)&&!await hasCommunityPermission(sql,uid,slug,'trusted')) throw new Error('This community allows trusted members to create this.');
  if(text&&!canModerate(member.role)){
    const normalized=text.normalize('NFKC').toLocaleLowerCase();
    const blocked=parseJson<string[]>(row?.keyword_filters,[]).find(word=>normalized.includes(word.normalize('NFKC').toLocaleLowerCase()));
    if(blocked)throw new Error('Your text contains a phrase blocked by this community. Please revise it.');
  }
}

export const getCommunityTools = createServerFn({method:'GET'}).middleware([optionalAuth]).validator((slug:string)=>slugSchema.parse(slug)).handler(async({context,data:slug})=>{
  const sql=await db(), uid=(context as unknown as Viewer).userId;
  const community=await readable(sql,uid,slug), member=await membershipOf(sql,uid,slug);
  const isModerator=member?.status==='active'&&canModerate(member.role);
  const [settings,faqs,boards,roles,assignments,badges,rank,verification]=await Promise.all([
    sql`select language,local_area,member_limit,join_policy,post_policy,live_policy,event_policy,keyword_filters,verification_requested_at from communities where id=${slug}`,
    sql`select id,question,answer from community_faqs where community_id=${slug} order by sort_order,id`,
    sql.query(`select b.id,b.name,b.description,(select count(*)::int from community_board_threads t join posts p on p.id=t.post_id where t.board_id=b.id and p.hidden=false and (p.expires_at is null or p.expires_at>now()) and ${internals.visiblePosts('$2')}) as thread_count from community_boards b where b.community_id=$1 order by b.id`,[slug,uid??'']),
    sql`select id,label,color,permissions from community_role_definitions where community_id=${slug} order by id`,
    sql`select a.user_id,a.role_id,m.nickname from community_role_assignments a join memberships m on m.user_id=a.user_id and m.community_id=a.community_id and m.status='active' where a.community_id=${slug}`,
    sql`select g.id,g.user_id,g.badge,g.note,m.nickname from community_badge_grants g join memberships m on m.user_id=g.user_id and m.community_id=g.community_id and m.status='active' where g.community_id=${slug} order by g.created_at desc limit 50`,
    sql`select coalesce(sum(rep),0)::int as rep from memberships where community_id=${slug} and status='active'`,
    isModerator?sql`select id,status from verification_requests where target_type='community' and target_id=${slug} order by id desc limit 1`:Promise.resolve([]),
  ]);
  const row=settings[0]!, reputation=Number(rank[0]?.rep??0);
  const permissions:CommunityPermission[]=uid&&member?.status==='active'?(await Promise.all(COMMUNITY_PERMISSIONS.map(async p=>await hasCommunityPermission(sql,uid,slug,p)?p:null))).filter((p):p is CommunityPermission=>p!==null):[];
  return {
    community,member,isModerator,permissions,level:communityLevel(reputation),reputation,
    settings:{language:String(row.language||'en'),localArea:String(row.local_area??''),memberLimit:row.member_limit?Number(row.member_limit):null,joinPolicy:String(row.join_policy),postPolicy:String(row.post_policy),livePolicy:String(row.live_policy),eventPolicy:String(row.event_policy),keywordFilters:isModerator?parseJson<string[]>(row.keyword_filters,[]):[],verificationRequestedAt:row.verification_requested_at?iso(row.verification_requested_at):null,verificationStatus:verification[0]?String(verification[0].status):null},
    faqs:faqs.map(r=>({id:Number(r.id),question:String(r.question),answer:String(r.answer)})),
    boards:boards.map(r=>({id:Number(r.id),name:String(r.name),description:String(r.description),threadCount:Number(r.thread_count)})),
    roles:roles.map(r=>({id:Number(r.id),label:String(r.label),color:String(r.color),permissions:parseJson<CommunityPermission[]>(r.permissions,[])})),
    assignments:assignments.map(r=>({userId:String(r.user_id),roleId:Number(r.role_id),nickname:String(r.nickname)})),
    badges:badges.map(r=>({id:Number(r.id),userId:String(r.user_id),badge:String(r.badge),note:String(r.note),nickname:String(r.nickname)})),
  };
});

const policySchema=z.object({slug:slugSchema,language:z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),localArea:z.string().trim().max(150).default(''),memberLimit:z.number().int().min(10).max(50).nullable().default(null),joinPolicy:z.enum(['open','approval','invite']),postPolicy:z.enum(['members','trusted','moderators']),livePolicy:z.enum(['members','trusted','moderators']),eventPolicy:z.enum(['members','trusted','moderators']),keywordFilters:z.array(z.string().trim().min(2).max(80)).max(100)});
export const saveCommunityPolicies=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof policySchema>)=>policySchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await moderator(sql,uid,data.slug,true);
  const count=(await sql`select member_count from communities where id=${data.slug}`)[0];if(data.memberLimit&&Number(count?.member_count)>data.memberLimit)throw new Error('Choose a limit large enough for the current members.');
  await sql`update communities set language=${data.language},local_area=${data.localArea},member_limit=${data.memberLimit},join_policy=${data.joinPolicy},post_policy=${data.postPolicy},live_policy=${data.livePolicy},event_policy=${data.eventPolicy},keyword_filters=${JSON.stringify([...new Set(data.keywordFilters)])} where id=${data.slug}`;
  await audit(sql,data.slug,uid,'community:permissions',`${data.joinPolicy}; ${data.postPolicy}; ${data.livePolicy}; ${data.eventPolicy}`);return {ok:true};
});

const faqSchema=z.object({slug:slugSchema,id:idSchema.optional(),question:z.string().trim().min(3).max(200),answer:z.string().trim().min(3).max(4000)});
export const saveCommunityFaq=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof faqSchema>)=>faqSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;if(!await hasCommunityPermission(sql,uid,data.slug,'manage_faq'))throw new Error('Leaders or FAQ editors can change answers.');
  const question=cleanText(data.question,200),answer=cleanText(data.answer,4000);
  if(data.id){const rows=await sql`update community_faqs set question=${question},answer=${answer},updated_by=${uid},updated_at=now() where id=${data.id} and community_id=${data.slug} returning id`;if(!rows.length)throw new Error('Answer not found.');return {id:Number(rows[0].id)};}
  const rows=await sql`insert into community_faqs(community_id,question,answer,updated_by) values(${data.slug},${question},${answer},${uid}) returning id`;return {id:Number(rows[0].id)};
});
const scopedId=z.object({slug:slugSchema,id:idSchema});
export const deleteCommunityFaq=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof scopedId>)=>scopedId.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;if(!await hasCommunityPermission(sql,uid,data.slug,'manage_faq'))throw new Error('Leaders or FAQ editors can change answers.');
  await sql`delete from community_faqs where id=${data.id} and community_id=${data.slug}`;return {ok:true};
});
const boardSchema=z.object({slug:slugSchema,id:idSchema.optional(),name:z.string().trim().min(2).max(60),description:z.string().max(500).default('')});
export const saveCommunityBoard=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof boardSchema>)=>boardSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;if(!await hasCommunityPermission(sql,uid,data.slug,'manage_boards'))throw new Error('Leaders or board editors can change boards.');
  const name=cleanText(data.name,60),description=cleanText(data.description,500);
  const rows=data.id?await sql`update community_boards set name=${name},description=${description} where id=${data.id} and community_id=${data.slug} returning id`:await sql`insert into community_boards(community_id,name,description,created_by) values(${data.slug},${name},${description},${uid}) returning id`;
  if(!rows.length)throw new Error('Board not found.');return {id:Number(rows[0].id)};
});
export const deleteCommunityBoard=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof scopedId>)=>scopedId.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;if(!await hasCommunityPermission(sql,uid,data.slug,'manage_boards'))throw new Error('Leaders or board editors can change boards.');
  await sql`delete from community_boards where id=${data.id} and community_id=${data.slug}`;return {ok:true};
});
const threadSchema=z.object({slug:slugSchema,boardId:idSchema,postId:idSchema,remove:z.boolean().default(false)});
export const assignPostBoard=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof threadSchema>)=>threadSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;const member=await requireActiveMember(sql,uid,data.slug);
  const post=await internals.requirePostAccess(sql,uid,data.postId);
  if(String(post.community_id)!==data.slug)throw new Error('Choose a post from this community.');
  if(post.author_user_id!==uid&&!canModerate(member.role)&&!await hasCommunityPermission(sql,uid,data.slug,'manage_boards'))throw new Error('You can move your own posts.');
  const board=(await sql`select id from community_boards where id=${data.boardId} and community_id=${data.slug}`)[0];if(!board)throw new Error('Board not found.');
  if(data.remove)await sql`delete from community_board_threads where board_id=${data.boardId} and post_id=${data.postId}`;
  else await sql`insert into community_board_threads(board_id,post_id) values(${data.boardId},${data.postId}) on conflict do nothing`;
  return {ok:true};
});
const boardReadSchema=z.object({slug:slugSchema,boardId:idSchema});
export const getBoardThreads=createServerFn({method:'GET'}).middleware([optionalAuth]).validator((d:z.infer<typeof boardReadSchema>)=>boardReadSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as unknown as Viewer).userId;await readable(sql,uid,data.slug);
  const board=(await sql`select id,name,description from community_boards where id=${data.boardId} and community_id=${data.slug}`)[0];if(!board)throw new Error('Board not found.');
  const hidden=await internals.blockedSet(sql,uid),muted=await internals.mutedSet(sql,uid);
  const threads=await sql.query(`select p.id,p.title,p.body,p.type,p.comment_count,p.created_at,p.author_user_id,m.nickname from community_board_threads t join posts p on p.id=t.post_id left join memberships m on m.user_id=p.author_user_id and m.community_id=p.community_id where t.board_id=$1 and p.community_id=$2 and p.hidden=false and (p.expires_at is null or p.expires_at>now()) and ${internals.visiblePosts('$3')} order by p.created_at desc limit 100`,[data.boardId,data.slug,uid??'']);
  return {board:{id:Number(board.id),name:String(board.name),description:String(board.description)},threads:threads.filter(r=>!hidden.has(String(r.author_user_id))&&!muted.has(String(r.author_user_id))).map(r=>({id:Number(r.id),title:String(r.title),excerpt:String(r.body).slice(0,200),type:String(r.type),comments:Number(r.comment_count),nickname:String(r.nickname??'Member'),createdAt:iso(r.created_at)}))};
});
export const getBoardAssignablePosts=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((slug:string)=>slugSchema.parse(slug)).handler(async({context,data:slug})=>{
  const sql=await db(),uid=(context as Authed).userId,member=await requireActiveMember(sql,uid,slug);
  const rows=await sql`select id,title from posts where community_id=${slug} and hidden=false and (author_user_id=${uid} or ${canModerate(member.role)}) and type not in('story','wiki') and (publish_at is null or publish_at<=now()) order by id desc limit 60`;
  return rows.map(r=>({id:Number(r.id),title:String(r.title)}));
});

const roleSchema=z.object({slug:slugSchema,id:idSchema.optional(),label:z.string().trim().min(2).max(40),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),permissions:z.array(z.enum(COMMUNITY_PERMISSIONS)).max(7)});
export const saveCommunityRole=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof roleSchema>)=>roleSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await moderator(sql,uid,data.slug,true);const label=cleanText(data.label,40);
  const rows=data.id?await sql`update community_role_definitions set label=${label},color=${data.color},permissions=${JSON.stringify(data.permissions)} where id=${data.id} and community_id=${data.slug} returning id`:await sql`insert into community_role_definitions(community_id,label,color,permissions) values(${data.slug},${label},${data.color},${JSON.stringify(data.permissions)}) returning id`;
  if(!rows.length)throw new Error('Role not found.');await audit(sql,data.slug,uid,'role:save',label);return {id:Number(rows[0].id)};
});
export const deleteCommunityRole=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof scopedId>)=>scopedId.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await moderator(sql,uid,data.slug,true);await sql`delete from community_role_definitions where community_id=${data.slug} and id=${data.id}`;await audit(sql,data.slug,uid,'role:delete',String(data.id));return {ok:true};
});
const grantRoleSchema=z.object({slug:slugSchema,userId:z.string().min(1),roleId:idSchema,remove:z.boolean().default(false)});
export const assignCommunityRole=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof grantRoleSchema>)=>grantRoleSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await moderator(sql,uid,data.slug,true);await requireActiveMember(sql,data.userId,data.slug);
  if(!(await sql`select id from community_role_definitions where id=${data.roleId} and community_id=${data.slug}`).length)throw new Error('Role not found.');
  if(data.remove)await sql`delete from community_role_assignments where community_id=${data.slug} and user_id=${data.userId} and role_id=${data.roleId}`;
  else await sql`insert into community_role_assignments(community_id,user_id,role_id,granted_by) values(${data.slug},${data.userId},${data.roleId},${uid}) on conflict do nothing`;
  await audit(sql,data.slug,uid,data.remove?'role:revoke':'role:grant',`${data.userId}; ${data.roleId}`);return {ok:true};
});
const leadershipSchema=z.object({slug:slugSchema,userId:z.string().min(1),role:z.enum(['leader','curator','member'])});
export const appointCommunityLeader=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof leadershipSchema>)=>leadershipSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;const me=await moderator(sql,uid,data.slug,true),target=await requireActiveMember(sql,data.userId,data.slug);
  if(uid===data.userId||target.role==='agent')throw new Error('The community owner cannot be changed here.');
  if((target.role==='leader'||data.role==='leader')&&me.role!=='agent')throw new Error('Only the community owner appoints co-leaders.');
  await sql`update memberships set role=${data.role} where user_id=${data.userId} and community_id=${data.slug} and status='active'`;
  await audit(sql,data.slug,uid,'member:role',`${data.userId}; ${data.role}`);return {ok:true};
});

export const getCommunityModerationDetails=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((slug:string)=>slugSchema.parse(slug)).handler(async({context,data:slug})=>{
  const sql=await db(),uid=(context as Authed).userId;const member=await moderator(sql,uid,slug);
  const [banned,mutes,auditRows,appeals,members]=await Promise.all([
    sql`select m.user_id,m.nickname,m.role,m.joined_at,p.handle from memberships m left join profiles p on p.user_id=m.user_id where m.community_id=${slug} and m.status='banned' order by m.nickname`,
    sql`select mm.id,mm.user_id,m.nickname,mm.reason,mm.until from member_mutes mm join memberships m on m.user_id=mm.user_id and m.community_id=mm.community_id where mm.community_id=${slug} and mm.cleared=false and mm.until>now() order by mm.until`,
    sql`select a.id,a.action,a.detail,a.created_at,p.display_name from audit_log a left join profiles p on p.user_id=a.actor_id where a.community_id=${slug} order by a.id desc limit 100`,
    sql`select a.*,m.nickname from appeals a left join memberships m on m.user_id=a.user_id and m.community_id=a.community_id where a.community_id=${slug} order by a.created_at desc limit 100`,
    sql`select user_id,nickname,role from memberships where community_id=${slug} and status='active' order by nickname limit 500`,
  ]);
  return {role:member.role,banned:banned.map(r=>({userId:String(r.user_id),nickname:String(r.nickname),handle:String(r.handle??'')})),mutes:mutes.map(r=>({id:Number(r.id),userId:String(r.user_id),nickname:String(r.nickname),reason:String(r.reason),until:iso(r.until)})),audit:auditRows.map(r=>({id:Number(r.id),action:String(r.action),detail:String(r.detail),actor:String(r.display_name??'Moderator'),createdAt:iso(r.created_at)})),appeals:appeals.map(r=>({id:Number(r.id),userId:String(r.user_id),nickname:String(r.nickname??'Member'),kind:String(r.kind),message:String(r.message),status:String(r.status),decisionNote:String(r.decision_note)})),members:members.map(r=>({userId:String(r.user_id),nickname:String(r.nickname),role:String(r.role)}))};
});

export const getCommunityAnalytics=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((slug:string)=>slugSchema.parse(slug)).handler(async({context,data:slug})=>{
  const sql=await db(),uid=(context as Authed).userId;await moderator(sql,uid,slug);
  const activity=`select author_user_id as user_id,created_at from posts where community_id=$1 and hidden=false and (publish_at is null or publish_at<=now()) union all select c.author_user_id,c.created_at from comments c join posts p on p.id=c.post_id where p.community_id=$1 and p.hidden=false and c.held=false union all select m.author_user_id,m.created_at from messages m join chat_rooms r on r.id=m.room_id where r.community_id=$1 and m.deleted=false and m.held=false union all select user_id,day::timestamptz from community_checkin_days where community_id=$1`;
  const [counts,growth,active,retention,top]=await Promise.all([
    sql`select count(*) filter(where status='active')::int as members,count(*) filter(where status='active' and joined_at>now()-interval '30 days')::int as new_members from memberships where community_id=${slug}`,
    sql`select to_char(joined_at,'YYYY-MM-DD') as day,count(*)::int as count from memberships where community_id=${slug} and joined_at>now()-interval '30 days' group by day order by day`,
    sql.query(`with activity as (${activity}) select count(distinct user_id) filter(where created_at>now()-interval '1 day')::int as daily,count(distinct user_id) filter(where created_at>now()-interval '7 days')::int as weekly,count(distinct user_id) filter(where created_at>now()-interval '30 days')::int as monthly from activity a where exists(select 1 from memberships m where m.community_id=$1 and m.user_id=a.user_id and m.status='active')`,[slug]),
    sql.query(`with activity as (${activity}),previous as(select distinct user_id from activity where created_at between now()-interval '60 days' and now()-interval '30 days'),current_active as(select distinct user_id from activity where created_at>now()-interval '30 days') select (select count(*)::int from previous) as previous,(select count(*)::int from previous p join current_active c using(user_id)) as retained`,[slug]),
    sql`select p.id,p.title,p.like_count,p.comment_count,m.nickname from posts p left join memberships m on m.user_id=p.author_user_id and m.community_id=p.community_id where p.community_id=${slug} and p.hidden=false and p.created_at>now()-interval '30 days' and (p.publish_at is null or p.publish_at<=now()) order by (p.like_count*3+p.comment_count*4) desc,p.id desc limit 10`,
  ]);
  const previous=Number(retention[0]?.previous??0),retained=Number(retention[0]?.retained??0);
  return {members:Number(counts[0]?.members??0),newMembers30:Number(counts[0]?.new_members??0),dailyActive:Number(active[0]?.daily??0),weeklyActive:Number(active[0]?.weekly??0),monthlyActive:Number(active[0]?.monthly??0),retentionPercent:previous?Math.round(retained/previous*100):null,retentionPrevious:previous,retentionRetained:retained,growth:growth.map(r=>({day:String(r.day),count:Number(r.count)})),topContent:top.map(r=>({id:Number(r.id),title:String(r.title),nickname:String(r.nickname??'Member'),likes:Number(r.like_count),comments:Number(r.comment_count)})),definition:'Active means posted, commented, chatted or checked in. Retention compares active people in the previous 30 days with those active in the latest 30 days.'};
});

const verificationSchema=z.object({slug:slugSchema,reason:z.string().trim().min(10).max(1500)});
export const requestCommunityVerification=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof verificationSchema>)=>verificationSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await moderator(sql,uid,data.slug,true);await guard(uid,'report');
  const reason=cleanText(data.reason,1500);
  const existing=await sql`select id from verification_requests where target_type='community' and target_id=${data.slug} and status='pending'`;
  if(existing.length)return {ok:true,already:true};
  await sql`insert into verification_requests(target_type,target_id,requested_by,reason) values('community',${data.slug},${uid},${reason})`;
  await sql`update communities set verification_requested_at=now() where id=${data.slug}`;await audit(sql,data.slug,uid,'community:verification',reason);return {ok:true,already:false};
});
const communityReportSchema=z.object({slug:slugSchema,reason:z.string().trim().min(3).max(100),details:z.string().max(1500).default('')});
export const reportCommunityV9=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof communityReportSchema>)=>communityReportSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await internals.requireMinAge(sql,uid);await internals.assertCommunityReadable(sql,uid,data.slug);await guard(uid,'report');
  await sql`insert into reports(reporter_id,community_id,target_type,target_id,reason,details) values(${uid},${data.slug},'community',${data.slug},${data.reason},${data.details})`;return {ok:true};
});
export const getCommunityInviteDetails=createServerFn({method:'GET'}).middleware([optionalAuth]).validator((code:string)=>z.string().trim().min(6).max(100).parse(code)).handler(async({context,data:code})=>{
  const sql=await db(),uid=(context as unknown as Viewer).userId;
  const row=(await sql`select i.community_id,c.name,c.tagline,c.age_gate,((i.expires_at is null or i.expires_at>now()) and (i.max_uses=0 or i.uses<i.max_uses)) as available from invite_codes i join communities c on c.id=i.community_id where i.code=${code.toLowerCase()}`)[0];if(!row)throw new Error('This invite expired or is no longer available. Ask the community leader for a new link.');
  const member=await membershipOf(sql,uid,String(row.community_id));if(member?.status==='banned')throw new Error('You cannot use this invite.');
  if(!asBool(row.available)&&member?.status!=='active')throw new Error('This invite expired or is no longer available. Ask the community leader for a new link.');
  return {slug:String(row.community_id),name:String(row.name),tagline:String(row.tagline),ageGate:Number(row.age_gate),joined:member?.status==='active'};
});
const invitePersonSchema=z.object({slug:slugSchema,handle:z.string().trim().min(2).max(40)});
export const inviteCommunityPerson=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof invitePersonSchema>)=>invitePersonSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await requireActiveMember(sql,uid,data.slug);await guard(uid,'invite');const community=await internals.requireCommunity(sql,data.slug);
  const target=(await sql`select user_id,age_eligible_at_16,age_eligible_at_18,restricted_mode from profiles where lower(handle)=${data.handle.replace(/^@/,'').toLowerCase()} and search_visible=true`)[0];if(!target||target.user_id===uid)throw new Error('Choose another member by their @username.');
  const targetId=String(target.user_id);await internals.requireMinAge(sql,targetId);const {assertInviteAllowed}=await import('./identity-v9');await assertInviteAllowed(sql,uid,targetId);
  const age=community.ageGate>=18?target.age_eligible_at_18:target.age_eligible_at_16;if(community.ageGate>=16&&(!age||new Date(String(age)).getTime()>Date.now()||asBool(target.restricted_mode)))throw new Error('This person is not eligible to join this community.');
  const membership=await membershipOf(sql,targetId,data.slug);if(membership?.status==='active')throw new Error('This person is already a member.');if(membership?.status==='banned')throw new Error('This person cannot join this community.');
  const policy=(await sql`select join_policy from communities where id=${data.slug}`)[0];if((community.visibility==='private'||policy?.join_policy==='invite')&&!await hasCommunityPermission(sql,uid,data.slug,'invite'))throw new Error('Only leaders or members with invite permission can invite people here.');
  if((await sql`select 1 from notifications where user_id=${targetId} and kind='invite' and target_type='community' and target_id=${data.slug} and created_at>now()-interval '1 day'`).length)return {ok:true,already:true};
  const code=crypto.randomUUID().replaceAll('-','');await sql`insert into invite_codes(code,community_id,created_by,max_uses,expires_at) values(${code},${data.slug},${uid},1,now()+interval '7 days')`;
  await notify(sql,targetId,'invite','Community invitation',`Join ${community.name}`,`/invite/${code}`,{actorId:uid,targetType:'community',targetId:data.slug});return {ok:true,already:false};
});

const questSchema=z.object({slug:slugSchema,id:idSchema.optional(),title:z.string().trim().min(3).max(100),description:z.string().max(1000).default(''),kind:z.enum(['quest','weekly','seasonal','milestone']).default('quest'),metric:z.enum(['posts','comments','likes_received','checkins']),target:z.number().int().min(1).max(1000),badge:z.string().trim().min(2).max(60),rewardCosmetic:z.enum(['',...EARNED_COSMETICS]).default(''),startsAt:z.string(),endsAt:z.string().optional()});
export const saveCommunityQuest=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof questSchema>)=>questSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await moderator(sql,uid,data.slug,true);const dates=eventOccurrences(data.startsAt,data.endsAt,'none')[0]!;
  const title=cleanText(data.title,100),description=cleanText(data.description,1000),badge=cleanText(data.badge,60);
  if(data.id){
    if((await sql`select 1 from community_quest_claims where quest_id=${data.id}`).length)throw new Error('A claimed quest keeps its rules. Create a new quest instead.');
    const row=await sql`update community_quests set title=${title},description=${description},kind=${data.kind},metric=${data.metric},target=${data.target},badge=${badge},reward_cosmetic=${data.rewardCosmetic},starts_at=${dates.startsAt},ends_at=${dates.endsAt} where id=${data.id} and community_id=${data.slug} returning id`;if(!row.length)throw new Error('Quest not found.');return {id:Number(row[0].id)};
  }
  const rows=await sql`insert into community_quests(community_id,title,description,kind,metric,target,badge,reward_cosmetic,starts_at,ends_at,created_by) values(${data.slug},${title},${description},${data.kind},${data.metric},${data.target},${badge},${data.rewardCosmetic},${dates.startsAt},${dates.endsAt},${uid}) returning id`;await audit(sql,data.slug,uid,'quest:create',title);return {id:Number(rows[0].id)};
});
async function questProgress(sql:Sql,uid:string,quest:Row) {
  const slug=String(quest.community_id),starts=iso(quest.starts_at),ends=quest.ends_at?iso(quest.ends_at):new Date().toISOString();
  let rows:Row[]=[];
  if(quest.metric==='posts')rows=await sql`select count(*)::int as progress from posts where community_id=${slug} and author_user_id=${uid} and hidden=false and created_at between ${starts}::timestamptz and ${ends}::timestamptz and (publish_at is null or publish_at<=now())`;
  if(quest.metric==='comments')rows=await sql`select count(*)::int as progress from comments c join posts p on p.id=c.post_id where p.community_id=${slug} and c.author_user_id=${uid} and p.hidden=false and c.held=false and c.created_at between ${starts}::timestamptz and ${ends}::timestamptz`;
  if(quest.metric==='likes_received')rows=await sql`select count(*)::int as progress from likes l join posts p on p.id=l.post_id where p.community_id=${slug} and p.author_user_id=${uid} and l.user_id<>${uid} and p.hidden=false and l.created_at between ${starts}::timestamptz and ${ends}::timestamptz`;
  if(quest.metric==='checkins')rows=await sql`select count(*)::int as progress from community_checkin_days where community_id=${slug} and user_id=${uid} and day between (${starts}::timestamptz at time zone 'UTC')::date and (${ends}::timestamptz at time zone 'UTC')::date`;
  return Number(rows[0]?.progress??0);
}
export const getCommunityQuests=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((slug:string)=>slugSchema.parse(slug)).handler(async({context,data:slug})=>{
  const sql=await db(),uid=(context as Authed).userId;await requireActiveMember(sql,uid,slug);
  const rows=await sql`select q.*,c.claimed_at from community_quests q left join community_quest_claims c on c.quest_id=q.id and c.user_id=${uid} where q.community_id=${slug} order by q.starts_at desc limit 60`;
  return Promise.all(rows.map(async r=>({id:Number(r.id),title:String(r.title),description:String(r.description),kind:String(r.kind),metric:String(r.metric),target:Number(r.target),badge:String(r.badge),rewardCosmetic:String(r.reward_cosmetic),startsAt:iso(r.starts_at),endsAt:r.ends_at?iso(r.ends_at):null,claimedAt:r.claimed_at?iso(r.claimed_at):null,progress:await questProgress(sql,uid,r)})));
});
export const claimCommunityQuest=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof scopedId>)=>scopedId.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await requireActiveMember(sql,uid,data.slug);
  const quest=(await sql`select * from community_quests where id=${data.id} and community_id=${data.slug}`)[0];if(!quest)throw new Error('Quest not found.');
  if(new Date(iso(quest.starts_at)).getTime()>Date.now())throw new Error('This quest has not started yet.');
  const progress=await questProgress(sql,uid,quest);if(progress<Number(quest.target))throw new Error('Keep going! You have not reached this quest’s goal yet.');
  // A claim and its rewards commit together, including when two devices claim at once.
  const claimed=await sql`with claim as (
    insert into community_quest_claims(quest_id,user_id,progress) values(${data.id},${uid},${progress}) on conflict do nothing returning quest_id
  ), badges as (
    insert into community_badge_grants(community_id,user_id,badge,note,granted_by)
    select ${data.slug},${uid},${String(quest.badge)},${String(quest.title)},${String(quest.created_by)} from claim on conflict do nothing returning id
  ), cosmetics as (
    insert into earned_cosmetics(user_id,cosmetic,source)
    select ${uid},${String(quest.reward_cosmetic)},${`quest:${data.id}`} from claim where ${String(quest.reward_cosmetic)}<>'' on conflict do nothing returning cosmetic
  ) select count(*)::int as added from claim`;
  if(!Number(claimed[0]?.added))return {ok:true,already:true};
  await notify(sql,uid,'achievement','Quest complete',`${String(quest.badge)} earned`, `/c/${data.slug}/tools`);return {ok:true,already:false};
});
const badgeSchema=z.object({slug:slugSchema,userId:z.string().min(1),badge:z.enum(['Helpful member','Kindness','Community star']),note:z.string().trim().min(3).max(300)});
export const grantCommunityBadge=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof badgeSchema>)=>badgeSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await moderator(sql,uid,data.slug);await requireActiveMember(sql,data.userId,data.slug);const note=cleanText(data.note,300);
  await sql`insert into community_badge_grants(community_id,user_id,badge,note,granted_by) values(${data.slug},${data.userId},${data.badge},${note},${uid}) on conflict(community_id,user_id,badge) do update set note=excluded.note,granted_by=excluded.granted_by`;
  await audit(sql,data.slug,uid,'badge:grant',`${data.userId}; ${data.badge}`);await notify(sql,data.userId,'achievement',data.badge,note,`/c/${data.slug}/tools`);return {ok:true};
});
export const getEarnedCosmetics=createServerFn({method:'GET'}).middleware([authMiddleware]).handler(async({context})=>{
  const sql=await db(),uid=(context as Authed).userId;await internals.requireMinAge(sql,uid);return(await sql`select cosmetic,source,earned_at from earned_cosmetics where user_id=${uid} order by earned_at desc`).map(r=>({cosmetic:z.enum(EARNED_COSMETICS).parse(r.cosmetic),source:String(r.source),earnedAt:iso(r.earned_at)}));
});
const cosmeticSchema=z.object({cosmetic:z.enum(EARNED_COSMETICS)});
export const equipEarnedCosmetic=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof cosmeticSchema>)=>cosmeticSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await internals.requireMinAge(sql,uid);
  if(!(await sql`select 1 from earned_cosmetics where user_id=${uid} and cosmetic=${data.cosmetic}`).length)throw new Error('Earn this colour in a community quest first.');
  const hues={aurora:285,sunrise:28,ocean:205,forest:145};await sql`update profiles set bubble_hue=${hues[data.cosmetic]} where user_id=${uid}`;return {ok:true};
});

const expandedEventSchema=z.object({slug:slugSchema,id:idSchema.optional(),title:z.string().trim().min(3).max(120),body:z.string().max(3000).default(''),kind:z.enum(['event','challenge']).default('event'),startsAt:z.string(),endsAt:z.string().optional(),venueKind:z.enum(['online','in_person']).default('online'),onlineUrl:z.string().max(1200).default(''),location:z.string().max(300).default(''),imageUrl:z.string().max(1200).default(''),recurrence:z.enum(['none','daily','weekly','monthly']).default('none'),repeatCount:z.number().int().min(1).max(12).default(1),createChat:z.boolean().default(false),createLive:z.boolean().default(false),timezone:z.string().max(100).default('UTC'),dstDisambiguation:z.enum(['reject','earlier','later']).default('reject'),scope:z.enum(['single','future','all']).default('single')});
export const saveExpandedEvent=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.input<typeof expandedEventSchema>)=>expandedEventSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await requireActiveMember(sql,uid,data.slug);await internals.assertNotMuted(sql,uid,data.slug);await guard(uid,'post');
  const title=cleanText(data.title,120),body=cleanText(data.body,3000),location=cleanText(data.location,300);
  await enforceCommunityPolicy(sql,uid,data.slug,'event',`${title}\n${body}`);
  if(data.createLive&&!data.id)await enforceCommunityPolicy(sql,uid,data.slug,'live',`${title}\n${body}`);
  const onlineUrl=validatedWebUrl(data.onlineUrl,'Online event link'),imageUrl=validatedWebUrl(data.imageUrl,'Event image');
  if(data.venueKind==='in_person'&&!location)throw new Error('Add a location for this event.');
  const zone=validTimeZone(data.timezone),dates=zonedOccurrences(data.startsAt,data.endsAt,data.id?'none':data.recurrence,data.repeatCount,zone,data.dstDisambiguation);
  if(data.id){
    if(!sql.transaction)throw new Error('Transactional storage is required.');
    const ids=await sql.transaction(async tx=>{
      await tx`select id from communities where id=${data.slug} for update`;
      const current=(await tx`select * from events where id=${data.id} and community_id=${data.slug} for update`)[0];if(!current)throw new Error('Event not found.');
      const me=await requireActiveMember(tx,uid,data.slug);
      const affected=current.series_id&&data.scope!=='single'?await tx`select * from events where community_id=${data.slug} and series_id=${String(current.series_id)} and (${data.scope}='all' or starts_at>=${iso(current.starts_at)}) order by id for update`:[current];
      const duration=data.endsAt?new Date(data.endsAt).getTime()-new Date(data.startsAt).getTime():null;
      for(const event of affected){
        await assertPaidResourceAccess(tx,uid,'event',Number(event.id));
        if(event.created_by!==uid&&!canLead(me.role))throw new Error('Only the organizer or a community leader can edit this event.');
        if(event.status==='cancelled')throw new Error('A cancelled occurrence cannot be edited. Choose a different scope.');
        if(event.kind!==data.kind)throw new Error('An event keeps its original type.');
        const start=data.scope==='single'?dates[0]!.startsAt:shiftedSeriesTime(iso(event.starts_at),iso(current.starts_at),data.startsAt,zone,data.dstDisambiguation);
        const end=duration===null?null:new Date(new Date(start).getTime()+duration).toISOString();
        await tx`update events set title=${title},body=${body},starts_at=${start},ends_at=${end},venue_kind=${data.venueKind},online_url=${onlineUrl},location=${location},image_url=${imageUrl},timezone=${zone},dst_disambiguation=${data.dstDisambiguation},updated_at=now() where id=${Number(event.id)}`;
        if(event.live_room_id)await tx`update chat_rooms set scheduled_at=${start},name=${title.slice(0,40)} where id=${Number(event.live_room_id)}`;
      }
      await audit(tx,data.slug,uid,'event:edit',`${title}; ${data.scope}; ${affected.length} occurrence(s)`);return affected.map(e=>Number(e.id));
    });
    for(const eventId of ids){const attendees=await sql`select user_id from event_rsvps where event_id=${eventId}`;for(const attendee of attendees)await notify(sql,String(attendee.user_id),'event','Event updated',title,`/c/${data.slug}/events`,{targetType:'event',targetId:eventId});}
    return {id:data.id,ids};
  }
  if(!sql.transaction)throw new Error('Transactional storage is required.');
  return sql.transaction(async tx=>{
  const seriesId=data.recurrence==='none'?null:crypto.randomUUID();
  // One statement inserts a series atomically; each occurrence has an independent attendee list.
  const rows=await tx.query(`insert into events(community_id,title,body,kind,starts_at,ends_at,created_by,venue_kind,online_url,location,image_url,recurrence,series_id,timezone,dst_disambiguation) select $1,$2,$3,$4,x.starts_at::timestamptz,x.ends_at::timestamptz,$5,$6,$7,$8,$9,$10,$11,$13,$14 from jsonb_to_recordset($12::jsonb) as x(starts_at text,ends_at text) returning id,starts_at`,[data.slug,title,body,data.kind,uid,data.venueKind,onlineUrl,location,imageUrl,data.recurrence,seriesId,JSON.stringify(dates.map(r=>({starts_at:r.startsAt,ends_at:r.endsAt}))),zone,data.dstDisambiguation]);
  for(const row of rows){
    if(data.createChat||data.createLive){
      const linked=await tx`insert into chat_rooms(community_id,name,kind,created_by,scheduled_at) values(${data.slug},${title.slice(0,40)},${data.createLive?'voice':'public'},${uid},${data.createLive?iso(row.starts_at):null}) returning id`;
      const roomId=Number(linked[0].id);await tx`insert into chat_members(room_id,user_id) select ${roomId},user_id from memberships where community_id=${data.slug} and status='active' on conflict do nothing`;
      if(data.createLive)await tx`update chat_members set stage_role='speaker' where room_id=${roomId} and user_id=${uid}`;
      await tx`update events set chat_room_id=${roomId},live_room_id=${data.createLive?roomId:null} where id=${Number(row.id)}`;
    }
  }
  await audit(tx,data.slug,uid,'event:create',`${title}; ${rows.length} occurrence(s)`);return {id:Number(rows[0].id),ids:rows.map(r=>Number(r.id))};
  });
});
export const listExpandedEvents=createServerFn({method:'GET'}).middleware([optionalAuth]).validator((slug:string)=>slugSchema.parse(slug)).handler(async({context,data:slug})=>{
  const sql=await db(),uid=(context as unknown as Viewer).userId,community=await readable(sql,uid,slug),member=await membershipOf(sql,uid,slug);
  const rows=await sql.query(`select e.*,(select count(*)::int from event_rsvps r where r.event_id=e.id and r.response='going') as rsvp_count,(select count(*)::int from event_rsvps r where r.event_id=e.id and r.response='interested') as interested_count,(select r.response from event_rsvps r where r.event_id=e.id and r.user_id=$2) as my_response,(select count(*)::int from challenge_entries ce where ce.event_id=e.id) as entry_count,(select ce.post_id from challenge_entries ce where ce.event_id=e.id and ce.user_id=$2) as my_entry_post_id from events e where e.community_id=$1 and ${paidResourceAccessSql('$2','event','e.id')} order by (e.status='cancelled'),(coalesce(e.ends_at,e.starts_at)>now()) desc,e.starts_at asc limit 100`,[slug,uid??'']);
  let canCreate=false;if(uid&&member?.status==='active'){try{await enforceCommunityPolicy(sql,uid,slug,'event');canCreate=true;}catch{canCreate=false;}}
  return {community,member,canCreate,events:rows.map(r=>({...mapHallEvent(r,r.my_response==='going'),imageUrl:String(r.image_url??''),venueKind:String(r.venue_kind??'online'),onlineUrl:String(r.online_url??''),location:String(r.location??''),status:String(r.status??'scheduled'),recurrence:String(r.recurrence??'none'),timezone:String(r.timezone??'UTC'),dstDisambiguation:String(r.dst_disambiguation??'reject'),seriesId:r.series_id?String(r.series_id):null,chatRoomId:r.chat_room_id?Number(r.chat_room_id):null,liveRoomId:r.live_room_id?Number(r.live_room_id):null,interestedCount:Number(r.interested_count??0),myResponse:r.my_response?String(r.my_response):null,canEdit:!!uid&&(r.created_by===uid||canLead(member?.role))}))};
});
const eventActionSchema=z.object({slug:slugSchema,id:idSchema,action:z.enum(['cancel','delete']),scope:z.enum(['single','future','all']).default('single')});
export const manageExpandedEvent=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.input<typeof eventActionSchema>)=>eventActionSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId,member=await requireActiveMember(sql,uid,data.slug);
  if(!sql.transaction)throw new Error('Transactional storage is required.');
  const changed=await sql.transaction(async tx=>{
    await tx`select id from communities where id=${data.slug} for update`;
    const selected=(await tx`select * from events where id=${data.id} and community_id=${data.slug} for update`)[0];if(!selected)throw new Error('Event not found.');
    const events=selected.series_id&&data.scope!=='single'?await tx`select * from events where community_id=${data.slug} and series_id=${String(selected.series_id)} and (${data.scope}='all' or starts_at>=${iso(selected.starts_at)}) order by id for update`:[selected];
    const changed=[];
    for(const event of events){
      const eventId=Number(event.id);await assertPaidResourceAccess(tx,uid,'event',eventId);
      if(event.created_by!==uid&&!canLead(member.role))throw new Error('Only the organizer or a leader can change this event.');
      const attendees=await tx.query(`select user_id from event_rsvps where event_id=$1 and ${paidResourceAccessSql('event_rsvps.user_id','event','$1')}`,[eventId]);
      if(data.action==='cancel'){
        await tx`update events set status='cancelled',updated_at=now() where id=${eventId}`;
        await tx`update event_passes set state='cancelled' where event_id=${eventId}`;
        if(event.live_room_id)await tx`update chat_rooms set locked=true where id=${Number(event.live_room_id)}`;
      }else{
        for(const linkedRoom of new Set([event.chat_room_id,event.live_room_id].filter(Boolean)))await tx`insert into billing_resource_requirements(resource_kind,resource_id,offer_id,owner_id,community_id) select 'chat',${String(linkedRoom)},offer_id,owner_id,community_id from billing_resource_requirements where resource_kind='event' and resource_id=${String(eventId)} on conflict(resource_kind,resource_id) do nothing`;
        await tx`delete from event_rsvps where event_id=${eventId}`;await tx`delete from challenge_entries where event_id=${eventId}`;await tx`delete from events where id=${eventId}`;
      }
      changed.push({id:eventId,title:String(event.title),attendees:attendees.map(a=>String(a.user_id))});
    }
    await audit(tx,data.slug,uid,`event:${data.action}`,`${selected.title}; ${data.scope}; ${events.length} occurrence(s)`);return changed;
  });
  for(const event of changed)for(const attendee of event.attendees)await notify(sql,attendee,'event',data.action==='cancel'?'Event cancelled':'Event removed',event.title,`/c/${data.slug}/events`,data.action==='cancel'?{targetType:'event',targetId:event.id}:{});
  return {ok:true};
});
const eventResponseSchema=z.object({slug:slugSchema,id:idSchema,response:z.enum(['going','interested','none'])});
export const respondExpandedEvent=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof eventResponseSchema>)=>eventResponseSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await requireActiveMember(sql,uid,data.slug);
  if(!sql.transaction)throw new Error('Transactional storage is required.');
  return sql.transaction(async tx=>{
    const event=(await tx`select status from events where id=${data.id} and community_id=${data.slug} for update`)[0];if(!event)throw new Error('Event not found.');if(event.status==='cancelled'&&data.response!=='none')throw new Error('This event was cancelled.');
    if(data.response!=='none')await assertPaidResourceAccess(tx,uid,'event',data.id);
    if(data.response==='none')await tx`delete from event_rsvps where event_id=${data.id} and user_id=${uid}`;
    else await tx`insert into event_rsvps(event_id,user_id,response) values(${data.id},${uid},${data.response}) on conflict(event_id,user_id) do update set response=excluded.response`;
    if(data.response!=='going')await tx`update event_passes set state='cancelled' where event_id=${data.id} and user_id=${uid}`;
    return {ok:true};
  });
});
export const getEventAttendees=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((d:z.infer<typeof scopedId>)=>scopedId.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await requireActiveMember(sql,uid,data.slug);
  if(!(await sql`select id from events where id=${data.id} and community_id=${data.slug}`).length)throw new Error('Event not found.');await assertPaidResourceAccess(sql,uid,'event',data.id);const blocked=await internals.blockedSet(sql,uid);
  const rows=await sql`select r.user_id,r.response,m.nickname,p.handle from event_rsvps r join memberships m on m.user_id=r.user_id and m.community_id=${data.slug} and m.status='active' left join profiles p on p.user_id=r.user_id where r.event_id=${data.id} order by r.response,r.created_at limit 500`;
  return rows.filter(r=>!blocked.has(String(r.user_id))).map(r=>({userId:String(r.user_id),nickname:String(r.nickname),handle:String(r.handle??''),response:String(r.response)}));
});
export const getEventCalendar=createServerFn({method:'GET'}).middleware([optionalAuth]).validator((d:z.infer<typeof scopedId>)=>scopedId.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as unknown as Viewer).userId;await readable(sql,uid,data.slug);const row=(await sql`select * from events where id=${data.id} and community_id=${data.slug}`)[0];if(!row)throw new Error('Event not found.');
  await assertPaidResourceAccess(sql,uid,'event',data.id);
  return {filename:`kamino-event-${data.id}.ics`,content:calendarEvent({id:data.id,title:String(row.title),body:String(row.body),startsAt:iso(row.starts_at),endsAt:row.ends_at?iso(row.ends_at):null,location:String(row.location??''),onlineUrl:String(row.online_url??''),status:String(row.status??'scheduled')})};
});

const roomIdSchema=z.object({roomId:idSchema});
async function stageHost(sql:Sql,uid:string,room:Row) {
  if(room.created_by===uid)return true;
  if((await sql`select 1 from room_cohosts where room_id=${Number(room.id)} and user_id=${uid}`).length)return true;
  if(room.community_id){const member=await membershipOf(sql,uid,String(room.community_id));if(member?.status==='active'&&canModerate(member.role))return true;}
  return false;
}
export const getLiveStage=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((d:z.infer<typeof roomIdSchema>)=>roomIdSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId,room=await internals.requireRoomAccess(sql,uid,data.roomId);
  if(!['voice','screening','private','public'].includes(String(room.kind)))throw new Error('This conversation does not have a live stage.');
  const host=await stageHost(sql,uid,room);
  const rows=await sql`select cm.user_id,cm.stage_role,cm.hand_raised,cm.host_muted,cm.in_voice,pr.display_name,m.nickname,exists(select 1 from room_cohosts rc where rc.room_id=cm.room_id and rc.user_id=cm.user_id) as cohost from chat_members cm left join profiles pr on pr.user_id=cm.user_id left join memberships m on m.user_id=cm.user_id and m.community_id=${room.community_id?String(room.community_id):''} where cm.room_id=${data.roomId} and cm.room_removed=false and (cm.in_voice=true or cm.hand_raised=true or cm.user_id=${uid}) and (${room.community_id?String(room.community_id):null}::text is null or m.status='active') order by cm.hand_raised desc,cm.stage_role desc`;
  const reactions=await sql`select id,user_id,emoji,created_at from live_room_reactions where room_id=${data.roomId} and created_at>now()-interval '20 seconds' order by id desc limit 30`;
  return {roomId:data.roomId,enabled:asBool(room.stage_enabled),locked:asBool(room.locked),scheduledAt:room.scheduled_at?iso(room.scheduled_at):null,host,participants:rows.map(r=>({userId:String(r.user_id),nickname:String(r.nickname??r.display_name??'Member'),role:room.created_by===r.user_id?'host':String(r.stage_role),raised:asBool(r.hand_raised),muted:asBool(r.host_muted),inVoice:asBool(r.in_voice),cohost:asBool(r.cohost)})),reactions:reactions.map(r=>({id:Number(r.id),userId:String(r.user_id),emoji:String(r.emoji)}))};
});
const stageConfigSchema=z.object({roomId:idSchema,enabled:z.boolean().optional(),locked:z.boolean().optional(),scheduledAt:z.string().nullable().optional()});
export const configureLiveStage=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof stageConfigSchema>)=>stageConfigSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId,room=await internals.requireRoomAccess(sql,uid,data.roomId);if(!await stageHost(sql,uid,room))throw new Error('Only hosts or community moderators can change the live room.');
  if(data.enabled!==undefined){await sql`update chat_rooms set stage_enabled=${data.enabled} where id=${data.roomId}`;if(data.enabled){await sql`update chat_members set stage_role='speaker',host_muted=false where room_id=${data.roomId} and user_id=${String(room.created_by)}`;await sql`update chat_members set stage_role='listener',host_muted=false where room_id=${data.roomId} and user_id<>${String(room.created_by)}`;}}
  if(data.locked!==undefined)await sql`update chat_rooms set locked=${data.locked} where id=${data.roomId}`;
  if(data.scheduledAt!==undefined){const date=data.scheduledAt?eventOccurrences(data.scheduledAt,undefined,'none')[0]!.startsAt:null;await sql`update chat_rooms set scheduled_at=${date} where id=${data.roomId}`;}
  if(room.community_id)await audit(sql,String(room.community_id),uid,'stage:configure',String(data.roomId));return {ok:true};
});
const stageActionSchema=z.object({roomId:idSchema,userId:z.string().optional(),action:z.enum(['raise','lower','speaker','listener','mute','unmute','remove','restore','cohost','uncohost']),emoji:z.string().optional()});
export const actLiveStage=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof stageActionSchema>)=>stageActionSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId,room=await internals.requireRoomAccess(sql,uid,data.roomId),target=data.userId??uid;
  const selfAction=['raise','lower'].includes(data.action);
  if(selfAction&&target!==uid)throw new Error('You can only raise or lower your own hand.');
  if(!selfAction&&!await stageHost(sql,uid,room))throw new Error('Only the host can manage the stage.');
  if(!selfAction&&target===room.created_by)throw new Error('The room creator keeps their host role.');
  const person=(await sql`select * from chat_members where room_id=${data.roomId} and user_id=${target}`)[0];if(!person)throw new Error('Person not in this room.');
  if(data.action==='raise'||data.action==='lower')await sql`update chat_members set hand_raised=${data.action==='raise'} where room_id=${data.roomId} and user_id=${target}`;
  if(data.action==='speaker'||data.action==='listener')await sql`update chat_members set stage_role=${data.action},hand_raised=false,host_muted=false where room_id=${data.roomId} and user_id=${target}`;
  if(data.action==='mute'||data.action==='unmute'){
    if(data.action==='unmute'&&asBool(room.stage_enabled)&&person.stage_role!=='speaker')throw new Error('Invite this person to speak first.');
    await sql`update chat_members set host_muted=${data.action==='mute'} where room_id=${data.roomId} and user_id=${target}`;
  }
  if(data.action==='remove'||data.action==='restore')await sql`update chat_members set room_removed=${data.action==='remove'},in_voice=false,hand_raised=false where room_id=${data.roomId} and user_id=${target}`;
  if(data.action==='cohost')await sql`insert into room_cohosts(room_id,user_id) values(${data.roomId},${target}) on conflict do nothing`;
  if(data.action==='uncohost')await sql`delete from room_cohosts where room_id=${data.roomId} and user_id=${target}`;
  if(room.community_id&&!selfAction)await audit(sql,String(room.community_id),uid,`stage:${data.action}`,`${data.roomId}; ${target}`);return {ok:true};
});
const liveReactionSchema=z.object({roomId:idSchema,emoji:z.enum(['❤️','👏','🔥','😂','✨','🎉'])});
export const reactLiveStage=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof liveReactionSchema>)=>liveReactionSchema.parse(d)).handler(async({context,data})=>{
  const sql=await db(),uid=(context as Authed).userId;await internals.requireRoomAccess(sql,uid,data.roomId);await guard(uid,'message');
  await sql`insert into live_room_reactions(room_id,user_id,emoji) values(${data.roomId},${uid},${data.emoji})`;return {ok:true};
});
