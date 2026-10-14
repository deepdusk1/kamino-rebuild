import type { Sql } from '@/lib/db';
export type GroupRole='owner'|'coadmin'|'moderator'|'member';
export type GroupPower='invite'|'rename'|'remove'|'pin'|'moderate'|'roles';
export function roleAllows(role:GroupRole,power:GroupPower) {
  if(role==='owner')return true;
  if(role==='coadmin')return power!=='roles';
  return role==='moderator'&&['remove','pin','moderate'].includes(power);
}
export async function groupRole(sql:Sql,roomId:number,userId:string):Promise<GroupRole> {
  const row=(await sql`select r.created_by,m.group_role from chat_rooms r join chat_members m on m.room_id=r.id and m.user_id=${userId} and m.room_removed=false where r.id=${roomId} and r.kind='group'`)[0];
  if(!row)throw new Error('You are not an active member of this group.');
  return row.created_by===userId?'owner':String(row.group_role) as GroupRole;
}
export async function groupRoleAllows(sql:Sql,roomId:number,userId:string,power:GroupPower) {
  return roleAllows(await groupRole(sql,roomId,userId),power);
}
export async function requireGroupPower(sql:Sql,roomId:number,userId:string,power:GroupPower) {
  const role=await groupRole(sql,roomId,userId);
  if(!roleAllows(role,power))throw new Error('Your group role does not allow this action.');
  return role;
}
export async function assertGroupRemoval(sql:Sql,roomId:number,actor:string,target:string) {
  const role=await requireGroupPower(sql,roomId,actor,'remove'),targetRole=await groupRole(sql,roomId,target);
  if(target===actor)throw new Error('Use Leave group to leave.');
  if(targetRole==='owner'||role==='moderator'&&targetRole!=='member'||role==='coadmin'&&targetRole==='coadmin')throw new Error('Only the owner can change another group administrator.');
}
export async function stageGroupInvitation(sql:Sql,roomId:number,actor:string,target:string) {
  if((await sql`select 1 from chat_members where room_id=${roomId} and user_id=${target} and room_removed=false`).length)throw new Error('This person is already in the group.');
  await sql`update group_invitations set state='cancelled',decided_at=now() where room_id=${roomId} and user_id=${target} and state='pending' and expires_at<=now()`;
  if((await sql`select 1 from group_invitations where room_id=${roomId} and user_id=${target} and state='pending' and expires_at>now()`).length)return;
  const count=Number((await sql`select (select count(*) from chat_members where room_id=${roomId} and room_removed=false)+(select count(*) from group_invitations where room_id=${roomId} and state='pending' and expires_at>now()) as n`)[0]?.n??0);
  if(count>=20)throw new Error('Groups support up to 20 members, including pending invitations.');
  await sql`insert into group_invitations(room_id,invited_by,user_id) values(${roomId},${actor},${target}) on conflict do nothing`;
}
