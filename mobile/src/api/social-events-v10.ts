import { rpc } from './client';
export type Person={userId:string;handle:string;name:string};
export type Friendship=Person&{id:number;state:string;incoming:boolean;createdAt:string};
export type GroupInvitation={id:number;roomId:number;name:string;inviter:string;handle:string;expiresAt:string};
export type GroupManagement={roomId:number;name:string;role:'owner'|'coadmin'|'moderator'|'member';people:(Person&{role:string})[];invitations:{id:number;handle:string;name:string;expiresAt:string}[]};
export type EventParticipation={organizer:boolean;status:string;mine:{code:string;state:string;issuedAt:string;checkedInAt:string|null}|null;timeline:{id:number;body:string;name:string;handle:string;createdAt:string;canDelete:boolean}[];passes:{id:number;state:string;name:string;handle:string;checkedInAt:string|null}[]};
export const socialEvents={
  friends:()=>rpc<{friends:Friendship[];incoming:Friendship[];outgoing:Friendship[]}>('getFriendships'),
  requestFriend:(handle:string)=>rpc<{id:number;already:boolean}>('sendFriendRequest',{handle}),
  answerFriend:(requestId:number,action:'accept'|'decline'|'cancel'|'remove')=>rpc<{ok:boolean}>('respondFriendRequest',{requestId,action}),
  mutualFriends:(userId:string)=>rpc<Person[]>('getMutualFriends',{userId}),
  invitations:()=>rpc<GroupInvitation[]>('getGroupInvitations'),
  inviteGroup:(roomId:number,handle:string)=>rpc<{ok:boolean}>('inviteToGroup',{roomId,handle}),
  answerGroup:(invitationId:number,accept:boolean)=>rpc<{ok:boolean;roomId:number|null}>('respondGroupInvitation',{invitationId,accept}),
  group:(roomId:number)=>rpc<GroupManagement>('getGroupManagement',{roomId}),
  groupRole:(roomId:number,userId:string,role:'member'|'moderator'|'coadmin')=>rpc<{ok:boolean}>('setGroupRole',{roomId,userId,role}),
  cancelGroupInvite:(roomId:number,invitationId:number)=>rpc<{ok:boolean}>('cancelGroupInvitation',{roomId,invitationId}),
  event:(slug:string,eventId:number)=>rpc<EventParticipation>('getEventParticipation',{slug,eventId}),
  eventPost:(slug:string,eventId:number,body:string)=>rpc<{id:number}>('postEventTimeline',{slug,eventId,body}),
  deleteEventPost:(slug:string,eventId:number,postId:number)=>rpc<{ok:boolean}>('deleteEventTimeline',{slug,eventId,postId}),
  pass:(slug:string,eventId:number)=>rpc<{code:string;state:string}>('issueEventPass',{slug,eventId}),
  checkIn:(slug:string,eventId:number,code:string,undo=false)=>rpc<{ok:boolean;already:boolean}>('checkInEventPass',{slug,eventId,code,undo}),
};
