export type SemanticConfig = {key:string;url:string;model:string;dimensions:number|null;dailyCalls:number;dailyBytes:number;includePrivate:boolean};
export function semanticConfigFrom(env:Record<string,string|undefined>):SemanticConfig|null {
  if(env.KAMINO_SEMANTIC_SEARCH!=='on')return null;
  const key=env.KAMINO_EMBEDDING_API_KEY?.trim(),model=env.KAMINO_EMBEDDING_MODEL?.trim();
  if(!key||!model)return null;
  const url=new URL(env.KAMINO_EMBEDDING_BASE_URL?.trim()||'https://api.openai.com/v1');
  if(url.username||url.password||url.search||url.hash)throw Error('Use a clean embedding provider base URL.');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Embedding providers require HTTPS.');
  const integer=(value:string|undefined,fallback:number,min:number,max:number)=>{const n=Number(value??fallback);if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid semantic search budget or dimensions.');return n;};
  return {key,model,url:url.href.replace(/\/+$/,''),dimensions:env.KAMINO_EMBEDDING_DIMENSIONS?integer(env.KAMINO_EMBEDDING_DIMENSIONS,0,1,4096):null,dailyCalls:integer(env.KAMINO_EMBEDDING_DAILY_CALLS,250,0,100000),dailyBytes:integer(env.KAMINO_EMBEDDING_DAILY_BYTES,2000000,0,1000000000),includePrivate:env.KAMINO_SEMANTIC_PRIVATE_CONTENT==='on'};
}
/** Bounded UTF-8 chunks cover the entire document; no silent article truncation. */
export function semanticChunks(text:string,maxBytes=6000):string[] {
  if(maxBytes<4)throw Error('Chunk size is too small.');
  const chunks:string[]=[];let chunk='',bytes=0;
  for(const char of text.trim()){const size=new TextEncoder().encode(char).length;if(bytes+size>maxBytes&&chunk){chunks.push(chunk);chunk='';bytes=0;}chunk+=char;bytes+=size;}
  if(chunk)chunks.push(chunk);
  return chunks;
}
export function checkedEmbeddings(body:unknown,count:number,dimensions:number|null):number[][] {
  const data=(body as {data?:unknown})?.data;
  if(!Array.isArray(data)||data.length!==count)throw Error('The embedding provider returned an incomplete result.');
  const vectors:number[][]=Array(count);let expected=dimensions;
  for(const entry of data){const {index,embedding}=entry as {index:number;embedding:number[]};if(!Number.isInteger(index)||index<0||index>=count||vectors[index]||!Array.isArray(embedding)||!embedding.length||embedding.length>4096||embedding.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000000))throw Error('The embedding provider returned invalid vectors.');expected??=embedding.length;if(embedding.length!==expected||!embedding.some(n=>n!==0))throw Error('The embedding provider returned incompatible vectors.');vectors[index]=embedding;}
  return vectors;
}
