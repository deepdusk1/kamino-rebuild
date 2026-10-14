import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { communityV9 } from '@/api/community-v9';
import { api } from '@/api/endpoints';
import { Button,Card,ErrorState,Loading,Txt } from '@/components/ui';
import { showError } from '@/lib/errors';
import { space } from '@/theme';
export function BansTab({slug,onChanged}:{slug:string;onChanged:()=>void}){const q=useQuery({queryKey:['mod-details',slug],queryFn:()=>communityV9.modDetails(slug)}),[busy,setBusy]=useState(false);if(q.isPending)return <Loading/>;if(q.error||!q.data)return <ErrorState error={q.error} onRetry={()=>void q.refetch()}/>;const lead=['agent','leader'].includes(q.data.role);return <View style={{gap:space.md}}><Txt variant="heading">Ban list</Txt><Txt tone="muted">Removed members remain listed so leaders can restore access.</Txt>{q.data.banned.length?q.data.banned.map(p=><Card key={p.userId}><Txt>{p.nickname}</Txt><Txt variant="caption" tone="subtle">@{p.handle}</Txt>{lead?<Button small busy={busy} label="Restore to community" onPress={()=>{setBusy(true);void api.setMemberRole(slug,p.userId,'unban').then(async()=>{await q.refetch();onChanged();}).catch(showError).finally(()=>setBusy(false));}}/>:null}</Card>):<Txt tone="muted">No banned members.</Txt>}</View>;}
