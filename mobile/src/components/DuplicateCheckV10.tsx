import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {router} from 'expo-router';
import {smartSearch,type SearchResult} from '@/api/search-v10';
import {Card,Txt,Chip,Button} from '@/components/ui';
import {appHrefFromServerHref} from '@/lib/hrefs';
import {showError} from '@/lib/errors';
export function DuplicateCheck({communityId,text}:{communityId:string;text:string}){
 const status=useQuery({queryKey:['semanticStatus'],queryFn:smartSearch.status}),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<{text:string;communityId:string;matches:SearchResult[]}|null>(null);
 if(!status.data?.configured)return null;
 const current=result?.text===text&&result.communityId===communityId?result.matches:null;
 return <Card><Txt variant="heading">Check similar posts</Txt><Txt variant="small" tone="muted">Send this draft text to the configured AI provider to check for similar posts.</Txt><Chip label="Agree to AI processing" selected={consent} onPress={()=>setConsent(!consent)}/><Button variant="secondary" label="Check for similar posts" busy={busy} disabled={!consent||!communityId||text.trim().length<10} onPress={()=>{setBusy(true);void smartSearch.duplicates(communityId,text.slice(0,4000),consent).then(r=>setResult({text,communityId,matches:r.matches})).catch(showError).finally(()=>setBusy(false));}}/>{current?<>{!current.length?<Txt tone="muted">No close indexed matches found. This check is advisory.</Txt>:current.map(r=><Button key={r.id} variant="ghost" label={r.title} onPress={()=>router.push(appHrefFromServerHref(r.href) as never)}/>)}</>:null}{text.length>4000?<Txt variant="caption" tone="muted">This check uses the first 4,000 characters of the draft.</Txt>:null}</Card>;
}
