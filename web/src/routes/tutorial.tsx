import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Compass, MessageCircle, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { ScreenTitle } from '@/components/k';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { updateIdentityPreferences } from '@/lib/kamino/identity-v9';

export const Route = createFileRoute('/tutorial')({ component: Tutorial });
const steps = [
  { title: 'Find your first community', icon: Compass, text: 'Browse topics you enjoy. Open a community, read its rules, then choose Join. Private communities may ask a few questions before a moderator approves you.', action: 'Explore communities', to: '/explore' },
  { title: 'Share something with your people', icon: MessageCircle, text: 'Choose a community you joined, then open Create. Write a post, ask a question or share your work. Preview it, add an image description if needed and publish when you are ready.', action: 'Open Create', to: '/new' },
  { title: 'Build your circle', icon: Users, text: 'Follow members whose work you enjoy. Add close friends or favorites from your privacy dashboard. Teen accounts can message mutual follows; other members can choose who may contact them.', action: 'Find members', to: '/discover-plus' },
  { title: 'Make Kamino comfortable for you', icon: Shield, text: 'Choose who can mention or invite you. Mute, restrict or block unwanted contact, and report harmful posts from their menu. Turn on two-factor authentication and review signed-in devices in Security.', action: 'Choose privacy settings', to: '/privacy-dashboard' },
] as const;
function Tutorial() {
  const { user, isPending } = useCurrentUserState();
  const client = useQueryClient(), navigate = useNavigate();
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  if (!isPending && !user) return <RedirectToSignIn />;
  const current = steps[step]!, Icon = current.icon;
  const finish = async () => {
    setBusy(true);
    try { await updateIdentityPreferences({ data: { tutorialComplete: true } }); await client.invalidateQueries({ queryKey: ['identityDashboard'] }); await navigate({ to: '/' }); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save your progress'); }
    finally { setBusy(false); }
  };
  return <AppShell><div className="mx-auto max-w-[720px] space-y-5 px-4 py-5">
    <ScreenTitle title="Welcome to Kamino" subtitle="A quick tour. You can revisit it from Settings anytime." />
    <p className="text-sm font-bold text-violet" aria-live="polite">Step {step + 1} of {steps.length}</p>
    <div className="flex gap-2" aria-hidden="true">{steps.map((_, index) => <div key={index} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-violet' : 'bg-line'}`} />)}</div>
    <div className="rounded-card border border-border bg-surface p-6">
      <Icon size={40} className="mb-4 text-violet" aria-hidden="true" />
      <h2 className="mb-3 text-xl font-bold">{current.title}</h2><p className="leading-relaxed text-muted">{current.text}</p>
      <Link to={current.to} className="k-focus mt-5 inline-block font-bold text-violet">{current.action} →</Link>
    </div>
    <div className="flex flex-wrap gap-3"><button className="k-focus rounded-pill border border-border px-5 py-3 font-bold" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</button>
      <button className="k-focus rounded-pill bg-violet px-5 py-3 font-bold text-white" disabled={busy} onClick={() => step === steps.length - 1 ? void finish() : setStep(step + 1)}>{busy ? 'Saving…' : step === steps.length - 1 ? 'Finish tour' : 'Next'}</button>
      <button className="k-focus ml-auto px-3 py-3 text-muted" disabled={busy} onClick={() => void finish()}>Skip for now</button></div>
  </div></AppShell>;
}
