import {createHash,randomUUID} from 'node:crypto';
import type {Sql} from '@/lib/db';
import {checkedEmbeddings,semanticChunks,semanticConfigFrom,type SemanticConfig} from './search-v10-rules.ts';
export {semanticChunks} from './search-v10-rules.ts';
type Row=Record<string,unknown>;
export const semanticConfig=()=>semanticConfigFrom(process.env);
export function semanticNamespace(c:SemanticConfig){return createHash('sha256').update(JSON.stringify([c.url,c.model,c.dimensions])).digest('hex');}
export const semanticRevision=(text:string)=>createHash('md5').update(text).digest('hex');
export async function embedTexts(sql:Sql,texts:string[],config=semanticConfig()):Promise<number[][]>{
  if(!config)throw Error('Semantic search needs a configured embedding provider.');
  if(!texts.length||texts.length>64||texts.some(t=>!t.trim()||Buffer.byteLength(t)>6000))throw Error('Search text is outside the supported size.');
  const bytes=texts.reduce((n,t)=>n+Buffer.byteLength(t),0);
  if(!config.dailyCalls||bytes>config.dailyBytes)throw Error('Semantic search has reached the configured daily budget.');
  const budget=await sql.query(`insert into semantic_usage(day,calls,bytes) values((now() at time zone 'UTC')::date,1,$1)
    on conflict(day) do update set calls=semantic_usage.calls+1,bytes=semantic_usage.bytes+excluded.bytes
    where semantic_usage.calls+1<=$2 and semantic_usage.bytes+excluded.bytes<=$3 returning calls`,[bytes,config.dailyCalls,config.dailyBytes]);
  if(!budget.length)throw Error('Semantic search has reached the configured daily budget.');
  const response=await fetch(config.url+'/embeddings',{method:'POST',redirect:'error',headers:{authorization:'Bearer '+config.key,'content-type':'application/json'},body:JSON.stringify({model:config.model,input:texts,encoding_format:'float',...(config.dimensions?{dimensions:config.dimensions}:{})}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('The search provider could not complete this request. Try later.');
  const reader=response.body?.getReader();if(!reader)throw Error('The search provider returned no response.');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4000000)throw Error('The search provider response was too large.');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
  return checkedEmbeddings(JSON.parse(Buffer.concat(chunks).toString('utf8')),texts.length,config.dimensions);
}
const textSql={post:"p.title||E'\\n'||p.body",community:"c.name||E'\\n'||c.description||E'\\n'||c.category",person:"p.display_name||E'\\n'||p.bio||E'\\n'||p.headline||E'\\n'||p.interests"};
export function semanticSources(config:SemanticConfig):string {
  const status=(user:string)=>`not exists(select 1 from identity_account_status a where a.user_id=${user} and a.status<>'active' and (a.until is null or a.until>now()))`;
  return `select 'post'::text as kind,cast(p.id as text) as target_id,p.author_user_id as owner_id,p.community_id,p.id as post_id,${textSql.post} as text,md5(${textSql.post}) as revision
    from posts p join communities c on c.id=p.community_id join profiles author on author.user_id=p.author_user_id
    where coalesce(p.hidden,false)=false and (p.expires_at is null or p.expires_at>now()) and (p.publish_at is null or p.publish_at<=now()) and author.search_visible=true and ${status('author.user_id')}
    ${config.includePrivate?'':"and c.visibility='public' and author.private_account=false and p.visibility='public'"}
    union all select 'community',c.id,creator.user_id,c.id,null,${textSql.community},md5(${textSql.community}) from communities c left join profiles creator on creator.user_id=c.created_by
    where ${status('c.created_by')} ${config.includePrivate?'':"and c.visibility='public'"}
    union all select 'person',p.user_id,p.user_id,null,null,${textSql.person},md5(${textSql.person}) from profiles p
    where p.search_visible=true and ${status('p.user_id')} ${config.includePrivate?'':"and p.private_account=false"}`;
}
/** A fenced lease prevents concurrent jobs from buying duplicate embeddings. */
export async function indexSemanticBatch(sql:Sql,options:{limit?:number;config?:SemanticConfig|null}={}):Promise<{indexed:number;busy:boolean;configured:boolean}>{
  const config=options.config===undefined?semanticConfig():options.config;if(!config)return {indexed:0,busy:false,configured:false};
  const namespace=semanticNamespace(config),token=randomUUID(),limit=Math.max(1,Math.min(8,Math.trunc(options.limit??4)));
  const lease=await sql.query(`insert into semantic_index_leases(namespace,token,until_at) values($1,$2,now()+interval '5 minutes') on conflict(namespace) do update set token=excluded.token,until_at=excluded.until_at where semantic_index_leases.until_at<now() returning token`,[namespace,token]);
  if(!lease.length)return {indexed:0,busy:true,configured:true};let indexed=0;
  try{
    const source=semanticSources(config);
    await sql.query(`delete from semantic_documents d where d.namespace=$1 and not exists(select 1 from (${source}) s where s.kind=d.kind and s.target_id=d.target_id)`,[namespace]);
    const rows=await sql.query<Row>(`select s.* from (${source}) s where not exists(select 1 from semantic_documents d where d.namespace=$1 and d.kind=s.kind and d.target_id=s.target_id and d.revision=s.revision) order by s.kind,s.target_id limit $2`,[namespace,limit]);
    for(const row of rows){
      const text=String(row.text),parts=semanticChunks(text);if(!parts.length)continue;
      const vectors=await embedTexts(sql,parts,config);
      if(!sql.transaction)throw Error('The database must support transactions for indexing.');
      await sql.transaction(async tx=>{
        if(!(await tx.query('select 1 from semantic_index_leases where namespace=$1 and token=$2 and until_at>now() for update',[namespace,token])).length)return;
        // The source may have been edited, hidden or removed while its provider request was in flight.
        const stillCurrent=await tx.query(`select 1 from (${source}) s where s.kind=$1 and s.target_id=$2 and s.revision=$3`,[row.kind,row.target_id,row.revision]);
        if(!stillCurrent.length)return;
        await tx.query('delete from semantic_documents where namespace=$1 and kind=$2 and target_id=$3',[namespace,row.kind,row.target_id]);
        for(let i=0;i<vectors.length;i++)await tx.query(`insert into semantic_documents(namespace,kind,target_id,owner_id,community_id,post_id,revision,chunk_index,embedding) values($1,$2,$3,$4,$5,$6,$7,$8,$9::double precision[])`,[namespace,row.kind,row.target_id,row.owner_id,row.community_id,row.post_id,row.revision,i,vectors[i]]);
        indexed++;
      });
    }
    return {indexed,busy:false,configured:true};
  }finally{await sql.query('delete from semantic_index_leases where namespace=$1 and token=$2',[namespace,token]);}
}

/** Ranks already-authorized feed candidates using consented interests and recent positive feedback. No provider call on feed reads. */
export async function cachedSemanticScores(sql:Sql,userId:string,ids:number[]):Promise<Map<number,number>>{
  const config=semanticConfig();if(!config||!ids.length)return new Map();
  const namespace=semanticNamespace(config);
  const prefs=(await sql.query<Row>('select embedding from semantic_preferences where user_id=$1 and namespace=$2 and enabled=true',[userId,namespace]))[0];
  if(!prefs)return new Map();
  const vector=[...(prefs.embedding as number[])];
  const liked=await sql.query<Row>(`select d.embedding from likes l join semantic_documents d on d.post_id=l.post_id and d.kind='post'
    join posts p on p.id=d.post_id where l.user_id=$1 and d.namespace=$2 and d.post_id=any($3::int[])
    and d.chunk_index=0 and d.revision=md5(p.title||E'\\n'||p.body) order by l.created_at desc limit 20`,[userId,namespace,ids]);
  const compatible=liked.map(r=>r.embedding as number[]).filter(v=>v.length===vector.length);
  if(compatible.length)for(let i=0;i<vector.length;i++)vector[i]=vector[i]*0.75+compatible.reduce((sum,v)=>sum+v[i],0)/compatible.length*0.25;
  const rows=await sql.query<Row>(`select d.post_id,max(kamino_cosine(d.embedding,$3::double precision[])) as score
    from semantic_documents d join posts p on p.id=d.post_id
    where d.namespace=$1 and d.kind='post' and d.post_id=any($2::int[]) and d.revision=md5(p.title||E'\\n'||p.body)
    group by d.post_id`,[namespace,ids,vector]);
  return new Map(rows.map(r=>[Number(r.post_id),Number(r.score)]));
}
