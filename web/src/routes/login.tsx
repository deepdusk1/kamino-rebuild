import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {useQuery} from '@tanstack/react-query';
import { Eye, EyeOff, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { BirthdayFields, EMPTY_BIRTHDAY, judgeBirthday, YOUNG_MESSAGE } from "@/components/birthday-fields";
import { AuthCard, AuthFrame, AuthTitle, Field, FormError } from "@/components/home/auth-ui";
import { StepHeader } from "@/components/home/step-header";
import { FilterPills, GradientButton, OutlineButton } from "@/components/k";
import { confirmMinimumAge } from "@/lib/kamino/extras";
import {getSignInCapabilities} from '@/lib/kamino/identity-v9';
import { claimReferral, getReferralPreview } from '@/lib/kamino/referrals';
import {CaptchaField} from '@/components/captcha-field';
import { safeRedirect } from '@/lib/auth/safe-redirect';
import { useT } from '@/lib/i18n';

/**
 * Onboarding step 1: create an account (name, email, birthday 18+ check, password) or sign in.
 * The Welcome screen opens it with `?mode=up` (Get Started) or `?mode=in` (I already have an account).
 * New accounts land on Home, which sends them to the rest of onboarding.
 */
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { mode?: "in" | "up"; redirect?: string; ref?: string } => ({
    ...(search.mode === 'up' || search.mode === 'in' ? { mode: search.mode } : {}),
    ...(typeof search.redirect === 'string' ? { redirect: safeRedirect(search.redirect) } : {}),
    ...(typeof search.ref === 'string' && /^[A-Z2-9]{6,12}$/i.test(search.ref) ? { ref: search.ref.toUpperCase() } : {}),
  }),
  head: () => ({ meta: [{ title: "Sign in · Kamino" }] }),
  component: Login,
});

function Login() {
  const search = Route.useSearch();
  const t = useT();
  const next = safeRedirect(search.redirect);
  const [mode, setMode] = useState<"in" | "up">(search.mode ?? "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [birthday, setBirthday] = useState(EMPTY_BIRTHDAY);
  const [verificationSent, setVerificationSent] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [backupCode,setBackupCode]=useState(false);
  const [captchaToken,setCaptchaToken]=useState('');
  const [phone,setPhone]=useState('');const [phoneCode,setPhoneCode]=useState('');const [phoneSent,setPhoneSent]=useState(false);
  const capabilities=useQuery({queryKey:['signInCapabilities'],queryFn:()=>getSignInCapabilities()});
  // Referral link: show whose invite this is, and credit them once the account is created.
  const referral=useQuery({queryKey:['referralPreview',search.ref],queryFn:()=>getReferralPreview({data:search.ref!}),enabled:!!search.ref,staleTime:60_000,retry:false});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // Check the birthday BEFORE creating anything, so nothing is stored for someone under 13.
    const verdict = mode === "up" ? judgeBirthday(birthday) : null;
    if (verdict?.kind === "young") return setError(YOUNG_MESSAGE);
    if (verdict?.kind === "invalid") return setError(verdict.message);
    setBusy(true);
    try {
      if (twoFactor) {
        const answer = backupCode ? await authClient.twoFactor.verifyBackupCode({code:authCode}) : await authClient.twoFactor.verifyTotp({ code: authCode });
        if (answer.error) throw new Error(answer.error.message ?? 'Incorrect authenticator code.');
        location.assign(next);
        return;
      }
      const r =
        mode === "up"
          ? await authClient.signUp.email({ name, email, password, callbackURL: next }, {headers:captchaToken?{'x-captcha-response':captchaToken}:{}})
          : await authClient.signIn.email({ email, password, callbackURL: next });
      if (r.error) throw new Error(r.error.message ?? "Could not sign in.");
      if ((r.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) { setTwoFactor(true); setBusy(false); return; }
      if (mode === 'up' && !(r.data as { token?: string | null } | null)?.token) { setVerificationSent(true); setBusy(false); return; }
      if (verdict?.kind === "ok") await confirmMinimumAge({ data: { year: verdict.year, month: verdict.month, day: verdict.day } });
      if (mode === 'up' && search.ref) { try { await claimReferral({ data: { code: search.ref } }); } catch { /* already referred or invalid — never block sign-up */ } }
      // A full page load, so every part of the site picks up the new session.
      location.assign(next);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const switchMode = (next: "in" | "up") => {
    setMode(next);
    setError("");
    setTwoFactor(false);
    setVerificationSent(false);
  };
  const up = mode === "up";

  return (
    <AuthFrame>
      <main id="main">
        <StepHeader back step={up ? 1 : undefined} />

        <div className="relative mx-auto w-full max-w-[480px] px-4 lg:pt-6">
          <AuthTitle
            lead={up ? t("login.lead.up") : t("login.lead.in")}
            highlight={up ? t("login.highlight.up") : t("login.highlight.in")}
            text={
              up
                ? t("login.text.up")
                : t("login.text.in")
            }
            className={up ? "mt-2.5" : "mt-5"}
          />

          <AuthCard className="mt-4">
            <FilterPills
              fill
              label="Account access"
              className="mx-0 px-0 py-0 lg:py-0"
              items={[
                { key: "up", label: t("login.tab.up"), icon: <Sparkles />, tone: "violet" },
                { key: "in", label: t("login.tab.in"), icon: <LogIn />, tone: "blue" },
              ]}
              value={mode}
              onChange={(k) => switchMode(k as "in" | "up")}
            />

            {search.ref && referral.data?.valid ? (
              <p role="status" className="rounded-tile bg-tint-green p-3 text-sm font-semibold text-green-ink">
                {t("login.invited", { name: referral.data.name })}
              </p>
            ) : null}

            <form className="flex flex-col gap-4" onSubmit={submit} noValidate={false}>
              {verificationSent && <p role="status" className="rounded-tile bg-tint-violet p-3 text-sm">{t("login.emailConfirm")}</p>}
              {twoFactor && <><Field label={backupCode?'Backup code':'Authenticator code'} inputMode={backupCode?'text':'numeric'} autoComplete="one-time-code" value={authCode} onChange={e => setAuthCode(e.target.value)} maxLength={backupCode?30:6} placeholder={backupCode?'Single-use backup code':'Six-digit code'} required/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={backupCode} onChange={e=>{setBackupCode(e.target.checked);setAuthCode('');}}/>Use a backup code</label></>}
              {up && (
                <Field
                  label={t("login.field.displayName")}
                  autoComplete="nickname"
                  required
                  minLength={2}
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("login.field.displayNamePlaceholder")}
                />
              )}
              <Field
                label={t("login.field.email")}
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.field.emailPlaceholder")}
              />
              <Field
                label={t("login.field.password")}
                autoComplete={up ? "new-password" : "current-password"}
                type={show ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.field.passwordPlaceholder")}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? t("login.hidePassword") : t("login.showPassword")}
                    className="k-focus grid size-11 place-items-center rounded-full text-muted hover:text-ink"
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
              {!up && (
                <Link
                  to="/forgot-password"
                  className="k-focus -mt-2 self-end rounded-full px-1 py-1.5 text-[13px] font-bold text-violet hover:underline"
                >
                  {t("login.forgot")}
                </Link>
              )}
              {up && <BirthdayFields value={birthday} onChange={setBirthday} />}
              {up&&capabilities.data?.captchaSiteKey&&<CaptchaField siteKey={capabilities.data.captchaSiteKey} onToken={setCaptchaToken}/>}

              {error && <FormError>{error}</FormError>}
              <GradientButton type="submit" gradient="hero" size="lg" arrow full disabled={busy}>
                {busy ? t("login.submit.busy") : twoFactor ? t("login.submit.twoFactor") : up ? t("login.submit.up") : t("login.submit.in")}
              </GradientButton>
            </form>

            {(capabilities.data?.google||capabilities.data?.apple)&&<div className="grid gap-2">{(['google','apple'] as const).filter(provider=>capabilities.data?.[provider]).map(provider=><OutlineButton key={provider} full onClick={async()=>{const response=await authClient.signIn.social({provider,callbackURL:next});if(response.error)setError(response.error.message??'Provider sign-in failed.');}}>{t("login.continueWith", { provider: provider === 'apple' ? 'Apple' : 'Google' })}</OutlineButton>)}</div>}
            {capabilities.data?.phone&&<div className="space-y-3 rounded-tile border border-border p-3"><p className="font-bold">{t("login.phone.title")}</p><Field label={t("login.phone.number")} type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+16045551234"/>{phoneSent&&<Field label={t("login.phone.code")} inputMode="numeric" value={phoneCode} onChange={e=>setPhoneCode(e.target.value)} maxLength={6}/>}<OutlineButton full onClick={async()=>{setError('');try{if(phoneSent){const response=await authClient.phoneNumber.verify({phoneNumber:phone,code:phoneCode});if(response.error)throw new Error(response.error.message);if((response.data as {twoFactorRedirect?:boolean}|null)?.twoFactorRedirect){setTwoFactor(true);return;}location.assign(next);}else{const response=await authClient.phoneNumber.sendOtp({phoneNumber:phone});if(response.error)throw new Error(response.error.message);setPhoneSent(true);}}catch(e){setError(e instanceof Error?e.message:'Phone sign-in failed.');}}}>{phoneSent ? t('login.phone.verify') : t('login.phone.send')}</OutlineButton></div>}

            {import.meta.env.VITE_OAUTH_ENABLED === "true" && (
              <div className="grid gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <OutlineButton
                    key={p.providerId}
                    size="md"
                    className="h-11 w-full"
                    onClick={() => signIn(p.providerId, { callbackURL: next })}
                  >
                    {t("login.continueWith", { provider: p.label })}
                  </OutlineButton>
                ))}
              </div>
            )}

            <p className="text-center text-[12px] leading-[1.5] font-semibold text-subtle">
              {t("login.agree")}{" "}
              <Link to="/terms" className="k-focus text-violet hover:underline">
                {t("login.terms")}
              </Link>{" "}
              {t("login.and")}{" "}
              <Link to="/privacy" className="k-focus text-violet hover:underline">
                {t("login.privacy")}
              </Link>
              .
            </p>
            <p className="-mt-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-muted">
              <ShieldCheck className="size-4 text-green-ink" aria-hidden /> {t("login.ageNote")}
            </p>
          </AuthCard>

          <div className="mt-2 flex flex-col items-center">
            <button
              type="button"
              onClick={() => switchMode(up ? "in" : "up")}
              className="k-focus inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-semibold text-violet hover:underline"
            >
              {up ? t("login.switch.toIn") : t("login.switch.toUp")}
            </button>
            <p className="text-[13.5px] text-muted">
              {t("login.looking")}{" "}
              <Link to="/explore" className="k-focus font-bold text-violet hover:underline">
                {t("login.explore")}
              </Link>
            </p>
          </div>
        </div>
      </main>
    </AuthFrame>
  );
}
