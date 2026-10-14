import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base=process.env.TEST_ORIGIN??'http://localhost:8085';
if(!['localhost','127.0.0.1','::1'].includes(new URL(base).hostname))throw new Error('Billing fixtures run on loopback only.');
let token='';
async function call(name,data){const r=await fetch(`${base}/api/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({data})});return await r.json();}
async function ok(name,data){const r=await call(name,data);assert.equal(r.error,undefined,`${name}: ${r.error?.message}`);return r.result;}
async function no(name,data,pattern){const r=await call(name,data);assert.ok(r.error,`${name} must be denied`);if(pattern)assert.match(r.error.message,pattern);}
const signup=await fetch(`${base}/api/auth/sign-up/email`,{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({name:'Billing UI fixture',email:`billing-ui-${randomBytes(7).toString('hex')}@example.test`,password:randomBytes(20).toString('hex')})});assert.equal(signup.status,200);const account=await signup.json();token=signup.headers.get('set-auth-token')??account.token;
const profile=(await ok('bootstrap')).profile;await ok('confirmMinimumAge',{year:1990,month:1,day:1});
const status=await ok('getBillingStatus');assert.equal(status.enabled,false);assert.equal(status.mode,'disabled');assert.equal(status.mobilePaymentsEnabled,false);assert.equal(status.creatorPayoutsEnabled,false);
const community=await ok('createCommunity',{name:`Billing UI ${Date.now()}`,category:'Art',visibility:'public',ageGate:13,tagline:'Isolated fixture',description:'Local test only',rules:'Be kind.'});
const post=await ok('createPost',{slug:community.id,title:'Owned access item',body:'An owned test post',type:'blog'});
const offer=await ok('saveCreatorOffer',{kind:'membership',communityId:community.id,title:'Test membership',priceMinor:500,published:true});
const choices=await ok('getPaidResourceChoices');assert.ok(choices.resources.some(r=>r.kind==='community'&&r.resourceId===community.id));assert.ok(choices.resources.some(r=>r.kind==='post'&&r.resourceId===String(post.id)));assert.ok(choices.offers.some(o=>o.id===offer.id&&o.published));
await no('setPaidResource',{kind:'community',resourceId:community.id,offerId:offer.id},/disabled/i);await no('createStripeCheckout',{offerId:offer.id},/disabled/i);await no('requestCheckout',{offerId:offer.id},/disabled/i);
await ok('setSupporterBadgeVisibility',{visible:true});assert.equal((await ok('getMyBilling')).showSupporterBadges,true);assert.deepEqual((await ok('getProfileIdentity',profile.handle)).supporterBadges,[]);const allowance=await ok('getUploadAllowance');assert.equal(allowance.premium,false);assert.equal(allowance.animatedAvatar,false);assert.equal(allowance.limits.video,12_000_000);
await no('setAvatar',{dataUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='},/active Kamino/i);
const history=await ok('getMyBilling');assert.deepEqual(history.orders,[]);assert.deepEqual(history.entitlements,[]);assert.deepEqual(history.requirements,[]);
const webhook=await fetch(`${base}/api/v1/billing/stripe-webhook`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(webhook.status,503);
console.log('PASS billing screen contracts, owned choices, disabled checkout/webhook/access mapping, optional badges and premium defaults; no orders, charges or provider calls');
