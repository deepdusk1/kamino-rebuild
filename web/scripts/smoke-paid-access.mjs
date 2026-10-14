/** Local-only legacy API authorization fixture. No checkout, charge or provider call is made.
 * 1. With a running local test app: node scripts/smoke-paid-access.mjs prepare
 * 2. Stop that app; KAMINO_TEST_DATA_DIR=.test-v9-data node scripts/smoke-paid-access.mjs seed
 * 3. Restart the same app; node scripts/smoke-paid-access.mjs check
 * Never open an embedded data directory while its app process is running.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink, realpath } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),fixturePath=resolve(root,'.test-paid-api-fixture.json');
const base=process.env.TEST_ORIGIN??'http://localhost:8085';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'This fixture only targets a local test app');
async function call(who,name,data){const r=await fetch(`${base}/api/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',...(who?{authorization:`Bearer ${who.token??who}`}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)});return {status:r.status,...await r.json()};}
async function ok(who,name,data){const r=await call(who,name,data);assert.equal(r.error,undefined,`${name}: ${r.error?.message}`);return r.result;}
async function denied(who,name,data){const r=await call(who,name,data);assert.ok(r.error,`${name} must reject missing/expired/incorrect entitlement`);}
async function signup(label){const email=`paid-${label}-${randomBytes(6).toString('hex')}@example.test`;const response=await fetch(`${base}/api/auth/sign-up/email`,{method:'POST',headers:{'content-type':'application/json',origin:process.env.TEST_AUTH_ORIGIN??base},body:JSON.stringify({name:`Paid QA ${label}`,email,password:randomBytes(16).toString('hex')})});const body=await response.json(),token=response.headers.get('set-auth-token')??body.token;assert.equal(response.status,200,JSON.stringify(body));assert.ok(token,'Local fixture signup requires optional email verification');await ok(token,'bootstrap');await ok(token,'confirmMinimumAge',{year:1990,month:1,day:1});return {id:body.user.id,token};}
const phase=process.argv[2];
if(phase==='prepare'){
  const owner=await signup('owner'),buyer=await signup('buyer'),outsider=await signup('outsider'),moderator=await signup('moderator');
  const stamp=Date.now().toString(36),community=await ok(owner,'createCommunity',{name:`Paid QA community ${stamp}`,category:'Art',tagline:'Disposable local fixture',description:'Authorization regression',visibility:'public',ageGate:13,rules:'Be kind.'});
  const free=await ok(owner,'createCommunity',{name:`Paid QA free ${stamp}`,category:'Art',tagline:'Disposable local fixture',description:'Authorization regression',visibility:'public',ageGate:13,rules:'Be kind.'});
  for(const who of [buyer,outsider,moderator])for(const c of [community,free])await ok(who,'joinCommunity',{slug:c.id});
  for(const c of [community,free])await ok(owner,'setMemberRole',{slug:c.id,userId:moderator.id,action:'curator'});
  const post=await ok(owner,'createMediaPost',{slug:free.id,kind:'gif',title:'Paid QA exclusive fixture',body:'Subscriber-only post preview.',media:{kind:'gif',filename:'fixture.gif',dataUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}});
  const postMedia=(await ok(owner,'postContentTools',{postId:post.id})).media[0].id;
  const copy=await ok(owner,'repost',{slug:free.id,postId:post.id});
  const freePost=await ok(owner,'createPost',{slug:free.id,type:'blog',title:'Paid QA free fixture',body:'A normal free post.'});
  const communityPost=await ok(owner,'createPost',{slug:community.id,type:'blog',title:'Paid QA community fixture',body:'Protected community content.'});
  const room=await ok(owner,'createRoom',{slug:free.id,name:'Paid QA subscriber room',kind:'private'});
  // Buyer deliberately is not invited: its scoped entitlement must fulfill private-room entry.
  for(const who of [outsider,moderator]){const profile=(await ok(who,'getMe')).profile;await ok(owner,'inviteToRoom',{roomId:room.id,handle:profile.handle});}
  await ok(owner,'sendMessage',{roomId:room.id,body:'Subscriber-only chat text.'});
  const file=await ok(owner,'sendChatAttachment',{roomId:room.id,media:{kind:'file',filename:'fixture.pdf',dataUrl:`data:application/pdf;base64,${Buffer.from('%PDF-1.4\nPrivate fixture\n%%EOF').toString('base64')}`}});
  const chatMedia=(await ok(owner,'chatContentTools',{roomId:room.id})).attachments.find(a=>a.messageId===file.id).id;
  const event=await ok(owner,'saveExpandedEvent',{slug:free.id,title:'Paid QA event fixture',body:'Subscriber-only event details.',startsAt:new Date(Date.now()+3600000).toISOString(),onlineUrl:'https://example.test/private-event',createChat:true});
  const eventRoom=(await ok(owner,'listExpandedEvents',free.id)).events.find(e=>e.id===event.id).chatRoomId;
  for(const who of [buyer,outsider])await ok(who,'toggleFavorite',post.id);
  const offer=await ok(owner,'saveCreatorOffer',{kind:'membership',title:'Paid QA scope fixture',description:'No payment is made',priceMinor:500,published:true,communityId:community.id});
  const otherOffer=await ok(owner,'saveCreatorOffer',{kind:'membership',title:'Paid QA unrelated offer',priceMinor:500});
  await writeFile(fixturePath,JSON.stringify({owner,buyer,outsider,moderator,community:community.id,free:free.id,post:post.id,postMedia,copy:copy.id,freePost:freePost.id,communityPost:communityPost.id,room:room.id,chatMedia,event:event.id,eventRoom,offer:offer.id,otherOffer:otherOffer.id}));
  console.log('PAID ACCESS FIXTURE PREPARED; stop the local app before seed phase');
}else if(phase==='seed'){
  assert.ok(process.env.KAMINO_TEST_DATA_DIR,'Explicit KAMINO_TEST_DATA_DIR is required');
  const directory=await realpath(resolve(root,process.env.KAMINO_TEST_DATA_DIR));
  assert.ok(!relative(root,directory).startsWith('..')&&basename(directory).startsWith('.test-'),'Only an isolated .test-* directory inside this workspace is permitted');
  const f=JSON.parse(await readFile(fixturePath,'utf8')),{PGlite}=await import('@electric-sql/pglite');
  const pg=new PGlite({dataDir:directory});await pg.waitReady;
  try{
    const source=(await pg.query('select created_by,name from communities where id=$1',[f.community])).rows[0];
    assert.equal(source?.created_by,f.owner.id);assert.ok(String(source?.name).startsWith('Paid QA community'));
    for(const [kind,id,communityId] of [['community',f.community,f.community],['post',String(f.post),f.free],['chat',String(f.room),f.free],['event',String(f.event),f.free]])
      await pg.query('insert into billing_resource_requirements(resource_kind,resource_id,offer_id,owner_id,community_id) values($1,$2,$3,$4,$5) on conflict(resource_kind,resource_id) do update set offer_id=excluded.offer_id',[kind,id,f.offer,f.owner.id,communityId]);
    for(const [label,beneficiary,offer,expiry] of [['buyer',f.buyer.id,f.offer,new Date(Date.now()+86400000)],['outsider-expired',f.outsider.id,f.offer,new Date(Date.now()-86400000)],['outsider-wrong-offer',f.outsider.id,f.otherOffer,new Date(Date.now()+86400000)]]){
      const order=`paid-qa-${f.community}-${label}`;
      await pg.query(`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode,status,test_mode)
        values($1,$2,$2,$3,$4,'membership','Disposable local access fixture',500,'usd','subscription','paid',true) on conflict(id) do nothing`,[order,beneficiary,offer,f.owner.id]);
      await pg.query(`insert into billing_entitlements(order_id,beneficiary_id,offer_id,state,expires_at,test_mode) values($1,$2,$3,'active',$4,true) on conflict(order_id) do nothing`,[order,beneficiary,offer,expiry.toISOString()]);
    }
    console.log('TEST ENTITLEMENTS SEEDED; restart the same local app before check phase');
  }finally{await pg.close();}
}else if(phase==='check'){
  const f=JSON.parse(await readFile(fixturePath,'utf8'));
  for(const who of [null,f.outsider]){
    for(const postId of [f.post,f.copy])await denied(who,'getPostPage',{slug:f.free,postId});
    await denied(who,'getPostPage',{slug:f.community,postId:f.communityPost});
    assert.equal((await ok(who,'getCommunityPage',{slug:f.community})).locked,true);
    const feed=await ok(who,'homeFeed');assert.ok(![...feed.latest,...feed.featured].some(post=>[f.post,f.copy,f.communityPost].includes(post.id)));
    await ok(who,'getPostPage',{slug:f.free,postId:f.freePost});
    await denied(who,'getContentMedia',{mediaId:f.postMedia});
    assert.ok(!(await ok(who,'listEvents',f.free)).events.some(event=>event.id===f.event));
    assert.ok(!(await ok(who,'listExpandedEvents',f.free)).events.some(event=>event.id===f.event));
    await denied(who,'getEventCalendar',{slug:f.free,id:f.event});
  }
  for(const who of [f.buyer,f.owner,f.moderator]){
    for(const postId of [f.post,f.copy])await ok(who,'getPostPage',{slug:f.free,postId});
    await ok(who,'getPostPage',{slug:f.community,postId:f.communityPost});
    assert.equal((await ok(who,'getCommunityPage',{slug:f.community})).locked,false);
    await ok(who,'getRoom',{roomId:f.room});
    await ok(who,'getContentMedia',{mediaId:f.postMedia});
    await ok(who,'getContentMedia',{mediaId:f.chatMedia});
    await ok(who,'getRoom',{roomId:f.eventRoom});
    assert.ok((await ok(who,'getEventCalendar',{slug:f.free,id:f.event})).content.includes('Subscriber-only event details.'));
  }
  assert.ok(!(await ok(f.outsider,'listFavorites')).some(post=>post.id===f.post));
  assert.ok(!(await ok(f.outsider,'listRooms')).some(room=>room.id===f.room));
  await denied(f.outsider,'getRoom',{roomId:f.room});await denied(f.outsider,'sendMessage',{roomId:f.room,body:'Unpaid request'});
  await denied(f.outsider,'getContentMedia',{mediaId:f.chatMedia});
  await denied(f.outsider,'getRoom',{roomId:f.eventRoom});
  await denied(f.outsider,'getLiveStage',{roomId:f.eventRoom});
  await denied(f.outsider,'rsvpEvent',{slug:f.free,eventId:f.event});
  await denied(f.outsider,'respondExpandedEvent',{slug:f.free,id:f.event,response:'going'});
  await denied(f.outsider,'getEventAttendees',{slug:f.free,id:f.event});
  await ok(f.buyer,'respondExpandedEvent',{slug:f.free,id:f.event,response:'going'});
  assert.ok(!(await ok(f.outsider,'listRooms')).some(room=>room.id===f.eventRoom));
  await denied(f.outsider,'repost',{slug:f.free,postId:f.post});await denied(f.buyer,'repost',{slug:f.free,postId:f.post});
  const catalog=await ok(f.outsider,'getMarketplace');assert.ok(catalog.offers.some(offer=>Number(offer.id)===f.offer),'Paid community offer remains discoverable before subscription');
  console.log('PAID ACCESS LEGACY API GROUPS PASSED: scopes/expiry, community/post/repost/feed/media/files/private-room fulfillment/favorites/events/calendar/RSVP/linked room, owner/moderator exceptions and catalog');
  await unlink(fixturePath);
}else throw new Error('Choose prepare, seed or check');
