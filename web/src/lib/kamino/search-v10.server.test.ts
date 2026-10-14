import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import type {Sql} from '../db';
import {checkedEmbeddings,semanticChunks,semanticConfigFrom,type SemanticConfig} from './search-v10-rules.ts';
import {embedTexts,indexSemanticBatch,semanticNamespace,semanticSources,cachedSemanticScores} from './search-v10.server.ts';
const pg=new PGlite();await pg.waitReady;
const directory=new URL('../../../migrations/',import.meta.url);
for(const f of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync(new URL(f,directory),'utf8'));
after(()=>pg.close());
function adapter(run:Sql['query']):Sql{const sql=(async(strings:TemplateStringsArray,...values:unknown[])=>run(strings.reduce((q,p,i)=>q+(i?`$${i}`:'')+p,''),values))as Sql;sql.query=run;return sql;}
const sql=adapter(async<T>(q:string,v:unknown[]=[])=> (await pg.query<T>(q,v)).rows);
sql.transaction=work=>pg.transaction(tx=>work(adapter(async<T>(q:string,v:unknown[]=[])=> (await tx.query<T>(q,v)).rows)));
const config:SemanticConfig={key:'fixture-only-key',url:'https://provider.example.test/v1',model:'fixture-model',dimensions:2,dailyCalls:1000,dailyBytes:2000000,includePrivate:false};
let sequence=0;
async function person(){const id='semantic-'+ ++sequence;await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id+'@example.test'},true)`;await sql`insert into profiles(user_id,handle,display_name)values(${id},${id},${id})`;return id;}
async function fixture(){const owner=await person(),community='semantic-space-'+ ++sequence;await sql`insert into communities(id,name,category,created_by)values(${community},'Manga club','Art',${owner})`;const post=Number((await sql`insert into posts(community_id,author_user_id,type,title,body)values(${community},${owner},'blog','Manga art','Drawing manga together')returning id`)[0].id);return {owner,community,post};}
function provider(){const original=globalThis.fetch;const requests:string[][]=[];globalThis.fetch=async(input,init)=>{assert.equal(String(input),config.url+'/embeddings');const body=JSON.parse(String(init?.body));assert.equal(body.encoding_format,'float');requests.push(body.input);return new Response(JSON.stringify({data:body.input.map((text:string,index:number)=>({index,embedding:text.includes('Manga')?[1,0]:[0,1]}))}),{headers:{'content-type':'application/json'}});};return {requests,restore:()=>{globalThis.fetch=original;}};}
test('semantic configuration stays off without explicit consented provider setup; validates URL and budgets',()=>{
 assert.equal(semanticConfigFrom({}),null);assert.equal(semanticConfigFrom({KAMINO_SEMANTIC_SEARCH:'on'}),null);
 const env={KAMINO_SEMANTIC_SEARCH:'on',KAMINO_EMBEDDING_API_KEY:'fixture',KAMINO_EMBEDDING_MODEL:'chosen'};
 assert.equal(semanticConfigFrom(env)?.includePrivate,false);
 assert.throws(()=>semanticConfigFrom({...env,KAMINO_EMBEDDING_BASE_URL:'http://external.example.test'}),/HTTPS/);
 assert.throws(()=>semanticConfigFrom({...env,KAMINO_EMBEDDING_DAILY_CALLS:'NaN'}),/Invalid/);
 assert.throws(()=>semanticConfigFrom({...env,KAMINO_EMBEDDING_BASE_URL:'https://key:secret@example.test'}),/clean/);
});
test('long multilingual documents preserve all text and embeddings require complete finite compatible vectors',()=>{
 const text='🌿こんにちはManga'.repeat(3000),chunks=semanticChunks(text);assert.equal(chunks.join(''),text);assert.ok(chunks.every(t=>Buffer.byteLength(t)<=6000));
 assert.deepEqual(checkedEmbeddings({data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]},2,2),[[1,0],[0,1]]);
 for(const data of [[{index:0,embedding:[0,0]}],[{index:0,embedding:[NaN,1]}],[{index:0,embedding:[1]}]])assert.throws(()=>checkedEmbeddings({data},1,2));
 assert.throws(()=>checkedEmbeddings({data:[{index:0,embedding:[1,0]},{index:0,embedding:[0,1]}]},2,2));
});
test('source policy excludes private, hidden, scheduled and sanctioned content by default',async()=>{
 const f=await fixture();const sources=()=>sql.query(`select * from (${semanticSources(config)}) source where kind='post' and post_id=$1`,[f.post]);
 assert.equal((await sources()).length,1);await sql`update communities set visibility='private' where id=${f.community}`;assert.equal((await sources()).length,0);
 assert.equal((await sql.query(`select * from (${semanticSources({...config,includePrivate:true})}) source where post_id=$1`,[f.post])).length,1);
 await sql`update communities set visibility='public' where id=${f.community}`;await sql`update posts set hidden=true where id=${f.post}`;assert.equal((await sources()).length,0);
 await sql`update posts set hidden=false,publish_at=now()+interval '1 day' where id=${f.post}`;assert.equal((await sources()).length,0);
 await sql`update posts set publish_at=null where id=${f.post}`;await sql`insert into identity_account_status(user_id,status,reason,actor_id) values(${f.owner},'banned','Fixture',${f.owner})`;assert.equal((await sources()).length,0);
});
test('daily provider budget rejects extra requests before network and indexes real validated responses once per revision',async()=>{
 await sql`delete from semantic_usage`;const mock=provider();try{
  await embedTexts(sql,['Manga'],{...config,dailyCalls:1});await assert.rejects(embedTexts(sql,['Second'],{...config,dailyCalls:1}),/budget/);assert.equal(mock.requests.length,1);
  await sql`delete from semantic_usage`;const f=await fixture();for(let i=0;i<5;i++)await indexSemanticBatch(sql,{limit:8,config});
  assert.equal((await sql`select 1 from semantic_documents where namespace=${semanticNamespace(config)} and post_id=${f.post}`).length,1);
  const calls=mock.requests.length;await indexSemanticBatch(sql,{limit:8,config});assert.equal(mock.requests.length,calls);
  await sql`update posts set body='Updated meaning' where id=${f.post}`;await indexSemanticBatch(sql,{limit:8,config});assert.ok(mock.requests.length>calls);
  await sql`update posts set hidden=true where id=${f.post}`;await indexSemanticBatch(sql,{limit:8,config});assert.equal((await sql`select 1 from semantic_documents where post_id=${f.post}`).length,0);
 }finally{mock.restore();}
});
test('index lease prevents duplicate provider calls and deleted sources cannot be resurrected after network returns',async()=>{
 const namespace=semanticNamespace(config);await sql`insert into semantic_index_leases(namespace,token,until_at)values(${namespace},'existing',now()+interval '1 minute')`;
 assert.equal((await indexSemanticBatch(sql,{config})).busy,true);await sql`delete from semantic_index_leases where namespace=${namespace}`;
 const f=await fixture();const original=globalThis.fetch;
 globalThis.fetch=async(_input,init)=>{const body=JSON.parse(String(init?.body));await sql`delete from posts where id=${f.post}`;return new Response(JSON.stringify({data:body.input.map((_t:string,index:number)=>({index,embedding:[1,0]}))}));};
 try{await indexSemanticBatch(sql,{limit:8,config});assert.equal((await sql`select 1 from semantic_documents where post_id=${f.post}`).length,0);}finally{globalThis.fetch=original;}
});
test('feed ranking uses only passed authorized candidate IDs and current revisions; opting out removes AI ranking',async()=>{
 const f=await fixture(),namespace=semanticNamespace(config),before={...process.env};const mock=provider();
 Object.assign(process.env,{KAMINO_SEMANTIC_SEARCH:'on',KAMINO_EMBEDDING_API_KEY:config.key,KAMINO_EMBEDDING_BASE_URL:config.url,KAMINO_EMBEDDING_MODEL:config.model,KAMINO_EMBEDDING_DIMENSIONS:'2'});
 try{await indexSemanticBatch(sql,{limit:8,config});await sql.query('insert into semantic_preferences(user_id,namespace,embedding)values($1,$2,$3::double precision[])',[f.owner,namespace,[1,0]]);
  const scores=await cachedSemanticScores(sql,f.owner,[f.post]);assert.equal(scores.size,1);assert.equal(scores.get(f.post),1);assert.equal((await cachedSemanticScores(sql,f.owner,[])).size,0);
  await sql`update posts set body='Unindexed edit' where id=${f.post}`;assert.equal((await cachedSemanticScores(sql,f.owner,[f.post])).size,0);
  await sql`delete from semantic_preferences where user_id=${f.owner}`;assert.equal((await cachedSemanticScores(sql,f.owner,[f.post])).size,0);
 }finally{mock.restore();for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
});
