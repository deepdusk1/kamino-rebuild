import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, Shield, UserRound, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { ScreenTitle, GradientButton } from '@/components/k';
import { fieldClass } from '@/components/community/sheet';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { getIdentityDashboard, updateIdentityPreferences, setPersonRelationship, findContacts } from '@/lib/kamino/identity-v9';
import { BirthdayFields, EMPTY_BIRTHDAY, judgeBirthday } from '@/components/birthday-fields';
import { confirmMinimumAge } from '@/lib/kamino/extras';
import { useT, LOCALES, writeLocaleCookie } from '@/lib/i18n';

export const Route = createFileRoute('/privacy-dashboard')({ component: PrivacyDashboard });
type Dashboard = Awaited<ReturnType<typeof getIdentityDashboard>>;
const card = 'rounded-card border border-border bg-surface p-5 space-y-4';

function PrivacyDashboard() {
  const { user, isPending } = useCurrentUserState();
  const t = useT();
  const client = useQueryClient();
  const dashboard = useQuery({ queryKey: ['identityDashboard'], queryFn: () => getIdentityDashboard(), enabled: !!user });
  const [handle, setHandle] = useState(''); const [links, setLinks] = useState(''); const [target, setTarget] = useState('');
  const [relationship, setRelationship] = useState<'restrict'|'close_friend'|'favorite'|'mute'>('favorite');
  const [birthday, setBirthday] = useState(EMPTY_BIRTHDAY);
  const [contacts, setContacts] = useState(''); const [matches, setMatches] = useState<{handle:string;name:string}[]>([]);
  useEffect(() => { if (dashboard.data) { setHandle(dashboard.data.preferences.handle); setLinks(dashboard.data.preferences.socialLinks.map(link => `${link.label}|${link.url}`).join('\n')); } }, [dashboard.data]);
  if (!isPending && !user) return <RedirectToSignIn />;
  const save = async (patch: Parameters<typeof updateIdentityPreferences>[0]['data']) => {
    try { await updateIdentityPreferences({ data: patch }); await client.invalidateQueries(); toast.success('Preferences saved'); } catch(error) { toast.error(error instanceof Error ? error.message : 'Could not save'); }
  };
  const changePerson = async (targetHandle: string, kind: 'restrict'|'close_friend'|'favorite'|'mute', enabled: boolean) => {
    try { await setPersonRelationship({ data: {targetHandle,kind,enabled} }); await dashboard.refetch(); setTarget(''); } catch(error) { toast.error(error instanceof Error ? error.message : 'Could not update'); }
  };
  const d = dashboard.data;
  return <AppShell><div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
    <ScreenTitle title="Privacy dashboard" subtitle="Choose who can reach you and how you appear." />
    <div className="flex gap-3"><Link to="/settings" className="font-bold text-violet">Settings</Link><Link to="/security" className="font-bold text-violet">Account security</Link></div>
    {dashboard.isError && <p role="alert">{dashboard.error.message}</p>}
    {!d ? <p>Loading your preferences…</p> : <>
      <section className={card}><h2 className="flex items-center gap-2 text-xl font-bold"><UserRound size={20}/> Your identity</h2>
        <label className="block">Username<input className={fieldClass} value={handle} onChange={e => setHandle(e.target.value)} maxLength={30}/></label>
        <GradientButton onClick={() => void save({handle})}>Save username</GradientButton>
        <label className="block">{t("privacy.language.title")}<select className={fieldClass} value={d.preferences.language} onChange={e => { const language = e.target.value as 'en'; writeLocaleCookie(language); void save({ language }).then(() => window.location.reload()); }}>{Object.entries(LOCALES).map(([key, meta]) => <option key={key} value={key}>{meta.name}</option>)}</select></label>
        <p className="text-sm text-muted">{t("privacy.language.help")}</p>
        <label className="block">Profile links<textarea className={fieldClass} value={links} onChange={e => setLinks(e.target.value)} rows={4} placeholder="Portfolio|https://example.com"/></label>
        <p className="text-sm text-muted">Up to six links, one per line: label|https://address</p>
        <GradientButton onClick={() => void save({socialLinks: links.split('\n').filter(Boolean).map(line => { const [label,...url] = line.split('|'); return {label:label?.trim() ?? '',url:url.join('|').trim()}; })})}>Save links</GradientButton>
        <label className="block">Profile accent<input type="range" min={0} max={360} defaultValue={d.preferences.profileHue} onMouseUp={e => void save({profileHue:Number(e.currentTarget.value)})} onTouchEnd={e => void save({profileHue:Number(e.currentTarget.value)})} className="w-full"/></label>
      </section>
      <section className={card}><h2 className="flex items-center gap-2 text-xl font-bold"><Lock size={20}/> Who can reach you</h2>
        {(['mentionPrivacy','invitePrivacy'] as const).map(key => <label className="block" key={key}>{key === 'mentionPrivacy' ? 'Who can mention you' : 'Who can invite you'}<select className={fieldClass} value={d.preferences[key]} onChange={e => void save({[key]:e.target.value})}><option value="everyone">Everyone</option><option value="following">People I follow</option><option value="none">No one</option></select></label>)}
        <Toggle label="Appear in people search" value={d.preferences.searchVisible} onChange={searchVisible => void save({searchVisible})}/>
        <Toggle label="Hide my followers list" value={d.preferences.hideFollowers} onChange={hideFollowers => void save({hideFollowers})}/>
        <Toggle label="Hide my following list" value={d.preferences.hideFollowing} onChange={hideFollowing => void save({hideFollowing})}/>
        <Toggle label="Restricted mode: only 13+ communities" value={d.preferences.restrictedMode} onChange={restrictedMode => void save({restrictedMode})}/>
        <label className="block">Sensitive content<select className={fieldClass} value={d.preferences.sensitiveContent} onChange={e => void save({sensitiveContent:e.target.value as 'blur'})}><option value="blur">Blur warnings</option><option value="hide">Hide warned posts</option>{d.ageBand === '18+' && <option value="show">Show warned posts</option>}</select></label>
        <Toggle label="High contrast" value={d.preferences.highContrast} onChange={highContrast => void save({highContrast})}/>
        <label className="block">Text size<select className={fieldClass} value={d.preferences.textScale} onChange={e => void save({textScale:e.target.value as 'standard'})}><option value="standard">Standard</option><option value="large">Large</option><option value="largest">Largest</option></select></label>
      </section>
      <section className={card}><h2 className="flex items-center gap-2 text-xl font-bold"><Shield size={20}/> Age and teen safety</h2>
        <p>{d.ageChecked ? `Checked eligibility: ${d.ageBand}. Eligibility updates as you reach the relevant age.` : 'Confirm your birthday once to establish age eligibility. Earlier settings checkboxes cannot unlock age-gated communities.'}</p>
        <p className="text-sm text-muted">Teen accounts can message mutual follows only. They have daily limits and cannot show sensitive content without a warning.</p>
        {!d.ageChecked && <><BirthdayFields value={birthday} onChange={setBirthday}/><GradientButton onClick={async () => {const verdict=judgeBirthday(birthday);if(verdict.kind!=='ok') return toast.error('Enter a valid birthday, age 13 or older.');try{await confirmMinimumAge({data:{year:verdict.year,month:verdict.month,day:verdict.day}});await dashboard.refetch();}catch(e){toast.error(String(e));}}}>Confirm eligibility</GradientButton></>}
      </section>
      <section className={card}><h2 className="flex items-center gap-2 text-xl font-bold"><Users size={20}/> Your people</h2>
        <div className="flex flex-wrap gap-2"><input className={`${fieldClass} min-w-40 flex-1`} value={target} onChange={e => setTarget(e.target.value)} placeholder="@username" aria-label="Member username"/><select className={fieldClass} value={relationship} onChange={e => setRelationship(e.target.value as typeof relationship)}><option value="favorite">Favorite</option><option value="close_friend">Close friend</option><option value="restrict">Restrict messages</option><option value="mute">Mute</option></select><GradientButton onClick={() => void changePerson(target,relationship,true)}>Add</GradientButton></div>
        {d.people.length + d.muted.length === 0 && <p className="text-muted">Your lists are empty.</p>}
        {[...d.people,...d.muted.map(person => ({...person,kind:'mute'}))].map(person => <div key={`${person.kind}:${person.userId}`} className="flex items-center justify-between gap-3 border-t border-border pt-3"><div><Link to="/u/$handle" params={{handle:person.handle}} className="font-bold">{person.name}</Link><p className="text-sm text-muted">@{person.handle} · {person.kind.replace('_',' ')}</p></div><button className="k-focus min-h-11 px-3 font-bold text-violet" onClick={() => void changePerson(person.handle,person.kind as typeof relationship,false)}>Remove</button></div>)}
      </section>
      <section className={card}><h2 className="text-xl font-bold">Find people you know</h2><p className="text-sm text-muted">Paste up to 100 email addresses you have permission to use. Addresses are matched for this request and are never retained. Only searchable members appear.</p><textarea className={fieldClass} value={contacts} onChange={e => setContacts(e.target.value)} rows={3} aria-label="Contact email addresses"/><GradientButton onClick={async () => {try{setMatches(await findContacts({data:contacts.split(/[\s,;]+/).filter(Boolean)}));setContacts('');}catch(e){toast.error(String(e));}}}>Find contacts</GradientButton>{matches.map(person => <Link key={person.handle} to="/u/$handle" params={{handle:person.handle}} className="block font-bold text-violet">{person.name} · @{person.handle}</Link>)}</section>
    </>}
  </div></AppShell>;
}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(value:boolean)=>void}) {return <label className="flex min-h-11 items-center justify-between gap-4"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)} className="size-5 accent-violet"/></label>;}
