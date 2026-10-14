import assert from 'node:assert/strict';
const base=process.env.TEST_ORIGIN??'http://localhost:8085';
if(!['localhost','127.0.0.1','::1'].includes(new URL(base).hostname))throw Error('Semantic fixtures require loopback.');
export async function verifySearchV10({owner,member,community}){
 let count=0;const pass=t=>console.log('PASS semantic-v10 '+ ++count+' '+t);
 async function call(who,name,data){const r=await fetch(base+'/api/v1/rpc/'+name,{method:'POST',headers:{'content-type':'application/json',...(who?.token?{authorization:'Bearer '+who.token}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)});return r.json();}
 async function ok(who,name,data){const j=await call(who,name,data);assert.equal(j.error,undefined,`${name}: ${j.error?.message}`);return j.result;}
 async function no(who,name,data){assert.ok((await call(who,name,data)).error,name+' must refuse');}
 assert.equal((await ok(owner,'getSemanticStatusV10')).configured,true);
 await no(null,'semanticSearchV10',{query:'manga',consent:true});await no(member,'semanticSearchV10',{query:'manga',consent:false});await no(member,'indexSemanticContentV10',{consent:true});pass('authenticated search, explicit provider consent and administrator indexing');
 const draft=await ok(owner,'createPost',{slug:community.id,type:'blog',title:'Manga illustration workshop',body:'Manga drawing friends share illustration techniques.'});
 for(let i=0;i<20;i++){await ok(owner,'indexSemanticContentV10',{consent:true});if((await ok(owner,'getSemanticStatusV10')).pendingDocuments===0)break;}
 const query={query:'manga drawing',kind:'post',consent:true};
 assert.ok((await ok(member,'semanticSearchV10',query)).results.some(p=>p.id===String(draft.id)));pass('configured provider vectors return current authorized post matches');
 await no(member,'detectDuplicatePostsV10',{communityId:community.id,text:'Manga drawing proposal',consent:false});
 assert.ok((await ok(member,'detectDuplicatePostsV10',{communityId:community.id,text:'Manga drawing proposal',consent:true})).matches.some(p=>p.id===String(draft.id)));pass('duplicate finder compares readable posts and requires provider consent');
 await ok(member,'setDiscoveryFeedback',{targetType:'post',targetId:String(draft.id),preference:'hide'});
 assert.ok(!(await ok(member,'semanticSearchV10',query)).results.some(p=>p.id===String(draft.id)));await ok(member,'setDiscoveryFeedback',{targetType:'post',targetId:String(draft.id),preference:'clear'});
 await ok(member,'setPersonRelationship',{targetHandle:owner.handle,kind:'mute',enabled:true});assert.ok(!(await ok(member,'semanticSearchV10',query)).results.some(p=>p.id===String(draft.id)));await ok(member,'setPersonRelationship',{targetHandle:owner.handle,kind:'mute',enabled:false});pass('current hide and mute rules suppress vector matches');
 await ok(member,'updateIdentityPreferences',{interests:['anime','art']});
 await no(member,'setSemanticPersonalizationV10',{enabled:true,consent:false});
 await ok(member,'setSemanticPersonalizationV10',{enabled:true,consent:true});assert.equal((await ok(member,'semanticRecommendationsV10')).enabled,true);
 await ok(member,'resetDiscovery');assert.equal((await ok(member,'semanticRecommendationsV10')).enabled,false);pass('consented personalization stores vectors; reset removes them');
 await ok(owner,'setPlatformFlag',{key:'related_discovery',enabled:false,rolloutPercent:100});await no(member,'semanticSearchV10',query);await ok(owner,'setPlatformFlag',{key:'related_discovery',enabled:true,rolloutPercent:100});pass('actual semantic feature respects server rollout switches');
 return {draft,count};
}
