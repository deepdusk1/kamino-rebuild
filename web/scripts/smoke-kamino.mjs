import {fixtureAuthFetch} from "./fixture-auth.mjs";
import {runWithStartContext} from '@tanstack/start-storage-context';
import {serverFnFetcher} from '../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base=process.env.TEST_ORIGIN??'http://localhost:8080';
const moduleText=await (await fetch(base+'/src/lib/kamino/server.ts')).text();
const functions=new Map([...moduleText.matchAll(/export const (\w+) = createServerFn\(\{ method: "(GET|POST)" \}\)[\s\S]*?createClientRpc\("([^"]+)"\)/g)].map(m=>[m[1],{method:m[2],id:m[3]}]));
let token=''; let passed=0;
const pass=name=>{passed++;console.log('PASS '+name)};
async function rpc(name,data,auth=true){
  if(!functions.size){
    // Production does not expose Vite's source descriptors; exercise its supported API bridge instead.
    const response=await fetch(`${base}/api/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',origin:base,...(auth&&token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)});
    const body=await response.json();if(body.error)throw new Error(body.error.message);assert.equal(response.status,200,`${name}: ${response.status}`);return body.result;
  }
  const f=functions.get(name);assert.ok(f,`Function available: ${name}`);const r=await runWithStartContext({startOptions:{}},()=>serverFnFetcher(base+'/_serverFn/'+f.id,[{method:f.method,data,headers:{origin:base,'sec-fetch-site':'same-origin',...(auth&&token?{authorization:'Bearer '+token}:{})}}],fetch));if(r.error)throw r.error;return r.result??r;
}
async function signup(){const response=await fixtureAuthFetch(base+'/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({name:'QA Member',email:'qa-'+randomBytes(8).toString('hex')+'@example.test',password:randomBytes(20).toString('hex')})});const user=await response.json();assert.equal(response.status,200,JSON.stringify(user));token=user.token;await rpc('bootstrap');const age=await fetch(base+'/api/v1/rpc/confirmMinimumAge',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({data:{year:1990,month:1,day:1}})});assert.equal(age.status,200,'age check');return user}
assert.ok((await rpc('homeFeed')).communities.length);pass('public feed');
await assert.rejects(()=>rpc('getMe',undefined,false));pass('private reads require sign-in');
const account=await signup();const ownerToken=token;pass('email registration and session');
await rpc('joinCommunity',{slug:'starlight'});assert.ok((await rpc('getMe')).joined.some(c=>c.community.id==='starlight'));pass('join community');
const post=await rpc('createPost',{slug:'starlight',type:'quiz',title:'QA quiz',body:'Independent scoring',payload:{questions:[{q:'Two plus two?',choices:['3','4'],answer:1},{q:'Earth is a...',choices:['Planet','Star'],answer:0}]}});
const page=await rpc('getPostPage',{slug:'starlight',postId:post.id});assert.equal(page.post.payload.questions[0].answer,-1);
await assert.rejects(()=>rpc('submitQuiz',{postId:post.id,answers:[1,0]}),/Start the quiz first/);
await rpc('startQuiz',{postId:post.id});
assert.equal((await rpc('submitQuiz',{postId:post.id,answers:[1,0]})).score,2);
const rep=(await rpc('getMe')).joined.find(c=>c.community.id==='starlight').rep;
await rpc('submitQuiz',{postId:post.id,answers:[1,0]});assert.equal((await rpc('getMe')).joined.find(c=>c.community.id==='starlight').rep,rep);pass('quiz answers hidden, must start first, scoring correct, rewards once');
await assert.rejects(()=>rpc('createPost',{slug:'starlight',type:'quiz',title:'Invalid quiz',body:'',payload:{questions:[]}}));pass('invalid quiz rejected');
const poll=await rpc('createPost',{slug:'starlight',type:'poll',title:'QA poll',body:'Choose one',payload:{options:['Tea','Coffee']}});
await rpc('votePoll',{postId:poll.id,optionIndex:1});await assert.rejects(()=>rpc('votePoll',{postId:poll.id,optionIndex:9}));assert.equal((await rpc('getPostPage',{slug:'starlight',postId:poll.id})).poll.mine,1);pass('poll votes and invalid options');
await rpc('toggleLike',poll.id);await rpc('toggleFavorite',poll.id);const feed=await rpc('homeFeed');assert.equal(feed.latest.find(p=>p.id===poll.id).liked,true);assert.equal(feed.latest.find(p=>p.id===poll.id).saved,true);assert.ok((await rpc('listFavorites')).some(p=>p.id===poll.id));pass('likes and saved state persist');
await rpc('addComment',{postId:poll.id,body:'A friendly note'});assert.ok((await rpc('getPostPage',{slug:'starlight',postId:poll.id})).comments.some(c=>c.body==='A friendly note'));pass('comments');
await rpc('checkIn');assert.equal((await rpc('checkIn')).already,true);pass('daily check-in idempotent');
await rpc('updateSettings',{bio:'QA profile',mood:'Creative'});assert.equal((await rpc('getMe')).profile.bio,'QA profile');pass('profile settings');
const own=await rpc('createCommunity',{name:'QA private '+Date.now(),tagline:'Testing',description:'QA community',category:'Art',visibility:'private',ageGate:13,rules:'Be kind.'});
const room=await rpc('createRoom',{slug:own.id,name:'QA voice room',kind:'voice'});
const msg=await rpc('sendMessage',{roomId:room.id,body:'Hello community'});await rpc('editMessage',{roomId:room.id,messageId:msg.id,body:'Edited hello'});assert.ok((await rpc('getRoom',{roomId:room.id})).messages.some(m=>m.body==='Edited hello'));await assert.rejects(()=>rpc('sendMessage',{roomId:room.id,body:' '}));pass('private community, chat, message editing and validation');
const peer=account.user.id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64);const rtc=base+`/api/rtc?room=k-live-${room.id}&peer=${peer}&since=0`;
assert.equal((await fetch(rtc)).status,401);assert.equal((await fetch(rtc,{headers:{authorization:'Bearer '+token}})).status,200);assert.equal((await fetch(rtc.replace('peer='+peer,'peer=impostor'),{headers:{authorization:'Bearer '+token}})).status,403);pass('call signaling requires authorized identity');
await rpc('createEvent',{slug:own.id,title:'QA meetup',body:'An event',kind:'event',startsAt:new Date(Date.now()+86400000).toISOString()});const ev=(await rpc('listEvents',own.id)).events[0];await rpc('rsvpEvent',{slug:own.id,eventId:ev.id});assert.equal((await rpc('listEvents',own.id)).events[0].going,true);pass('events and RSVP');
const privatePost=await rpc('createPost',{slug:own.id,type:'blog',title:'Private test',body:'Members only.'});
const second=await signup();const secondToken=token;
await assert.rejects(()=>rpc('getPostPage',{slug:own.id,postId:privatePost.id}));await assert.rejects(()=>rpc('toggleFavorite',privatePost.id));await assert.rejects(()=>rpc('getRoom',{roomId:room.id}));pass('private posts, bookmarks and rooms deny outsiders');
await rpc('joinCommunity',{slug:own.id});token=ownerToken;await rpc('reviewJoin',{slug:own.id,userId:second.user.id,allow:true});const count=(await rpc('getCommunityPage',{slug:own.id})).community.memberCount;await rpc('reviewJoin',{slug:own.id,userId:second.user.id,allow:true});assert.equal((await rpc('getCommunityPage',{slug:own.id})).community.memberCount,count);pass('join approval is idempotent');
token=secondToken;await rpc('toggleFavorite',privatePost.id);await rpc('getRoom',{roomId:room.id});await rpc('leaveCommunity',own.id);assert.ok(!(await rpc('listFavorites')).some(p=>p.id===privatePost.id));await assert.rejects(()=>rpc('getRoom',{roomId:room.id}));pass('leaving revokes room and saved private-post access');
await rpc('joinCommunity',{slug:own.id});token=ownerToken;await rpc('reviewJoin',{slug:own.id,userId:second.user.id,allow:true});await rpc('setMemberRole',{slug:own.id,userId:second.user.id,action:'ban'});const n=(await rpc('getCommunityPage',{slug:own.id})).community.memberCount;await rpc('setMemberRole',{slug:own.id,userId:second.user.id,action:'ban'});assert.equal((await rpc('getCommunityPage',{slug:own.id})).community.memberCount,n);pass('repeated ban does not reduce member counts');
const me=await rpc('getMe');const handle=me.profile.handle;
const character=await rpc('saveCharacter',{name:'QA Explorer',fandom:'Original',bio:'A traveller.',appearance:'Blue coat.'});
assert.ok((await rpc('getPublicProfile',handle)).characters.some(c=>c.id===character.id));await rpc('deleteCharacter',character.id);pass('character creation and deletion');
const title=await rpc('createTitle',{slug:own.id,label:'Welcome crew',color:'#2ee6d6'});await rpc('grantTitle',{slug:own.id,userId:account.user.id,titleId:title.id});let profile=await rpc('getPublicProfile',handle);const granted=profile.titles.find(t=>t.titleId===title.id);assert.ok(granted);await rpc('pinTitle',granted.id);assert.equal((await rpc('getPublicProfile',handle)).featuredTitle.id,granted.id);pass('community titles, granting and pinning');
token=secondToken;await rpc('addWallPost',{handle,body:'Welcome to my wall'});token=ownerToken;profile=await rpc('getPublicProfile',handle);const wall=profile.wall.find(w=>w.body==='Welcome to my wall');assert.ok(wall);await rpc('toggleWallLike',wall.id);await rpc('deleteWallPost',wall.id);pass('wall posts, reactions and deletion');
await rpc('toggleFollowProfile',second.user.id);assert.ok((await rpc('listFollows',{handle,kind:'following'})).length);pass('profile following');
await rpc('addShared',{slug:own.id,title:'Reading list',url:'https://example.com',note:'QA link'});assert.ok((await rpc('listShared',own.id)).items.some(i=>i.title==='Reading list'));pass('shared community resources');
await rpc('sendBroadcast',{slug:own.id,body:'Welcome to the community'});assert.ok((await rpc('getCommunityPage',{slug:own.id})).broadcasts.some(b=>b.body==='Welcome to the community'));await rpc('setJoinQuestions',{slug:own.id,prompts:['What brings you here?']});assert.equal((await rpc('getCommunityPage',{slug:own.id})).joinQuestions.length,1);const invite=await rpc('createInvite',{slug:own.id,maxUses:2});assert.ok(invite.code.length>=20);pass('broadcasts, join questions, secure invitations');
const screening=await rpc('createRoom',{slug:own.id,name:'Watch party',kind:'screening'});await rpc('setWatchMedia',{roomId:screening.id,url:'https://example.com/video.mp4',title:'QA media'});assert.equal((await rpc('getRoom',{roomId:screening.id})).room.watchTitle,'QA media');pass('watch-party media persistence');
await assert.rejects(()=>rpc('repost',{slug:'starlight',postId:privatePost.id,note:'Private content'}));const imagePost=await rpc('createPost',{slug:own.id,type:'image',title:'Image test',body:'A pixel',cover:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='});assert.ok((await rpc('getPostPage',{slug:own.id,postId:imagePost.id})).post.cover.startsWith('data:image/png'));await rpc('editPost',{slug:own.id,postId:imagePost.id,title:'Updated image',body:'New caption'});await rpc('setPostFlags',{slug:own.id,postId:imagePost.id,commentsDisabled:true});await assert.rejects(()=>rpc('addComment',{postId:imagePost.id,body:'Closed'}));pass('image posts, editing, comment controls and private repost protection');
const exported=JSON.parse((await rpc('exportMyData')).json);assert.equal(exported.profile.user_id,account.user.id);assert.ok(exported.posts.length);pass('account data export');
console.log(`${passed} INTEGRATION GROUPS PASSED`);


