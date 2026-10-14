import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { ScreenTitle, GradientButton } from '@/components/k';
import { fieldClass } from '@/components/community/sheet';
import { authClient } from '@/lib/auth/client';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { getIdentityDashboard, revokeIdentitySession } from '@/lib/kamino/identity-v9';
import { getAgeVerificationStatus, startAgeVerification } from '@/lib/kamino/age-verification';
import { useQueryClient } from '@tanstack/react-query';

export const Route = createFileRoute('/security')({ component: Security });
function Security() {
  const { user,isPending } = useCurrentUserState();
  const client=useQueryClient();
  const dashboard=useQuery({queryKey:['identityDashboard'],queryFn:()=>getIdentityDashboard(),enabled:!!user});
  const age=useQuery({queryKey:['ageVerification'],queryFn:()=>getAgeVerificationStatus(),enabled:!!user,retry:false});
  const [password,setPassword]=useState('');const [code,setCode]=useState('');const [setup,setSetup]=useState<{totpURI:string;backupCodes:string[]}|null>(null);
  if(!isPending&&!user)return <RedirectToSignIn/>;
  const run=async(work:()=>Promise<unknown>)=>{try{await work();await dashboard.refetch();toast.success('Account security updated');}catch(error){toast.error(error instanceof Error?error.message:'Could not update security');}};
  const d=dashboard.data;
  return <AppShell><div className="mx-auto max-w-3xl space-y-5 px-4 py-6"><ScreenTitle title="Account security" subtitle="Protect your identity and manage your devices."/><Link to="/privacy-dashboard" className="font-bold text-violet">Privacy dashboard</Link>
    {dashboard.isError&&<p role="alert">{dashboard.error.message}</p>}
    {!d?<p>Loading security…</p>:<>
      <section className="space-y-4 rounded-card border border-border bg-surface p-5"><h2 className="text-xl font-bold">Email confirmation</h2><p>{d.email} · {d.emailVerified?'Verified':'Not yet verified'}</p>{!d.emailVerified&&<GradientButton onClick={()=>void run(async()=>{const response=await authClient.sendVerificationEmail({email:d.email,callbackURL:'/security'});if(response.error)throw new Error(response.error.message);toast.success('Check your email for the confirmation link');})}>Send confirmation email</GradientButton>}{!d.emailDeliveryConfigured&&<p className="text-sm text-muted">Email confirmation is temporarily unavailable. Please try again later.</p>}</section>
      <section className="space-y-4 rounded-card border border-border bg-surface p-5"><h2 className="text-xl font-bold">Two-step login</h2><p>{d.twoFactorEnabled?'Your authenticator protects email/password sign-in.':'Add a time-based authenticator and keep backup codes somewhere safe.'}</p><label className="block">Current password<input type="password" autoComplete="current-password" className={fieldClass} value={password} onChange={e=>setPassword(e.target.value)}/></label>
        {!setup&&!d.twoFactorEnabled&&<GradientButton onClick={()=>void run(async()=>{const response=await authClient.twoFactor.enable({password});if(response.error)throw new Error(response.error.message);setSetup(response.data);})}>Set up authenticator</GradientButton>}
        {setup&&<><p className="text-sm">Add this key to your authenticator, then enter its six-digit code.</p><a href={setup.totpURI} className="font-bold text-violet">Open authenticator</a><code className="block break-all rounded-tile bg-canvas p-3 text-xs">{new URL(setup.totpURI).searchParams.get('secret')}</code><label className="block">Authenticator code<input inputMode="numeric" autoComplete="one-time-code" className={fieldClass} value={code} onChange={e=>setCode(e.target.value)} maxLength={6}/></label><GradientButton onClick={()=>void run(async()=>{const response=await authClient.twoFactor.verifyTotp({code});if(response.error)throw new Error(response.error.message);setPassword('');})}>Verify and enable</GradientButton><p className="font-bold">Save your backup codes</p><pre className="rounded-tile bg-canvas p-3">{setup.backupCodes.join('\n')}</pre><button className="k-focus font-bold text-violet" onClick={()=>setSetup(null)}>I saved my codes</button></>}
        {d.twoFactorEnabled&&<GradientButton onClick={()=>void run(async()=>{const response=await authClient.twoFactor.disable({password});if(response.error)throw new Error(response.error.message);setPassword('');setSetup(null);})}>Disable two-step login</GradientButton>}
      </section>
      <section className="space-y-4 rounded-card border border-border bg-surface p-5"><h2 className="text-xl font-bold">Age verification</h2>
        {age.isPending?<p role="status">Checking…</p>:age.data?.verifiedAt||age.data?.operatorVerified?<p className="text-sm text-green-ink">✓ Your age is verified{age.data?.operatorVerified&&!age.data?.verifiedAt?' by the operator team':' with a document check'}.</p>:age.data?.offered?age.data?.status==='pending'?<><p>Finish the document check with our verification partner. It opens on their secure page; we never see your document.</p><GradientButton onClick={()=>void (async()=>{try{const r=await startAgeVerification({data:{}});if(r.url){client.setQueryData(['ageVerificationSession'],r);location.assign(r.url);}else toast.error('No session link returned. Try again.');}catch(error){toast.error(error instanceof Error?error.message:'Could not start verification.');}})()}>Verify my age</GradientButton></>:<p className="text-sm text-muted">A previous check did not complete. You can start again.</p>:<p className="text-sm text-muted">Independent age verification is not offered on this server yet. Your declared birthday still applies.</p>}
      </section>
      <section className="space-y-4 rounded-card border border-border bg-surface p-5"><h2 className="text-xl font-bold">Signed-in devices</h2><p className="text-sm text-muted">Ending a session removes its access immediately. Ending your current session signs you out.</p>{d.sessions.length===0&&<p>No active devices.</p>}{d.sessions.map(session=><div key={session.id} className="space-y-2 border-t border-border pt-3"><p className="break-words text-sm">{session.device}</p><p className="text-sm text-muted">Last active {new Date(session.lastActive).toLocaleString()}</p><button className="k-focus min-h-11 font-bold text-danger" onClick={()=>void run(()=>revokeIdentitySession({data:session.id}))}>End session</button></div>)}</section>
    </>}
  </div></AppShell>;
}
