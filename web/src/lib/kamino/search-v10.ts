import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {authMiddleware} from '@/lib/auth/middleware';
import {internals} from './server';
import {guard} from './guard';
import type {SearchKindV10,SearchResultV10,SemanticStatusV10} from './search-v10-types';
import {platformFlagActive} from './platform-flags.server';
type Sql=Awaited<ReturnType<typeof internals.db>>;
type Row=Record<string,unknown>;
const uid=(context:unknown)=>(context as {userId:string}).userId;
const consent=z.boolean().refine(value=>value,'Agree to sending this search text to the configured AI provider first.');
const statusFilter=(author:string)=>`not exists(select 1 from identity_account_status s where s.user_id=${author} and s.status<>'active' and (s.until is null or s.until>now()))`;
const peerFilter=(author:string)=>`${statusFilter(author)} and not exists(select 1 from blocks b where (b.blocker_id=$1 and b.blocked_id=${author}) or (b.blocked_id=$1 and b.blocker_id=${author})) and not exists(select 1 from muted_people m where m.user_id=$1 and m.muted_user_id=${author})`;
async function search(sql:Sql,userId:string,vector:number[],namespace:string,kind:SearchKindV10|'all',limit:number,communityId?:string):Promise<SearchResultV10[]>{
  const parts:string[]=[];
  if(kind==='all'||kind==='post')parts.push(`select 'post'::text as kind,cast(p.id as text) as id,p.title,left(p.body,240) as excerpt,'/c/'||p.community_id||'/p/'||p.id as href,max(kamino_cosine(d.embedding,$3::double precision[])) as score
    from semantic_documents d join posts p on p.id=d.post_id join communities c on c.id=p.community_id join profiles author on author.user_id=p.author_user_id
    where d.namespace=$2 and d.kind='post' and d.revision=md5(p.title||E'\\n'||p.body) and ${internals.visiblePosts('$1')} and ${internals.communityAccessSql('$1')}
    and p.hidden=false and (p.expires_at is null or p.expires_at>now()) and (p.publish_at is null or p.publish_at<=now()) and ${peerFilter('author.user_id')}
    and ($4::text is null or p.community_id=$4) and not exists(select 1 from discovery_feedback f where f.user_id=$1 and f.preference='hide' and ((f.target_type='post' and f.target_id=cast(p.id as text)) or (f.target_type='community' and f.target_id=c.id) or (f.target_type='creator' and f.target_id=author.user_id))) group by p.id`);
  if(kind==='all'||kind==='community')parts.push(`select 'community',c.id,c.name,left(c.description,240),'/c/'||c.id,max(kamino_cosine(d.embedding,$3::double precision[]))
    from semantic_documents d join communities c on c.id=d.community_id where d.namespace=$2 and d.kind='community' and d.revision=md5(c.name||E'\\n'||c.description||E'\\n'||c.category)
    and ${internals.communityAccessSql('$1')} and not exists(select 1 from discovery_feedback f where f.user_id=$1 and f.preference='hide' and f.target_type='community' and f.target_id=c.id) and ($4::text is null or c.id=$4) group by c.id`);
  if(kind==='all'||kind==='person')parts.push(`select 'person',p.user_id,p.display_name,left(p.headline,240),'/u/'||p.handle,max(kamino_cosine(d.embedding,$3::double precision[]))
    from semantic_documents d join profiles p on p.user_id=d.owner_id where d.namespace=$2 and d.kind='person'
    and d.revision=md5(p.display_name||E'\\n'||p.bio||E'\\n'||p.headline||E'\\n'||p.interests) and p.search_visible=true and ${peerFilter('p.user_id')}
    and (p.private_account=false or p.user_id=$1 or exists(select 1 from profile_follows f where f.follower_id=$1 and f.followee_id=p.user_id))
    and (p.user_id=$1 or ((p.age_eligible_at_18<=current_date)=(select age_eligible_at_18<=current_date from profiles where user_id=$1))) and $4::text is null
    and not exists(select 1 from discovery_feedback f where f.user_id=$1 and f.preference='hide' and f.target_type='creator' and f.target_id=p.user_id) group by p.user_id`);
  const rows=await sql.query<Row>(`select * from (${parts.join(' union all ')}) results order by score desc,kind,id limit $5`,[userId,namespace,vector,communityId??null,Math.min(limit*3,150)]),results:SearchResultV10[]=[];
  for(const row of rows){if(row.kind==='post'){try{await internals.requirePostAccess(sql,userId,Number(row.id));}catch{continue;}}else if(row.kind==='community'){try{await internals.assertCommunityReadable(sql,userId,String(row.id));}catch{continue;}}
    results.push({kind:row.kind as SearchKindV10,id:String(row.id),title:String(row.title),excerpt:String(row.excerpt),href:String(row.href),score:Math.round(Number(row.score)*1000)/1000});if(results.length>=limit)break;}
  return results;
}
export const getSemanticStatusV10=createServerFn({method:'GET'}).middleware([authMiddleware]).handler(async({context}):Promise<SemanticStatusV10&{personalized:boolean}>=>{
  const {semanticConfig,semanticNamespace,semanticSources}=await import('./search-v10.server');const config=semanticConfig(),sql=await internals.db(),userId=uid(context);
  if(!config)return {configured:false,indexedDocuments:0,pendingDocuments:0,privateIndexing:false,personalized:false};
  const namespace=semanticNamespace(config),{isSiteAdmin}=await import('./safety.server');let indexedDocuments=0,pendingDocuments=0;
  // Global inventory counts are only available to administrators, not a private-content existence oracle.
  if(await isSiteAdmin(sql,userId)){indexedDocuments=Number((await sql.query<Row>('select count(distinct (kind,target_id)) as n from semantic_documents where namespace=$1',[namespace]))[0].n);pendingDocuments=Number((await sql.query<Row>(`select count(*) as n from (${semanticSources(config)}) source where not exists(select 1 from semantic_documents d where d.namespace=$1 and d.kind=source.kind and d.target_id=source.target_id and d.revision=source.revision)`,[namespace]))[0].n);}
  return {configured:true,indexedDocuments,pendingDocuments,privateIndexing:config.includePrivate,personalized:(await sql`select 1 from semantic_preferences where user_id=${userId} and namespace=${namespace} and enabled=true`).length>0};
});
export const semanticSearchV10=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:unknown)=>z.object({query:z.string().trim().min(2).max(800),kind:z.enum(['all','post','community','person']).default('all'),limit:z.number().int().min(1).max(50).default(20),consent}).parse(d)).handler(async({context,data})=>{
  const sql=await internals.db(),userId=uid(context);await guard(userId,'ai');await internals.requireMinAge(sql,userId);
  if(!await platformFlagActive(sql,userId,'related_discovery',true))throw Error('Smart discovery is not available for this account.');
  const {embedTexts,semanticConfig,semanticNamespace}=await import('./search-v10.server');const config=semanticConfig();if(!config)throw Error('Semantic search needs a configured embedding provider.');
  const [vector]=await embedTexts(sql,[data.query],config);
  return {results:await search(sql,userId,vector,semanticNamespace(config),data.kind,data.limit),indexed:true};
});
export const setSemanticPersonalizationV10=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:unknown)=>z.object({enabled:z.boolean(),consent:z.boolean().default(false)}).parse(d)).handler(async({context,data})=>{
  const sql=await internals.db(),userId=uid(context);if(!data.enabled){await sql`delete from semantic_preferences where user_id=${userId}`;return {enabled:false};}
  if(!data.consent)throw Error('Agree to sending your selected interests to the configured AI provider first.');await guard(userId,'ai');await internals.requireMinAge(sql,userId);
  const p=(await sql`select interests from profiles where user_id=${userId}`)[0],interests=String(p?.interests??'[]');if(interests==='[]')throw Error('Choose interests in your profile first.');
  const {embedTexts,semanticConfig,semanticNamespace}=await import('./search-v10.server');const config=semanticConfig();if(!config)throw Error('AI personalization needs a configured embedding provider.');const [vector]=await embedTexts(sql,['Interests: '+interests],config);
  await sql.query(`insert into semantic_preferences(user_id,namespace,embedding,enabled) values($1,$2,$3::double precision[],true) on conflict(user_id) do update set namespace=excluded.namespace,embedding=excluded.embedding,enabled=true,updated_at=now()`,[userId,semanticNamespace(config),vector]);return {enabled:true};
});
export const semanticRecommendationsV10=createServerFn({method:'GET'}).middleware([authMiddleware]).handler(async({context})=>{
  const sql=await internals.db(),userId=uid(context);const {semanticConfig,semanticNamespace}=await import('./search-v10.server');const config=semanticConfig();if(!config)return {enabled:false,results:[] as SearchResultV10[]};
  if(!await platformFlagActive(sql,userId,'related_discovery',true))return {enabled:false,results:[] as SearchResultV10[]};
  const namespace=semanticNamespace(config),row=(await sql`select embedding from semantic_preferences where user_id=${userId} and namespace=${namespace} and enabled=true`)[0];if(!row)return {enabled:false,results:[] as SearchResultV10[]};
  return {enabled:true,results:await search(sql,userId,row.embedding as number[],namespace,'all',30)};
});
export const detectDuplicatePostsV10=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:unknown)=>z.object({communityId:z.string().trim().min(1).max(100),text:z.string().trim().min(10).max(4000),consent}).parse(d)).handler(async({context,data})=>{
  const userId=uid(context),sql=await internals.db();await internals.assertCommunityReadable(sql,userId,data.communityId);await guard(userId,'ai');
  const {embedTexts,semanticChunks,semanticConfig,semanticNamespace}=await import('./search-v10.server');const config=semanticConfig();if(!config)throw Error('Duplicate detection needs a configured embedding provider.');
  const chunks=semanticChunks(data.text),vectors=await embedTexts(sql,chunks,config),all=await Promise.all(vectors.map(vector=>search(sql,userId,vector,semanticNamespace(config),'post',20,data.communityId)));
  const matches=new Map<string,SearchResultV10>();for(const row of all.flat())if(row.score>=0.85&&(!matches.has(row.id)||matches.get(row.id)!.score<row.score))matches.set(row.id,row);
  return {matches:[...matches.values()].sort((a,b)=>b.score-a.score).slice(0,10),threshold:0.85};
});
export const indexSemanticContentV10=createServerFn({method:'POST'}).middleware([authMiddleware]).validator((d:unknown)=>z.object({consent}).parse(d)).handler(async({context})=>{
  const sql=await internals.db(),{isSiteAdmin}=await import('./safety.server');if(!await isSiteAdmin(sql,uid(context)))throw Error('Verified administrator access required.');const {indexSemanticBatch}=await import('./search-v10.server');return indexSemanticBatch(sql);
});
