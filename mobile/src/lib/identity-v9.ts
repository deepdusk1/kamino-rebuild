import { rpc } from '@/api/client';
export type IdentityPreferences = {handle:string;language:string;socialLinks:{label:string;url:string}[];profileHue:number;mentionPrivacy:string;invitePrivacy:string;searchVisible:boolean;hideFollowers:boolean;hideFollowing:boolean;restrictedMode:boolean;sensitiveContent:string;highContrast:boolean;textScale:string;tutorialComplete:boolean};
export type IdentityPerson = {userId:string;handle:string;name:string;hue:number;kind?:string};
export type IdentityDashboard = {preferences:IdentityPreferences;email:string;emailVerified:boolean;twoFactorEnabled:boolean;ageChecked:boolean;ageBand:string;people:IdentityPerson[];muted:IdentityPerson[];sessions:{id:string;device:string;lastActive:string;createdAt:string;expiresAt:string}[];isAdmin:boolean;emailDeliveryConfigured:boolean;captchaConfigured:boolean};
export const identityApi = {
  dashboard:()=>rpc<IdentityDashboard>('getIdentityDashboard'),
  preferences:(data:Partial<IdentityPreferences>)=>rpc('updateIdentityPreferences',data),
  person:(targetHandle:string,kind:string,enabled:boolean)=>rpc('setPersonRelationship',{targetHandle,kind,enabled}),
  revoke:(id:string)=>rpc('revokeIdentitySession',id),
  contacts:(emails:string[])=>rpc<IdentityPerson[]>('findContacts',emails),
};
