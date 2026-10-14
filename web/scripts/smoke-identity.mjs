import {fixtureAuthFetch} from "./fixture-auth.mjs";
/** Security regression suite against a running development server. All identities are disposable fixtures. */
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
const base=process.env.TEST_ORIGIN??'http://localhost:8080',authOrigin=process.env.TEST_AUTH_ORIGIN??base;
let groups=0;const pass=name=>{groups++;console.log('PASS '+name);};
async function call(token,name,data){const r=await fetch(`${base}/api/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)});return {status:r.status,...await r.json()};}
async function ok(who,name,data){const r=await call(who?.token??who,name,data);assert.equal(r.error,undefined,`${name}: ${r.error?.message}`);return r.result;}
async function denied(who,name,data){const r=await call(who?.token??who,name,data);assert.ok(r.error,`${name} should reject`);return r;}
async function auth(path,body,token,cookie){const response=await fixtureAuthFetch(`${base}/api/auth/${path}`,{method:'POST',headers:{'content-type':'application/json',origin:authOrigin,...(token?{authorization:`Bearer ${token}`}:{}) ,...(cookie?{cookie}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});return {response,body:await response.json(),token:response.headers.get('set-auth-token'),cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
async function signup(name,birthday,email){const password=randomBytes(16).toString('hex'),address=email??`identity-${randomBytes(7).toString('hex')}@example.test`;const r=await auth('sign-up/email',{name,email:address,password});assert.equal(r.response.status,200,JSON.stringify(r.body));const token=r.token??r.body.token;assert.ok(token,'Local tests require email verification to be optional (production is required by default).');const p=(await ok(token,'bootstrap')).profile;await ok(token,'confirmMinimumAge',birthday);return {token,id:r.body.user.id,handle:p.handle,password,email:address};}
const stamp=Date.now().toString(36);
const owner=await signup('Identity Owner '+stamp,{year:1990,month:1,day:1},process.env.TEST_ADMIN_EMAIL??`identity-owner-${stamp}@example.test`);
const teen=await signup('Identity Teen '+stamp,{year:2012,month:1,day:1});
const olderTeen=await signup('Identity Older '+stamp,{year:2009,month:1,day:1});
await denied(owner,'adminSetVerified',{userId:teen.id,verified:true});
assert.equal((await ok(owner,'getIdentityDashboard')).isAdmin,false,'An unverified allowlisted email is never administrator');pass('unverified email cannot acquire administrator privileges');
await ok(teen,'updateSettings',{ageConfirmed:true});assert.equal((await ok(teen,'getMe')).profile.ageConfirmed,false);
await ok(teen,'confirmMinimumAge',{year:1990,month:1,day:1});assert.equal((await ok(teen,'getIdentityDashboard')).ageBand,'13–15','Birthday cannot be changed to raise eligibility');
const community16=await ok(owner,'createCommunity',{name:`Identity 16 ${stamp}`,tagline:'Security fixture',description:'Age gate verification',category:'Art',visibility:'public',ageGate:16,rules:'Be kind.'});
const community18=await ok(owner,'createCommunity',{name:`Identity 18 ${stamp}`,tagline:'Security fixture',description:'Age gate verification',category:'Art',visibility:'public',ageGate:18,rules:'Be kind.'});
const post16=await ok(owner,'createPost',{slug:community16.id,type:'blog',title:'Age gate fixture',body:'Benign content.'});
for(const who of [null,teen]){assert.equal((await ok(who,'getCommunityPage',{slug:community16.id})).locked,true);await denied(who,'getPostPage',{slug:community16.id,postId:post16.id});}
await denied(teen,'joinCommunity',{slug:community16.id});await ok(olderTeen,'joinCommunity',{slug:community16.id});await denied(olderTeen,'joinCommunity',{slug:community18.id});
assert.ok(!(await ok(null,'homeFeed')).featured.some(p=>p.id===post16.id));assert.ok(!(await ok(teen,'homeFeed')).latest.some(p=>p.id===post16.id));pass('13/16/18 eligibility is server controlled across community, post, feed and join reads');
await denied(owner,'openDm',teen.id);await ok(owner,'toggleFollowProfile',teen.id);await ok(teen,'toggleFollowProfile',owner.id);
await ok(owner,'updateSettings',{dmPrivacy:'everyone'});await ok(teen,'updateSettings',{dmPrivacy:'everyone'});
const dm=await ok(owner,'openDm',teen.id);await ok(owner,'sendMessage',{roomId:dm.roomId,body:'A safe mutual conversation'});
await denied(teen,'updateIdentityPreferences',{sensitiveContent:'show'});await ok(teen,'updateIdentityPreferences',{restrictedMode:true});assert.equal((await ok(teen,'getIdentityDashboard')).preferences.restrictedMode,true);pass('teen DMs require mutual follows and sensitive controls cannot be bypassed');
const chosen=`chosen-${stamp}`;await ok(teen,'updateIdentityPreferences',{handle:chosen,language:'fr',socialLinks:[{label:'Portfolio',url:'https://example.com'}],hideFollowers:true,searchVisible:false,mentionPrivacy:'none',invitePrivacy:'none'});
const teenPreferences=(await ok(teen,'getIdentityDashboard')).preferences;assert.equal(teenPreferences.handle,chosen);assert.equal(teenPreferences.socialLinks.length,1);assert.equal(teenPreferences.language,'fr');await denied(owner,'updateIdentityPreferences',{handle:chosen});assert.equal((await ok(owner,'searchPeople',chosen)).length,0);assert.equal((await ok(owner,'listFollows',{handle:chosen,kind:'followers'})).length,0);pass('chosen usernames, duplicate rejection, links, language and follower/search privacy');
await ok(owner,'setPersonRelationship',{targetHandle:chosen,kind:'mute',enabled:true});assert.ok((await ok(owner,'getIdentityDashboard')).muted.some(p=>p.handle===chosen));await ok(owner,'setPersonRelationship',{targetHandle:chosen,kind:'mute',enabled:false});assert.ok(!(await ok(owner,'getIdentityDashboard')).muted.some(p=>p.handle===chosen));await ok(owner,'setPersonRelationship',{targetHandle:chosen,kind:'restrict',enabled:true});await denied(teen,'sendMessage',{roomId:dm.roomId,body:'Restricted test'});pass('muted list can unmute and restriction revokes direct contact');
const second=await auth('sign-in/email',{email:owner.email,password:owner.password});assert.ok(second.token);const sessions=(await ok(owner,'getIdentityDashboard')).sessions;const session=await fixtureAuthFetch(`${base}/api/auth/get-session`,{headers:{authorization:`Bearer ${second.token}`}});const sessionId=(await session.json()).session.id;assert.ok(sessions.some(s=>s.id===sessionId));await ok(owner,'revokeIdentitySession',sessionId);assert.equal((await denied(second.token,'getMe')).status,401);pass('device sessions can be listed and revoked immediately');
function totp(uri){const secret=new URL(uri).searchParams.get('secret');let bits='';for(const c of secret.toUpperCase())bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from((bits.match(/.{8}/g)??[]).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest();const offset=hash[19]&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
const setup=await auth('two-factor/enable',{password:owner.password},owner.token);assert.equal(setup.response.status,200,JSON.stringify(setup.body));assert.ok(setup.body.totpURI.startsWith('otpauth://'));assert.equal(setup.body.backupCodes.length,10);
const verify=await auth('two-factor/verify-totp',{code:totp(setup.body.totpURI)},owner.token);assert.equal(verify.response.status,200,JSON.stringify(verify.body));owner.token=verify.token??verify.body.token??owner.token;assert.equal((await ok(owner,'getIdentityDashboard')).twoFactorEnabled,true);
const challenge=await auth('sign-in/email',{email:owner.email,password:owner.password});assert.equal(challenge.body.twoFactorRedirect,true);assert.equal(challenge.token,null);
const completed=await auth('two-factor/verify-backup-code',{code:setup.body.backupCodes[0]},null,challenge.cookie);assert.equal(completed.response.status,200,JSON.stringify(completed.body));assert.ok(completed.token??completed.body.token);
const challenge2=await auth('sign-in/email',{email:owner.email,password:owner.password});const reused=await auth('two-factor/verify-backup-code',{code:setup.body.backupCodes[0]},null,challenge2.cookie);assert.notEqual(reused.response.status,200,'Backup code is single use');pass('real TOTP setup, sign-in challenge and one-use backup code');
const capabilities=await ok(null,'getSignInCapabilities');
for(const provider of ['google','apple']){
  assert.equal(typeof capabilities[provider],'boolean');
  if(!capabilities[provider])await denied(null,'beginMobileOAuth',provider);
}
assert.equal(typeof capabilities.phone,'boolean');assert.ok(capabilities.captchaSiteKey===null||typeof capabilities.captchaSiteKey==='string');
await denied(null,'finishMobileOAuth',{flowId:'invalid-flow-12345678901234567890',verifier:'invalid-verifier-12345678901234567890',callbackProof:'invalid-proof-12345678901234567890'});
assert.equal((await fetch(`${base}/api/v1/auth/mobile-start?flow=nonexistent`)).status,400);
assert.equal((await fetch(`${base}/api/v1/auth/mobile-callback?flow=nonexistent`)).status,401);
pass('configured sign-in capabilities and invalid native handoffs fail closed');
await ok(teen,'updateIdentityPreferences',{tutorialComplete:true});assert.equal((await ok(teen,'getIdentityDashboard')).preferences.tutorialComplete,true);pass('welcome tour completion persists');
console.log(`${groups} IDENTITY SECURITY GROUPS PASSED`);
