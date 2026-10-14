import assert from "node:assert/strict";
import { chromium } from "playwright";
const base=process.env.TEST_ORIGIN??"http://localhost:8085";
if(!["localhost","127.0.0.1","::1"].includes(new URL(base).hostname))throw new Error("Media fixtures run on loopback only.");
const GIF="data:image/gif;base64,R0lGODlhBAAEAIEAAHVI3wAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQADwAAACwAAAAABAAEAAAICQABCBxIsCCAgAAh+QQBDwABACwAAAAABAAEAIFDKXkAAAAAAAAAAAAICQABCBxIsCCAgAA7";
const PNG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0t0AAAAASUVORK5CYII=";
function audioFixture(){const wav=Buffer.alloc(1644);wav.write("RIFF",0);wav.writeUInt32LE(1636,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(1600,40);return `data:audio/wav;base64,${wav.toString("base64")}`;}
async function videoFixture(){
  const browser=await chromium.launch({headless:true});
  try{const page=await browser.newPage();return await page.evaluate(async()=>{
    const canvas=document.createElement("canvas");canvas.width=180;canvas.height=320;
    const context=canvas.getContext("2d");context.fillStyle="#5a3baf";context.fillRect(0,0,180,320);context.fillStyle="#ffffff";context.font="18px sans-serif";context.fillText("Kamino media test",14,160);
    const chunks=[],stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8"});
    const done=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=async()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:"video/webm"}));};});
    let frame=0;const paint=setInterval(()=>{context.fillStyle=frame++%2?"#7548df":"#432979";context.fillRect(0,0,180,320);context.fillStyle="#fff";context.fillText("Kamino media test",14,160);},100);recorder.start();await new Promise(resolve=>setTimeout(resolve,850));clearInterval(paint);recorder.stop();stream.getTracks().forEach(track=>track.stop());return await done;
  });}finally{await browser.close();}
}
export async function verifyMediaV10({owner,member,community}){
  let count=0;const pass=name=>console.log(`PASS media-v10 ${++count} ${name}`);
  async function call(who,name,data){const response=await fetch(`${base}/api/v1/rpc/${name}`,{method:"POST",headers:{"content-type":"application/json",...(who?.token?{authorization:`Bearer ${who.token}`}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)});return await response.json();}
  async function ok(who,name,data){const result=await call(who,name,data);assert.equal(result.error,undefined,`${name}: ${result.error?.message}`);return result.result;}
  async function no(who,name,data){assert.ok((await call(who,name,data)).error,`${name} must refuse`);}
  await no(null,"searchMediaLibrary",{kind:"gif"});
  await no(owner,"saveMediaLibraryItem",{kind:"gif",title:"No rights",dataUrl:GIF,filename:"test.gif",rightsConfirmed:false});
  await no(owner,"saveMediaLibraryItem",{kind:"gif",title:"Wrong bytes",dataUrl:"data:image/gif;base64,YmFk",filename:"test.gif",rightsConfirmed:true});
  const gif=await ok(owner,"saveMediaLibraryItem",{kind:"gif",title:"Happy studio",tags:"celebration media-check",dataUrl:GIF,filename:"studio.gif",altText:"A synthetic GIF fixture",rightsConfirmed:true});
  assert.ok((await ok(owner,"searchMediaLibrary",{kind:"gif",query:"media-check"})).items.some(item=>item.id===gif.id));
  assert.equal((await ok(owner,"getMediaLibraryFile",{libraryId:gif.id})).dataUrl,GIF);
  assert.ok(!(await ok(member,"searchMediaLibrary",{kind:"gif",query:"media-check"})).items.some(item=>item.id===gif.id));
  await no(member,"getMediaLibraryFile",{libraryId:gif.id});await no(member,"deleteMediaLibraryItem",{libraryId:gif.id});
  assert.equal((await fetch(`${base}/api/v1/library-media/${gif.id}`)).status,404);
  pass("GIF picker search, original bytes, rights, MIME and private playback boundaries");
  const selected=await ok(owner,"getMediaLibraryFile",{libraryId:gif.id});
  const copy=await ok(owner,"createMediaPost",{slug:community.id,kind:"gif",title:"Library copy",media:{kind:"gif",dataUrl:selected.dataUrl,filename:selected.filename,altText:selected.altText}});
  const copiedTools=await ok(member,"postContentTools",{postId:copy.id});
  await ok(owner,"deleteMediaLibraryItem",{libraryId:gif.id});await no(owner,"getMediaLibraryFile",{libraryId:gif.id});
  assert.equal((await ok(member,"getContentMedia",{mediaId:copiedTools.media[0].id})).dataUrl,GIF);
  pass("removing a library file keeps already published media copies usable");
  await no(member,"saveMediaLibraryItem",{kind:"audio",title:"Unauthorized catalog",dataUrl:audioFixture(),filename:"music.wav",rightsConfirmed:true,licensed:true,licenseUrl:"https://example.test/license"});
  const catalog=await ok(owner,"saveMediaLibraryItem",{kind:"audio",title:"Synthetic music catalog fixture",dataUrl:audioFixture(),filename:"catalog.wav",rightsConfirmed:true,licensed:true,licenseUrl:"https://example.test/license"});
  assert.equal((await ok(member,"searchMediaLibrary",{kind:"audio",query:"Synthetic music catalog"})).items.find(item=>item.id===catalog.id).licensed,true);
  assert.equal((await ok(member,"getMediaLibraryFile",{libraryId:catalog.id})).dataUrl,audioFixture());
  await ok(owner,"deleteMediaLibraryItem",{libraryId:catalog.id});await no(member,"getMediaLibraryFile",{libraryId:catalog.id});
  pass("only a verified administrator can publish licensed catalog entries; withdrawal revokes library playback");
  const layers=[{id:"layer-first",kind:"text",text:"Placed with care",x:25,y:30,scale:1.4,rotation:-15,color:"#ffffff",backdrop:true},{id:"layer-second",kind:"sticker",text:"✨",x:75,y:65,scale:.8,rotation:20,color:"#ffdd55",backdrop:false}];
  const soundtrack=audioFixture();
  const story=await ok(owner,"publishProfileStory",{caption:"Layered story fixture",layers,media:{kind:"gif",dataUrl:GIF,filename:"layered.gif"},music:{kind:"audio",dataUrl:soundtrack,filename:"soundtrack.wav",altText:"A synthetic silent soundtrack"}});
  assert.deepEqual((await ok(member,"getProfileStories",{userId:owner.id})).stories.find(item=>item.id===story.id).layers,layers);
  await no(owner,"publishProfileStory",{caption:"Invalid",layers:[{...layers[0],x:1000}]});
  await no(owner,"publishProfileStory",{caption:"Invalid",layers:[{...layers[0],kind:"sticker",text:"<script>"}]});
  assert.equal((await ok(member,"getProfileStoryMedia",{storyId:story.id,track:"music"})).dataUrl,soundtrack);
  const musicUrl=(await ok(member,"getProfileStories",{userId:owner.id})).stories.find(item=>item.id===story.id).music.url;
  const partial=await fetch(`${base}${musicUrl}`,{headers:{authorization:`Bearer ${member.token}`,range:"bytes=0-11"}});assert.equal(partial.status,206);assert.equal(Buffer.from(await partial.arrayBuffer()).toString("ascii",0,4),"RIFF");
  await ok(owner,"blockUser",member.id);await no(member,"getProfileStoryMedia",{storyId:story.id,track:"music"});await ok(owner,"blockUser",member.id);
  pass("story layers persist placement, scale, rotation and ordering; invalid layers are rejected");
  pass("photo stories keep a separate bounded soundtrack with the same media ACL and byte-range playback");
  const article=await ok(owner,"createMediaPost",{slug:community.id,kind:"article",title:"Six image article",body:"Opening paragraph\n\n[image:2]\n\nMiddle\n\n[image:1]",images:Array.from({length:6},(_,i)=>({kind:"image",dataUrl:PNG,filename:`image-${i+1}.png`,altText:`Image ${i+1}`}))});
  const articlePage=await ok(member,"getPostPage",{slug:community.id,postId:article.id});
  const urls=[...articlePage.post.body.matchAll(/\/api\/v1\/content-media\/(\d+)/g)].map(match=>Number(match[1]));
  assert.equal(urls.length,6);assert.equal(new Set(urls).size,6);assert.ok(articlePage.post.body.indexOf("![Image 2]")<articlePage.post.body.indexOf("Middle"));
  for(const mediaId of urls)assert.equal((await ok(member,"getContentMedia",{mediaId})).dataUrl,PNG);
  await no(owner,"createMediaPost",{slug:community.id,kind:"article",title:"Too many images",images:Array.from({length:7},()=>({kind:"image",dataUrl:PNG,filename:"image.png"}))});
  pass("six ordered image blocks render through protected media URLs with author descriptions");
  const clip=await ok(owner,"createMediaPost",{slug:community.id,kind:"short",title:"Vertical studio clip",body:"A locally generated clip, without people or external content.",media:{kind:"short",dataUrl:await videoFixture(),filename:"fixture.webm",captions:"WEBVTT\n\n00:00.000 --> 00:01.000\nA purple canvas"}});
  const feed=await ok(member,"shortVideoFeed",{slug:community.id});assert.ok(feed.items.some(item=>item.id===clip.id));
  await ok(member,"setPostPersonal",{postId:clip.id,muted:true});assert.ok(!(await ok(member,"shortVideoFeed",{slug:community.id})).items.some(item=>item.id===clip.id));
  await ok(member,"setPostPersonal",{postId:clip.id,muted:false});
  const note=await ok(owner,"createMediaPost",{slug:community.id,kind:"short",title:"Content-note clip",contentWarning:"Flashing lights",media:{kind:"short",dataUrl:await videoFixture(),filename:"noted.webm"}});
  await ok(member,"updateIdentityPreferences",{sensitiveContent:"hide"});assert.ok(!(await ok(member,"shortVideoFeed",{slug:community.id})).items.some(item=>item.id===note.id));
  await ok(member,"updateIdentityPreferences",{sensitiveContent:"blur"});assert.equal((await ok(member,"shortVideoFeed",{slug:community.id})).items.find(item=>item.id===note.id).blur,true);
  pass("short feed uses playable local video and honours mute, sensitive hiding and reveal preferences");
  console.log(`Media v10 integration: ${count} groups passed`);
  return {article,clip,story};
}
