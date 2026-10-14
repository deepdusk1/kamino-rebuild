import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getSemanticStatusV10,detectDuplicatePostsV10} from '@/lib/kamino/search-v10';
import type {SearchResultV10} from '@/lib/kamino/search-v10-types';
import {Button} from '@/components/ui/button';
export function DuplicateCheck({communityId,text}:{communityId:string;text:string}){
 const status=useQuery({queryKey:['semanticStatus'],queryFn:()=>getSemanticStatusV10()}),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<{text:string;communityId:string;matches:SearchResultV10[]}|null>(null);
 if(!status.data?.configured)return null;
 const current=result?.text===text&&result.communityId===communityId?result.matches:null;
 return <section className="space-y-2 rounded-xl border border-border p-3"><h3 className="font-bold">Check similar posts</h3><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Send this draft text to the configured AI provider to check for similar posts.</span></label><Button type="button" variant="secondary" disabled={busy||!consent||!communityId||text.trim().length<10} onClick={()=>{setBusy(true);setError('');void detectDuplicatePostsV10({data:{communityId,text:text.slice(0,4000),consent}}).then(r=>setResult({text,communityId,matches:r.matches})).catch(e=>setError(e instanceof Error?e.message:'Please try again.')).finally(()=>setBusy(false));}}>{busy?'Checking…':'Check for similar posts'}</Button>{error?<p role="alert">{error}</p>:null}{current?<>{!current.length?<p className="text-sm text-muted">No close indexed matches found. This check is advisory.</p>:current.map(r=><a className="block text-sm font-semibold text-violet" key={r.id} href={r.href}>{r.title} →</a>)}</>:null}{text.length>4000?<p className="text-xs text-muted">This check uses the first 4,000 characters of your draft.</p>:null}</section>;
}
