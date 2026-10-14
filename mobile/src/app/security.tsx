import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { identityApi } from '@/lib/identity-v9';
import { authRequest } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { Button, ErrorState, Field, Loading, Screen, Txt } from '@/components/ui';
import { notify } from '@/components/community/platform';
import { errorMessage } from '@/lib/errors';
import { radius, useTheme } from '@/theme';

export default function Security(){
  const query=useQuery({queryKey:['identityDashboard'],queryFn:identityApi.dashboard});const [password,setPassword]=useState('');const [code,setCode]=useState('');const [setup,setSetup]=useState<{totpURI:string;backupCodes:string[]}|null>(null);const [busy,setBusy]=useState(false);
  const run=async(work:()=>Promise<unknown>)=>{setBusy(true);try{await work();await query.refetch();}catch(e){notify('Could not update security',errorMessage(e));}finally{setBusy(false);}};
  if(query.isPending)return <Loading/>;if(query.isError||!query.data)return <ErrorState error={query.error} onRetry={()=>void query.refetch()}/>;
  const d=query.data;
  return <Screen><Txt variant="title">Account security</Txt><Txt tone="muted">Protect your identity and manage your devices.</Txt>
    <Card title="Email confirmation"><Txt>{d.email}</Txt><Txt>{d.emailVerified?'Verified':'Not yet verified'}</Txt>{!d.emailVerified&&<Button label="Send confirmation email" busy={busy} onPress={()=>void run(async()=>{await authRequest('send-verification-email',{email:d.email,callbackURL:`${apiBaseUrl()}/security`});notify('Check your email','Follow the confirmation link to verify your account.');})}/>}<Txt variant="caption" tone="muted">{d.emailDeliveryConfigured?'Confirmation emails are available.':'Email confirmation is temporarily unavailable. Please try again later.'}</Txt></Card>
    <Card title="Two-step login"><Txt>{d.twoFactorEnabled?'An authenticator protects your email/password login.':'Add a time-based authenticator and save backup codes.'}</Txt><Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password"/>{!setup&&!d.twoFactorEnabled&&<Button label="Set up authenticator" busy={busy} onPress={()=>void run(async()=>{const {body}=await authRequest('two-factor/enable',{password});setSetup(body as {totpURI:string;backupCodes:string[]});})}/>}
      {setup&&<><Button label="Open authenticator" variant="secondary" onPress={()=>void Linking.openURL(setup.totpURI)}/><Txt selectable>{new URL(setup.totpURI).searchParams.get('secret')}</Txt><Field label="Authenticator code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code"/><Button label="Verify and enable" busy={busy} onPress={()=>void run(async()=>{await authRequest('two-factor/verify-totp',{code});setPassword('');})}/><Txt variant="heading">Save your backup codes</Txt><Txt selectable>{setup.backupCodes.join('\n')}</Txt><Button label="I saved my codes" variant="secondary" onPress={()=>setSetup(null)}/></>}
      {d.twoFactorEnabled&&<Button label="Disable two-step login" variant="danger" busy={busy} onPress={()=>void run(async()=>{await authRequest('two-factor/disable',{password});setPassword('');setSetup(null);})}/>}
    </Card>
    <Card title="Signed-in devices"><Txt tone="muted">Ending a session removes access immediately. Ending this device&apos;s session signs you out.</Txt>{d.sessions.map(session=><View key={session.id} style={{gap:8}}><Txt>{session.device}</Txt><Txt variant="caption" tone="muted">Last active {new Date(session.lastActive).toLocaleString()}</Txt><Button label="End session" small variant="danger" onPress={()=>void run(()=>identityApi.revoke(session.id))}/></View>)}</Card>
  </Screen>;
}
function Card({title,children}:{title:string;children:ReactNode}){const theme=useTheme();return <View style={{gap:14,padding:16,borderRadius:radius.card,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border}}><Txt variant="heading">{title}</Txt>{children}</View>;}
