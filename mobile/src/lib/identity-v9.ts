import { rpc } from '@/api/client';
export type IdentityPreferences = {handle:string;language:string;socialLinks:{label:string;url:string}[];profileHue:number;mentionPrivacy:string;invitePrivacy:string;searchVisible:boolean;hideFollowers:boolean;hideFollowing:boolean;restrictedMode:boolean;sensitiveContent:string;highContrast:boolean;textScale:string;tutorialComplete:boolean};
export type IdentityPerson = {userId:string;handle:string;name:string;hue:number;kind?:string};
export type IdentityDashboard = {preferences:IdentityPreferences;email:string;emailVerified:boolean;twoFactorEnabled:boolean;ageChecked:boolean;ageBand:string;people:IdentityPerson[];muted:IdentityPerson[];sessions:{id:string;device:string;lastActive:string;createdAt:string;expiresAt:string;current:boolean}[];hasPassword:boolean;isAdmin:boolean;emailDeliveryConfigured:boolean;captchaConfigured:boolean};
export const identityApi = {
  dashboard:()=>rpc<IdentityDashboard>('getIdentityDashboard'),
  preferences:(data:Partial<IdentityPreferences>)=>rpc('updateIdentityPreferences',data),
  person:(targetHandle:string,kind:string,enabled:boolean)=>rpc('setPersonRelationship',{targetHandle,kind,enabled}),
  /** `signedOut` is true when this phone's own session was ended. */
  revoke:(id:string)=>rpc<{ok:boolean;signedOut:boolean}>('revokeIdentitySession',id),
  /** Signs out every other phone and browser. */
  revokeOthers:()=>rpc<{ended:number}>('revokeOtherIdentitySessions'),
  contacts:(emails:string[])=>rpc<IdentityPerson[]>('findContacts',emails),
};
