import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { communityV9 } from '@/api/community-v9';
import { Card,ErrorState,Loading,Txt } from '@/components/ui';
import { space } from '@/theme';
export function AuditTab({slug}:{slug:string}){const q=useQuery({queryKey:['mod-details',slug],queryFn:()=>communityV9.modDetails(slug)});if(q.isPending)return <Loading/>;if(q.error||!q.data)return <ErrorState error={q.error} onRetry={()=>void q.refetch()}/>;return <View style={{gap:space.md}}><Txt variant="heading">Moderator activity</Txt>{q.data.audit.map(a=><Card key={a.id}><Txt>{a.actor} · {a.action.replaceAll(':',' · ')}</Txt><Txt variant="small" tone="muted">{a.detail}</Txt><Txt variant="caption" tone="subtle">{new Date(a.createdAt).toLocaleString()}</Txt></Card>)}</View>;}
