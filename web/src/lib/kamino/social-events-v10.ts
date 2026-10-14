import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { authMiddleware } from '@/lib/auth/middleware';
import { internals } from './server';
import { assertInviteAllowed } from './identity-v9';
import { asBool, iso } from './map';
import { canLead, scanText } from './safety';
import { guard } from './guard';
import { assertPaidResourceAccess } from './billing.server';
import { groupRole, requireGroupPower, stageGroupInvitation } from './social-events-v10.server';

const id=z.number().int().positive(),uid=z.string().min(1).max(200),scope=z.object({slug:z.string().min(1).max(100),eventId:id});
const {db,requireMinAge,requireRoomAccess,blockedSet,notify}=internals;
async function atomic<T>(sql:Sql,work:(tx:Sql)=>Promise<T>){if(!sql.transaction)throw new Error('Transactional storage is required.');return sql.transaction(work);}
function person(row:Record<string,unknown>){return {userId:String(row.user_id),handle:String(row.handle),name:String(row.display_name)};}
async function connectionAllowed(sql:Sql,actor:string,target:string){await requireMinAge(sql,actor);await requireMinAge(sql,target);await assertInviteAllowed(sql,actor,target);await internals.assertPeerContactAllowed(sql,actor,target);}
async function invitePeerAllowed(sql:Sql,actor:string,target:string,roomId:number){
  await connectionAllowed(sql,actor,target);
  const profile=(await sql`select dm_privacy from profiles where user_id=${target}`)[0];
  if(!profile||profile.dm_privacy==='none')throw new Error('This person has messaging closed.');
  if(profile.dm_privacy==='members'&&!(await sql`select 1 from memberships a join memberships b on b.community_id=a.community_id where a.user_id=${actor} and b.user_id=${target} and a.status='active' and b.status='active'`).length)throw new Error('This person accepts messages only from shared communities.');
  const peers=await sql`select user_id from chat_members where room_id=${roomId} and room_removed=false`;
  for(const peer of peers){const peerId=String(peer.user_id);if(peerId===target)continue;if((await blockedSet(sql,target)).has(peerId))throw new Error('This group is unavailable.');await internals.assertPeerContactAllowed(sql,target,peerId);}
}
export const getFriendships=createServerFn({method:'GET'}).middleware([authMiddleware]).handler(async({context})=>{
  const sql=await db(),me=context.userId;await requireMinAge(sql,me);const blocked=await blockedSet(sql,me);
  const rows=await sql`select r.id,r.sender_id,r.recipient_id,r.state,r.created_at,p.user_id,p.handle,p.display_name from friend_requests r join profiles p on p.user_id=case when r.sender_id=${me} then r.recipient_id else r.sender_id end where (r.sender_id=${me} or r.recipient_id=${me}) and r.state in ('pending','accepted') order by r.created_at desc limit 500`;
  const shown=[];for(const row of rows){if(blocked.has(String(row.user_id)))continue;try{await internals.assertPeerContactAllowed(sql,me,String(row.user_id));shown.push({id:Number(row.id),state:String(row.state),incoming:row.recipient_id===me,createdAt:iso(row.created_at),...person(row)});}catch{/* Changed safety settings remove the relationship from view. */}}
  return {friends:shown.filter(r=>r.state==='accepted'),incoming:shown.filter(r=>r.state==='pending'&&r.incoming),outgoing:shown.filter(r=>r.state==='pending'&&!r.incoming)};
});
export const sendFriendRequest=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:{handle:string})=>z.object({handle:z.string().trim().toLowerCase().regex(/^@?[a-z0-9_-]{2,30}$/)}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;await guard(me,'invite');
  const target=(await sql`select user_id from profiles where handle=${data.handle.replace(/^@/,'')} and search_visible=true`)[0];
  if(!target||target.user_id===me)throw new Error('Choose another searchable member by username.');const targetId=String(target.user_id);await connectionAllowed(sql,me,targetId);
  const result=await atomic(sql,async tx=>{
    const people=[me,targetId].sort();await tx`select id from "user" where id=any(${people}) order by id for update`;
    const existing=(await tx`select id,state from friend_requests where least(sender_id,recipient_id)=least(${me},${targetId}) and greatest(sender_id,recipient_id)=greatest(${me},${targetId}) and state in ('pending','accepted')`)[0];
    if(existing)return {id:Number(existing.id),already:true};
    const [row]=await tx`insert into friend_requests(sender_id,recipient_id) values(${me},${targetId}) returning id`;return {id:Number(row.id),already:false};
  });
  if(!result.already)await notify(sql,targetId,'invite','Friend request','Someone would like to connect with you.','/connections',{actorId:me});return result;
});
export const respondFriendRequest=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:{requestId:number;action:'accept'|'decline'|'cancel'|'remove'})=>z.object({requestId:id,action:z.enum(['accept','decline','cancel','remove'])}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;
  return atomic(sql,async tx=>{
    const row=(await tx`select * from friend_requests where id=${data.requestId} and (sender_id=${me} or recipient_id=${me}) for update`)[0];if(!row)throw new Error('Request unavailable.');
    if(data.action==='remove'){if(row.state!=='accepted')throw new Error('This friendship is no longer active.');}
    else if(row.state!=='pending')throw new Error('This request was already answered.');
    if(['accept','decline'].includes(data.action)&&row.recipient_id!==me)throw new Error('Only the recipient can answer a request.');
    if(data.action==='cancel'&&row.sender_id!==me)throw new Error('Only the sender can cancel a request.');
    if(data.action==='accept')await connectionAllowed(tx,String(row.sender_id),me);
    const state=data.action==='accept'?'accepted':data.action==='decline'?'declined':'cancelled';await tx`update friend_requests set state=${state},decided_at=now() where id=${data.requestId}`;return {ok:true};
  });
});
export const getMutualFriends=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((d:{userId:string})=>z.object({userId:uid}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;await requireMinAge(sql,me);await internals.assertPeerContactAllowed(sql,me,data.userId);
  const target=(await sql`select private_account,hide_followers from profiles where user_id=${data.userId}`)[0];
  if(!target||asBool(target.private_account)||asBool(target.hide_followers)||(await blockedSet(sql,me)).has(data.userId))return [];
  const rows=await sql`with mine as(select case when sender_id=${me} then recipient_id else sender_id end as friend from friend_requests where state='accepted' and (sender_id=${me} or recipient_id=${me})), theirs as(select case when sender_id=${data.userId} then recipient_id else sender_id end as friend from friend_requests where state='accepted' and (sender_id=${data.userId} or recipient_id=${data.userId})) select p.user_id,p.handle,p.display_name from mine join theirs using(friend) join profiles p on p.user_id=mine.friend where p.private_account=false and p.hide_followers=false and p.search_visible=true limit 100`;
  const blocked=await blockedSet(sql,me),shown=[];for(const row of rows){if(blocked.has(String(row.user_id)))continue;try{await internals.assertPeerContactAllowed(sql,me,String(row.user_id));shown.push(person(row));}catch{/* Omit restricted accounts. */}}return shown;
});
export const getGroupInvitations=createServerFn({method:'GET'}).middleware([authMiddleware]).handler(async({context})=>{
  const sql=await db(),me=context.userId;await requireMinAge(sql,me);
  const rows=await sql`select i.id,i.room_id,i.invited_by,i.expires_at,r.name,p.handle,p.display_name from group_invitations i join chat_rooms r on r.id=i.room_id join profiles p on p.user_id=i.invited_by where i.user_id=${me} and i.state='pending' and i.expires_at>now() order by i.created_at desc limit 100`;
  const shown=[];for(const row of rows){try{await invitePeerAllowed(sql,String(row.invited_by),me,Number(row.room_id));await requireGroupPower(sql,Number(row.room_id),String(row.invited_by),'invite');shown.push({id:Number(row.id),roomId:Number(row.room_id),name:String(row.name),inviter:String(row.display_name),handle:String(row.handle),expiresAt:iso(row.expires_at)});}catch{/* Inviter removal, blocks, age or privacy changes invalidate display. */}}return shown;
});
export const inviteToGroup=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:{roomId:number;handle:string})=>z.object({roomId:id,handle:z.string().trim().min(2).max(31)}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;await requireRoomAccess(sql,me,data.roomId);await requireGroupPower(sql,data.roomId,me,'invite');await guard(me,'invite');
  const target=(await sql`select user_id from profiles where handle=${data.handle.replace(/^@/,'').toLowerCase()} and search_visible=true`)[0];if(!target||target.user_id===me)throw new Error('Choose another member.');const targetId=String(target.user_id);await invitePeerAllowed(sql,me,targetId,data.roomId);
  await atomic(sql,async tx=>{await tx`select id from chat_rooms where id=${data.roomId} for update`;await requireGroupPower(tx,data.roomId,me,'invite');await stageGroupInvitation(tx,data.roomId,me,targetId);});
  await notify(sql,targetId,'invite','Group invitation','You can accept or decline this invitation.','/connections',{actorId:me});return {ok:true};
});
export const respondGroupInvitation=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:{invitationId:number;accept:boolean})=>z.object({invitationId:id,accept:z.boolean()}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;await requireMinAge(sql,me);
  return atomic(sql,async tx=>{
    const preview=(await tx`select room_id from group_invitations where id=${data.invitationId} and user_id=${me}`)[0];if(!preview)throw new Error('Invitation unavailable.');const roomId=Number(preview.room_id);await tx`select id from chat_rooms where id=${roomId} for update`;
    const invitation=(await tx`select * from group_invitations where id=${data.invitationId} and user_id=${me} for update`)[0];if(!invitation||invitation.state!=='pending'||new Date(String(invitation.expires_at)).getTime()<=Date.now())throw new Error('This invitation expired or was already answered.');
    if(data.accept){await invitePeerAllowed(tx,String(invitation.invited_by),me,roomId);await requireGroupPower(tx,roomId,String(invitation.invited_by),'invite');const count=Number((await tx`select count(*) as n from chat_members where room_id=${roomId} and room_removed=false`)[0].n);if(count>=20)throw new Error('This group is full.');await tx`insert into chat_members(room_id,user_id) values(${roomId},${me}) on conflict(room_id,user_id) do update set room_removed=false,group_role='member'`;}
    await tx`update group_invitations set state=${data.accept?'accepted':'declined'},decided_at=now() where id=${data.invitationId}`;return {ok:true,roomId:data.accept?roomId:null};
  });
});
export const getGroupManagement=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((d:{roomId:number})=>z.object({roomId:id}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId,room=await requireRoomAccess(sql,me,data.roomId),role=await groupRole(sql,data.roomId,me);
  const people=await sql`select p.user_id,p.handle,p.display_name,m.group_role from chat_members m join profiles p on p.user_id=m.user_id where m.room_id=${data.roomId} and m.room_removed=false order by p.display_name`;
  const invitations=role==='owner'||role==='coadmin'?await sql`select i.id,p.handle,p.display_name,i.expires_at from group_invitations i join profiles p on p.user_id=i.user_id where i.room_id=${data.roomId} and i.state='pending' and i.expires_at>now()`:[];
  return {roomId:data.roomId,name:String(room.name),role,people:people.map(p=>({...person(p),role:p.user_id===room.created_by?'owner':String(p.group_role)})),invitations:invitations.map(i=>({id:Number(i.id),handle:String(i.handle),name:String(i.display_name),expiresAt:iso(i.expires_at)}))};
});
export const setGroupRole=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:{roomId:number;userId:string;role:'member'|'moderator'|'coadmin'})=>z.object({roomId:id,userId:uid,role:z.enum(['member','moderator','coadmin'])}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;await requireRoomAccess(sql,me,data.roomId);
  await atomic(sql,async tx=>{await tx`select id from chat_rooms where id=${data.roomId} for update`;await requireGroupPower(tx,data.roomId,me,'roles');if(await groupRole(tx,data.roomId,data.userId)==='owner')throw new Error('The owner keeps ownership.');await tx`update chat_members set group_role=${data.role} where room_id=${data.roomId} and user_id=${data.userId} and room_removed=false`;});return {ok:true};
});
export const cancelGroupInvitation=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:{roomId:number;invitationId:number})=>z.object({roomId:id,invitationId:id}).parse(d)).handler(async({context,data})=>{
  const sql=await db();await requireRoomAccess(sql,context.userId,data.roomId);await requireGroupPower(sql,data.roomId,context.userId,'invite');await sql`update group_invitations set state='cancelled',decided_at=now() where id=${data.invitationId} and room_id=${data.roomId} and state='pending'`;return {ok:true};
});
async function eventAccess(sql:Sql,me:string,slug:string,eventId:number){await internals.requireActiveMember(sql,me,slug);const event=(await sql`select * from events where id=${eventId} and community_id=${slug}`)[0];if(!event)throw new Error('Event unavailable.');await assertPaidResourceAccess(sql,me,'event',eventId);return event;}
export const getEventParticipation=createServerFn({method:'GET'}).middleware([authMiddleware]).validator((d:z.infer<typeof scope>)=>scope.parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId,event=await eventAccess(sql,me,data.slug,data.eventId),member=await internals.requireActiveMember(sql,me,data.slug),organizer=event.created_by===me||canLead(member.role),blocked=await blockedSet(sql,me);
  const [timeline,passes,mine]=await Promise.all([sql`select t.id,t.author_id,t.body,t.created_at,p.display_name,p.handle from event_timeline t join profiles p on p.user_id=t.author_id where t.event_id=${data.eventId} and t.deleted=false order by t.id desc limit 100`,organizer?sql`select e.id,e.state,e.issued_at,e.checked_in_at,p.user_id,p.handle,p.display_name from event_passes e join profiles p on p.user_id=e.user_id where e.event_id=${data.eventId} order by e.id limit 1000`:Promise.resolve([]),sql`select code,state,issued_at,checked_in_at from event_passes where event_id=${data.eventId} and user_id=${me}`]);
  return {organizer,status:String(event.status),mine:mine[0]?{code:String(mine[0].code),state:String(mine[0].state),issuedAt:iso(mine[0].issued_at),checkedInAt:mine[0].checked_in_at?iso(mine[0].checked_in_at):null}:null,timeline:timeline.filter(t=>!blocked.has(String(t.author_id))).map(t=>({id:Number(t.id),body:String(t.body),name:String(t.display_name),handle:String(t.handle),createdAt:iso(t.created_at),canDelete:t.author_id===me||organizer})),passes:passes.map(p=>({id:Number(p.id),state:String(p.state),name:String(p.display_name),handle:String(p.handle),checkedInAt:p.checked_in_at?iso(p.checked_in_at):null}))};
});
export const postEventTimeline=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof scope>&{body:string})=>scope.extend({body:z.string().trim().min(1).max(2000)}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;await eventAccess(sql,me,data.slug,data.eventId);await guard(me,'comment');const error=scanText(data.body);if(error)throw new Error(error);const {checkContent}=await import('./safety.server');const verdict=await checkContent({text:data.body});if(verdict.action!==null)throw new Error('Please revise your message before posting.');
  return atomic(sql,async tx=>{await tx`select id from events where id=${data.eventId} for update`;const event=await eventAccess(tx,me,data.slug,data.eventId);if(event.status==='cancelled')throw new Error('This event is cancelled.');const [row]=await tx`insert into event_timeline(event_id,author_id,body) values(${data.eventId},${me},${data.body}) returning id`;return {id:Number(row.id)};});
});
export const deleteEventTimeline=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof scope>&{postId:number})=>scope.extend({postId:id}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId,event=await eventAccess(sql,me,data.slug,data.eventId),member=await internals.requireActiveMember(sql,me,data.slug);const row=(await sql`select author_id from event_timeline where id=${data.postId} and event_id=${data.eventId}`)[0];if(!row||row.author_id!==me&&event.created_by!==me&&!canLead(member.role))throw new Error('You cannot remove this update.');await sql`update event_timeline set deleted=true,body='' where id=${data.postId}`;return {ok:true};
});
export const issueEventPass=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof scope>)=>scope.parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;
  return atomic(sql,async tx=>{await tx`select id from events where id=${data.eventId} for update`;const event=await eventAccess(tx,me,data.slug,data.eventId);if(event.status==='cancelled')throw new Error('This event is cancelled.');if(!(await tx`select 1 from event_rsvps where event_id=${data.eventId} and user_id=${me} and response='going'`).length)throw new Error('RSVP Going before getting your attendance pass.');await tx`insert into event_passes(event_id,user_id,code) values(${data.eventId},${me},${crypto.randomUUID()}) on conflict(event_id,user_id) do update set state=case when event_passes.state='cancelled' then 'issued' else event_passes.state end`;const row=(await tx`select code,state from event_passes where event_id=${data.eventId} and user_id=${me}`)[0];return {code:String(row.code),state:String(row.state)};});
});
export const checkInEventPass=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:z.infer<typeof scope>&{code:string;undo?:boolean})=>scope.extend({code:z.string().uuid(),undo:z.boolean().default(false)}).parse(d)).handler(async({context,data})=>{
  const sql=await db(),me=context.userId;
  return atomic(sql,async tx=>{await tx`select id from events where id=${data.eventId} for update`;const event=await eventAccess(tx,me,data.slug,data.eventId),member=await internals.requireActiveMember(tx,me,data.slug);if(event.created_by!==me&&!canLead(member.role))throw new Error('Only the organizer or a leader can check people in.');if(event.status==='cancelled')throw new Error('This event is cancelled.');const pass=(await tx`select user_id,state from event_passes where event_id=${data.eventId} and code=${data.code} for update`)[0];if(!pass||pass.state==='cancelled')throw new Error('Pass unavailable.');await eventAccess(tx,String(pass.user_id),data.slug,data.eventId);if(!(await tx`select 1 from event_rsvps where event_id=${data.eventId} and user_id=${String(pass.user_id)} and response='going'`).length)throw new Error('This attendee is no longer going.');const already=pass.state==='checked_in';await tx`update event_passes set state=${data.undo?'issued':'checked_in'},checked_in_at=${data.undo?null:new Date().toISOString()},checked_in_by=${data.undo?null:me} where event_id=${data.eventId} and code=${data.code}`;return {ok:true,already};});
});
