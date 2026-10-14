import { rpc } from './client';
import type { Community, Membership, HallEvent } from './types';
export type CommunityPermission='post'|'events'|'live'|'invite'|'manage_faq'|'manage_boards'|'trusted';
export type Policy='members'|'trusted'|'moderators';
export type Cosmetic='aurora'|'sunrise'|'ocean'|'forest';
export type CommunityToolData={community:Community;member:Membership|null;isModerator:boolean;permissions:CommunityPermission[];level:number;reputation:number;settings:{language:string;localArea:string;memberLimit:number|null;joinPolicy:string;postPolicy:string;livePolicy:string;eventPolicy:string;keywordFilters:string[];verificationRequestedAt:string|null;verificationStatus:string|null};faqs:{id:number;question:string;answer:string}[];boards:{id:number;name:string;description:string;threadCount:number}[];roles:{id:number;label:string;color:string;permissions:CommunityPermission[]}[];assignments:{userId:string;roleId:number;nickname:string}[];badges:{id:number;userId:string;badge:string;note:string;nickname:string}[]};
export type CommunityModData={role:string;banned:{userId:string;nickname:string;handle:string}[];mutes:{id:number;userId:string;nickname:string;reason:string;until:string}[];audit:{id:number;action:string;detail:string;actor:string;createdAt:string}[];appeals:{id:number;userId:string;nickname:string;kind:string;message:string;status:string;decisionNote:string}[];members:{userId:string;nickname:string;role:string}[]};
export type CommunityAnalytics={members:number;newMembers30:number;dailyActive:number;weeklyActive:number;monthlyActive:number;retentionPercent:number|null;retentionPrevious:number;retentionRetained:number;growth:{day:string;count:number}[];topContent:{id:number;title:string;nickname:string;likes:number;comments:number}[];definition:string};
export type CommunityQuest={id:number;title:string;description:string;kind:string;metric:string;target:number;badge:string;rewardCosmetic:string;startsAt:string;endsAt:string|null;claimedAt:string|null;progress:number};
export type ExpandedEvent=HallEvent&{imageUrl:string;venueKind:string;onlineUrl:string;location:string;status:string;recurrence:string;seriesId:string|null;timezone:string;dstDisambiguation:string;chatRoomId:number|null;liveRoomId:number|null;interestedCount:number;myResponse:string|null;canEdit:boolean};
export type EventInput={slug:string;id?:number;title:string;body:string;kind:'event'|'challenge';startsAt:string;endsAt?:string;venueKind:'online'|'in_person';onlineUrl:string;location:string;imageUrl:string;recurrence:'none'|'daily'|'weekly'|'monthly';repeatCount:number;createChat:boolean;createLive:boolean;timezone?:string;dstDisambiguation?:'reject'|'earlier'|'later';scope?:'single'|'future'|'all'};
export type LiveStageState={roomId:number;enabled:boolean;locked:boolean;scheduledAt:string|null;host:boolean;participants:{userId:string;nickname:string;role:string;raised:boolean;muted:boolean;inVoice:boolean;cohost:boolean}[];reactions:{id:number;userId:string;emoji:string}[]};
export const communityV9={
  tools:(slug:string)=>rpc<CommunityToolData>('getCommunityTools',slug),
  policies:(data:{slug:string;language:string;localArea?:string;memberLimit?:number|null;joinPolicy:'open'|'approval'|'invite';postPolicy:Policy;livePolicy:Policy;eventPolicy:Policy;keywordFilters:string[]})=>rpc('saveCommunityPolicies',data),
  saveFaq:(data:{slug:string;id?:number;question:string;answer:string})=>rpc<{id:number}>('saveCommunityFaq',data),
  deleteFaq:(slug:string,id:number)=>rpc('deleteCommunityFaq',{slug,id}),
  saveBoard:(data:{slug:string;id?:number;name:string;description:string})=>rpc('saveCommunityBoard',data),
  deleteBoard:(slug:string,id:number)=>rpc('deleteCommunityBoard',{slug,id}),
  boardThreads:(slug:string,boardId:number)=>rpc<{board:{id:number;name:string;description:string};threads:{id:number;title:string;excerpt:string;type:string;comments:number;nickname:string;createdAt:string}[]}>('getBoardThreads',{slug,boardId}),
  boardPosts:(slug:string)=>rpc<{id:number;title:string}[]>('getBoardAssignablePosts',slug),
  assignPost:(slug:string,boardId:number,postId:number,remove=false)=>rpc('assignPostBoard',{slug,boardId,postId,remove}),
  saveRole:(data:{slug:string;id?:number;label:string;color:string;permissions:CommunityPermission[]})=>rpc('saveCommunityRole',data),
  deleteRole:(slug:string,id:number)=>rpc('deleteCommunityRole',{slug,id}),
  assignRole:(slug:string,userId:string,roleId:number,remove=false)=>rpc('assignCommunityRole',{slug,userId,roleId,remove}),
  appoint:(slug:string,userId:string,role:'leader'|'curator'|'member')=>rpc('appointCommunityLeader',{slug,userId,role}),
  modDetails:(slug:string)=>rpc<CommunityModData>('getCommunityModerationDetails',slug),
  analytics:(slug:string)=>rpc<CommunityAnalytics>('getCommunityAnalytics',slug),
  verify:(slug:string,reason:string)=>rpc('requestCommunityVerification',{slug,reason}),
  report:(slug:string,reason:string,details:string)=>rpc('reportCommunityV9',{slug,reason,details}),
  inviteDetails:(code:string)=>rpc<{slug:string;name:string;tagline:string;ageGate:number;joined:boolean}>('getCommunityInviteDetails',code),
  invitePerson:(slug:string,handle:string)=>rpc<{ok:boolean;already:boolean}>('inviteCommunityPerson',{slug,handle}),
  quests:(slug:string)=>rpc<CommunityQuest[]>('getCommunityQuests',slug),
  saveQuest:(data:{slug:string;id?:number;title:string;description:string;kind:'quest'|'weekly'|'seasonal'|'milestone';metric:'posts'|'comments'|'likes_received'|'checkins';target:number;badge:string;rewardCosmetic:''|Cosmetic;startsAt:string;endsAt?:string})=>rpc('saveCommunityQuest',data),
  claimQuest:(slug:string,id:number)=>rpc('claimCommunityQuest',{slug,id}),
  grantBadge:(slug:string,userId:string,badge:'Helpful member'|'Kindness'|'Community star',note:string)=>rpc('grantCommunityBadge',{slug,userId,badge,note}),
  cosmetics:()=>rpc<{cosmetic:Cosmetic;source:string;earnedAt:string}[]>('getEarnedCosmetics'),
  equipCosmetic:(cosmetic:Cosmetic)=>rpc('equipEarnedCosmetic',{cosmetic}),
  events:(slug:string)=>rpc<{community:Community;member:Membership|null;canCreate:boolean;events:ExpandedEvent[]}>('listExpandedEvents',slug),
  saveEvent:(data:EventInput)=>rpc<{id:number;ids:number[]}>('saveExpandedEvent',data),
  manageEvent:(slug:string,id:number,action:'cancel'|'delete',scope:'single'|'future'|'all'='single')=>rpc('manageExpandedEvent',{slug,id,action,scope}),
  rsvp:(slug:string,id:number,response:'going'|'interested'|'none')=>rpc('respondExpandedEvent',{slug,id,response}),
  attendees:(slug:string,id:number)=>rpc<{userId:string;nickname:string;handle:string;response:string}[]>('getEventAttendees',{slug,id}),
  calendar:(slug:string,id:number)=>rpc<{filename:string;content:string}>('getEventCalendar',{slug,id}),
  stage:(roomId:number)=>rpc<LiveStageState>('getLiveStage',{roomId}),
  configureStage:(data:{roomId:number;enabled?:boolean;locked?:boolean;scheduledAt?:string|null})=>rpc('configureLiveStage',data),
  stageAction:(roomId:number,action:'raise'|'lower'|'speaker'|'listener'|'mute'|'unmute'|'remove'|'restore'|'cohost'|'uncohost',userId?:string)=>rpc('actLiveStage',{roomId,action,userId}),
  reactStage:(roomId:number,emoji:string)=>rpc('reactLiveStage',{roomId,emoji}),
};
