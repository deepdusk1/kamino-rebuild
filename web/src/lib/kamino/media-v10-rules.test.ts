import test from "node:test";
import assert from "node:assert/strict";
import { articleWithImages, readStoryLayers, storyLayersSchema, moderationTextSegments } from "./media-v10-rules.ts";
import { scanText } from "./safety.ts";
const layer={id:"one",kind:"text",text:"Welcome",x:50,y:50,scale:1,rotation:0,color:"#ffffff",backdrop:true};
test("story layers preserve their order and reject out-of-bounds or unsafe representations",()=>{
  assert.deepEqual(readStoryLayers(JSON.stringify([layer])),[layer]);
  for(const change of [{x:-1},{y:120},{scale:5},{rotation:181},{color:"url(javascript:alert(1))"},{text:""},{id:"../../"},{x:Infinity}])
    assert.equal(storyLayersSchema.safeParse([{...layer,...change}]).success,false);
  assert.equal(storyLayersSchema.safeParse(Array.from({length:13},(_,i)=>({...layer,id:`layer-${i}`}))).success,false);
  assert.equal(storyLayersSchema.safeParse([layer,layer]).success,false);
  assert.deepEqual(readStoryLayers("{broken"),[]);
});
test("mentions and stickers cannot carry arbitrary markup or URLs",()=>{
  assert.equal(storyLayersSchema.safeParse([{...layer,kind:"mention",text:"member_name"}]).success,true);
  assert.equal(storyLayersSchema.safeParse([{...layer,kind:"mention",text:"../../admin"}]).success,false);
  assert.equal(storyLayersSchema.safeParse([{...layer,kind:"sticker",text:"✨"}]).success,true);
  assert.equal(storyLayersSchema.safeParse([{...layer,kind:"sticker",text:"<script>"}]).success,false);
});
test("multi-image article markers keep their position, duplicate references and safe alt text",()=>{
  const body=articleWithImages("Before\n[image:2]\nBetween\n[image:1]\n[image:1]",[{id:51,altText:"One](/evil)\n\\"},{id:52,altText:"Two"},{id:53,altText:"Unplaced"}]);
  assert.ok(body.indexOf("/52)")<body.indexOf("Between"));
  assert.equal(body.split("/51)").length-1,2);
  assert.ok(body.endsWith("![Unplaced](/api/v1/content-media/53)"));
  assert.ok(!body.includes("[image:"));
  assert.ok(!body.includes("](/evil)"));
});
test("long articles pass the text guard without dropping checks across segment boundaries",()=>{
  assert.ok(moderationTextSegments("A harmless long article. ".repeat(1000)).every(segment=>scanText(segment)===null));
  const text="a".repeat(6490)+" send me underage nudes "+"x".repeat(18000);
  assert.ok(moderationTextSegments(text).some(segment=>scanText(segment)!==null));
  assert.ok(moderationTextSegments(text).every(segment=>segment.length<=7500));
});
