import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {View} from 'react-native';
import {router} from 'expo-router';
import {platform} from '@/api/platform-v9';
import {Card,Txt,Field,Button} from '@/components/ui';
import {notify} from '@/components/community/platform';
import {errorMessage} from '@/lib/errors';
export function Collaborations({browse=false}:{browse?:boolean}){
 const q=useQuery({queryKey:['collaborations'],queryFn:platform.collaborations,retry:false});
 const[title,setTitle]=useState(''),[brief,setBrief]=useState(''),[budgetNote,setBudget]=useState(''),[busy,setBusy]=useState(false);
 const run=async(work:()=>Promise<unknown>)=>{setBusy(true);try{await work();await q.refetch();}catch(e){notify('Could not save',errorMessage(e));}finally{setBusy(false);}};
 if(q.isError)return <Card><Txt variant="heading">Collaborations</Txt><Txt tone="muted">{errorMessage(q.error)}</Txt></Card>;
 if(!q.data)return null;
 return <><Card><Txt variant="heading">{browse?'Brand & creator collaborations':'Your collaborations'}</Txt><Txt tone="muted">Share a brief, send a proposal, and track the response. Accepting does not collect or send money.</Txt></Card>
 {browse?q.data.open.map(b=><Card key={Number(b.id)}><Txt variant="cardTitle">{String(b.title)}</Txt><Txt onPress={()=>router.push(`/profile/${b.handle}` as never)}>@{String(b.handle)}</Txt><Txt>{String(b.brief)}</Txt><Txt tone="muted">{String(b.budget_note)}</Txt>{String(b.owner_id)!==q.data.userId?<Proposal briefId={Number(b.id)} run={run} busy={busy}/>:null}</Card>):<>
 <Card><Txt variant="heading">Post an open brief</Txt><Txt tone="muted">Open briefs are shown with public profiles. Include deliverables and expectations.</Txt><Field label="Title" value={title} onChangeText={setTitle} maxLength={100}/><Field label="Brief" value={brief} onChangeText={setBrief} maxLength={4000} multiline/><Field label="Budget / terms" value={budgetNote} onChangeText={setBudget} maxLength={200}/><Button label="Post brief" busy={busy} disabled={title.trim().length<3||brief.trim().length<20} onPress={()=>void run(async()=>{await platform.brief({title,brief,budgetNote,open:true});setTitle('');setBrief('');setBudget('');})}/></Card>
 {q.data.mine.map(b=><Card key={Number(b.id)}><Txt variant="cardTitle">{String(b.title)}</Txt><Txt>{String(b.brief)}</Txt><Txt tone="muted">{b.open?'Open for proposals':'Closed'}</Txt><Button label={b.open?'Close brief':'Reopen brief'} small variant="secondary" busy={busy} onPress={()=>void run(()=>platform.brief({id:Number(b.id),title:String(b.title),brief:String(b.brief),budgetNote:String(b.budget_note),open:!b.open}))}/></Card>)}
 <Card><Txt variant="heading">Proposals</Txt>{!q.data.proposals.length?<Txt tone="muted">No proposals yet.</Txt>:null}{q.data.proposals.map(p=><View key={Number(p.id)} style={{gap:8}}><Txt variant="cardTitle">{String(p.title)}</Txt><Txt onPress={()=>router.push(`/profile/${p.handle}` as never)}>@{String(p.handle)}</Txt><Txt>{String(p.introduction)}</Txt><Txt tone="muted">{String(p.status)}</Txt>{p.status==='pending'?(String(p.owner_id)===q.data.userId?<View style={{flexDirection:'row',gap:8}}>{(['accepted','declined']as const).map(action=><Button key={action} label={action==='accepted'?'Accept':'Decline'} small variant="secondary" busy={busy} onPress={()=>void run(()=>platform.decide(Number(p.id),action))}/>)}</View>:<Button label="Withdraw" small variant="secondary" busy={busy} onPress={()=>void run(()=>platform.decide(Number(p.id),'withdrawn'))}/>):null}</View>)}</Card>
 </>}
 </>;
}
function Proposal({briefId,run,busy}:{briefId:number;run:(work:()=>Promise<unknown>)=>Promise<void>;busy:boolean}){const[text,setText]=useState('');return <View style={{gap:8}}><Field label="Your proposal" value={text} onChangeText={setText} maxLength={2000} multiline/><Button label="Send proposal" busy={busy} disabled={text.trim().length<20} onPress={()=>void run(async()=>{await platform.propose(briefId,text);setText('');})}/></View>;}
