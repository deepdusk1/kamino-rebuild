import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import type {Sql} from '../db';
import {roleAllows,groupRole,requireGroupPower,assertGroupRemoval,stageGroupInvitation} from './social-events-v10.server.ts';
const pg=new PGlite();await pg.waitReady;
const migrations=new URL('../../../migrations/',import.meta.url);
for(const file of readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync(new URL(file,migrations),'utf8'));
after(()=>pg.close());
const sql=(async(strings:TemplateStringsArray,...values:unknown[])=> (await pg.query(strings.reduce((q,p,i)=>q+(i?`$${i}`:'')+p,''),values)).rows) as Sql;
sql.query=async<T>(query:string,params:unknown[]=[])=> (await pg.query<T>(query,params)).rows;
let n=0;
async function person(){const id=`social-v10-person-${++n}`;await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${`${id}@example.test`},true)`;return id;}
async function group(owner:string){return Number((await sql`insert into chat_rooms(name,kind,created_by) values('Consent group','group',${owner}) returning id`)[0].id);}
test('a moderator cannot rename, invite or grant roles, and a co-admin cannot grant roles',()=>{
  assert.equal(roleAllows('moderator','moderate'),true);assert.equal(roleAllows('moderator','pin'),true);assert.equal(roleAllows('moderator','remove'),true);
  for(const power of ['invite','rename','roles'] as const)assert.equal(roleAllows('moderator',power),false);
  assert.equal(roleAllows('coadmin','invite'),true);assert.equal(roleAllows('coadmin','roles'),false);assert.equal(roleAllows('member','pin'),false);
});
test('membership and removal checks protect the owner and other administrators',async()=>{
  const owner=await person(),coadmin=await person(),moderator=await person(),member=await person(),outsider=await person(),room=await group(owner);
  for(const [user,role] of [[owner,'member'],[coadmin,'coadmin'],[moderator,'moderator'],[member,'member']])await sql`insert into chat_members(room_id,user_id,group_role) values(${room},${user},${role})`;
  assert.equal(await groupRole(sql,room,owner),'owner');await requireGroupPower(sql,room,coadmin,'rename');await assertGroupRemoval(sql,room,moderator,member);
  await assert.rejects(requireGroupPower(sql,room,outsider,'pin'),/active member/);await assert.rejects(assertGroupRemoval(sql,room,moderator,coadmin),/owner/);await assert.rejects(assertGroupRemoval(sql,room,coadmin,owner),/owner/);
  await sql`update chat_members set room_removed=true where room_id=${room} and user_id=${moderator}`;await assert.rejects(groupRole(sql,room,moderator),/active member/);
});
test('an invitation never inserts membership, repeated invitations are idempotent, expired invitations can be replaced',async()=>{
  const owner=await person(),peer=await person(),room=await group(owner);await sql`insert into chat_members(room_id,user_id) values(${room},${owner})`;
  await stageGroupInvitation(sql,room,owner,peer);await stageGroupInvitation(sql,room,owner,peer);
  assert.equal((await sql`select 1 from chat_members where room_id=${room} and user_id=${peer}`).length,0);
  assert.equal((await sql`select 1 from group_invitations where room_id=${room} and state='pending'`).length,1);
  await sql`update group_invitations set expires_at=now()-interval '1 hour' where room_id=${room}`;await stageGroupInvitation(sql,room,owner,peer);
  assert.equal((await sql`select 1 from group_invitations where room_id=${room} and state='pending'`).length,1);
  assert.equal((await sql`select 1 from group_invitations where room_id=${room} and state='cancelled'`).length,1);
});
test('pending invitations reserve a group slot and reciprocal friend requests cannot form duplicate active relationships',async()=>{
  const owner=await person(),room=await group(owner);await sql`insert into chat_members(room_id,user_id) values(${room},${owner})`;
  for(let i=0;i<19;i++)await stageGroupInvitation(sql,room,owner,await person());await assert.rejects(stageGroupInvitation(sql,room,owner,await person()),/20 members/);
  const a=await person(),b=await person();await sql`insert into friend_requests(sender_id,recipient_id) values(${a},${b})`;
  await assert.rejects(sql`insert into friend_requests(sender_id,recipient_id) values(${b},${a})`,/unique/i);
  await sql`update friend_requests set state='declined' where sender_id=${a} and recipient_id=${b}`;await sql`insert into friend_requests(sender_id,recipient_id) values(${b},${a})`;
});
test('the applied community capacity migration accepts an owner and enforces the configured limit through the real trigger',async()=>{
  const owner=await person(),community=`capacity-social-v10-${++n}`;
  await sql`insert into communities(id,name,category,created_by) values(${community},'Capacity migration check','Art',${owner})`;
  await sql`insert into memberships(user_id,community_id,nickname,role) values(${owner},${community},'Owner','agent')`;
  await sql`update communities set member_limit=10 where id=${community}`;
  for(let index=0;index<9;index++){const member=await person();await sql`insert into memberships(user_id,community_id,nickname) values(${member},${community},'Member')`;}
  const overflow=await person();await assert.rejects(sql`insert into memberships(user_id,community_id,nickname) values(${overflow},${community},'Overflow')`,/member limit/);
  assert.equal(Number((await sql`select count(*) as n from memberships where community_id=${community}`)[0].n),10);
});
test('a forward compatibility migration repairs recorded early schemas without overwriting configured limits',async()=>{
  const early=new PGlite();await early.waitReady;
  try{
    for(const file of readdirSync(migrations).filter(f=>f.endsWith('.sql')&&f!=='0044_member_capacity_compat.sql').sort()){
      await early.exec(readFileSync(new URL(file,migrations),'utf8'));
      if(file==='0027_community_events.sql')await early.exec('alter table communities drop column member_limit');
    }
    await early.query("insert into communities(id,name,category,created_by) values('early-capacity','Early database','Art','early-owner')");
    await assert.rejects(early.query("insert into memberships(user_id,community_id,nickname) values('early-owner','early-capacity','Owner')"),/member_limit.*does not exist/);
    const repair=readFileSync(new URL('0044_member_capacity_compat.sql',migrations),'utf8');
    await early.exec(repair);
    await early.query("insert into memberships(user_id,community_id,nickname) values('early-owner','early-capacity','Owner')");
    await early.query("update communities set member_limit=20 where id='early-capacity'");
    await early.exec(repair);
    assert.equal((await early.query<{member_limit:number}>("select member_limit from communities where id='early-capacity'")).rows[0].member_limit,20);
    assert.equal(Number((await early.query<{n:string}>("select count(*) as n from memberships where community_id='early-capacity'")).rows[0].n),1);
  }finally{await early.close();}
});
test('new personal data cascades on deletion and retained attendance history clears the deleted checker',async()=>{
  const owner=await person(),peer=await person(),room=await group(owner);await sql`insert into friend_requests(sender_id,recipient_id) values(${owner},${peer})`;await stageGroupInvitation(sql,room,owner,peer);
  const community=`social-v10-${++n}`;await sql`insert into communities(id,name,category,created_by) values(${community},'Events','Art',${owner})`;
  const event=Number((await sql`insert into events(community_id,title,body,kind,starts_at,created_by) values(${community},'Gathering','','event',now(),${owner}) returning id`)[0].id);
  await sql`insert into event_timeline(event_id,author_id,body) values(${event},${peer},'Personal update')`;
  await sql`insert into event_passes(event_id,user_id,code,checked_in_by) values(${event},${owner},'retained-code',${peer})`;
  await sql`delete from "user" where id=${peer}`;
  assert.equal((await sql`select 1 from friend_requests where recipient_id=${peer}`).length,0);assert.equal((await sql`select 1 from group_invitations where user_id=${peer}`).length,0);assert.equal((await sql`select 1 from event_timeline where author_id=${peer}`).length,0);
  assert.equal((await sql`select checked_in_by from event_passes where event_id=${event}`)[0].checked_in_by,null);
});
