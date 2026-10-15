import * as WebBrowser from "expo-web-browser";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {useQuery} from '@tanstack/react-query';
import {rpc} from '@/api/client';
import { Pressable, View } from "react-native";
import { apiBaseUrl } from "@/api/config";
import { BirthdayFields, EMPTY_BIRTHDAY, judgeBirthday, YOUNG_MESSAGE } from "@/components/BirthdayFields";
import { GradientWord, VIOLET_GRADIENT } from "@/components/home/Decor";
import { StepHeader } from "@/components/home/StepHeader";
import { FilterPills, GradientButton } from "@/components/k";
import { Appear, Button, Field, Screen, Sheet, Txt } from "@/components/ui";
import { useSession } from "@/auth/session";
import { errorMessage } from "@/lib/errors";
import { font, radius, shadow, space, useTheme } from "@/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Onboarding step 1: create an account (name, email, password, 13+ birthday check) or sign in.
 * The Welcome screen opens it with `?mode=up` (Get Started) or `?mode=in` (I already have an account).
 */
export default function SignIn() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { signIn, signUp, requestPasswordReset, verifyTwoFactor,socialSignIn,sendPhoneCode,verifyPhoneCode } = useSession();

  const [mode, setMode] = useState<"in" | "up">(params.mode === "up" ? "up" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthday, setBirthday] = useState(EMPTY_BIRTHDAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [backup,setBackup]=useState(false);const [phone,setPhone]=useState('');const [phoneCode,setPhoneCode]=useState('');const [phoneSent,setPhoneSent]=useState(false);
  const capabilities=useQuery({queryKey:['signInCapabilities'],queryFn:()=>rpc<{google:boolean;apple:boolean;phone:boolean;captchaSiteKey:string|null}>('getSignInCapabilities')});

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent">("idle");
  const [resetError, setResetError] = useState<string | null>(null);

  // Validate up-front so people get a clear reason instead of a generic server error.
  function validate(): string | null {
    if (mode === "up" && name.trim().length < 2) return "Choose a display name (at least 2 characters).";
    if (!EMAIL.test(email.trim())) return "Enter a valid email address.";
    if (password.length < 8) return "Your password needs at least 8 characters.";
    if (mode === "up") {
      const verdict = judgeBirthday(birthday);
      if (verdict.kind === "young") return YOUNG_MESSAGE;
      if (verdict.kind === "invalid") return verdict.message;
    }
    return null;
  }

  async function submit() {
    if (twoFactor) {
      setBusy(true); setError(null);
      try { await verifyTwoFactor(authCode,backup); } catch(e) { setError(errorMessage(e)); setBusy(false); }
      return;
    }
    const problem = validate();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const verdict = judgeBirthday(birthday);
      if (mode === "up" && verdict.kind === "ok") {
        await signUp(name, email, password, { year: verdict.year, month: verdict.month, day: verdict.day });
      } else {
        await signIn(email, password);
      }
      // On success the root layout swaps to the signed-in screens by itself (and new accounts go to onboarding).
    } catch (e) {
      if ((e as {twoFactorRequired?:boolean}).twoFactorRequired) setTwoFactor(true);
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function sendReset() {
    if (!EMAIL.test(resetEmail.trim())) return setResetError("Enter the email you signed up with.");
    setResetState("sending");
    setResetError(null);
    try {
      await requestPasswordReset(resetEmail);
      setResetState("sent");
    } catch (e) {
      setResetError(errorMessage(e));
      setResetState("idle");
    }
  }

  const switchMode = (next: "in" | "up") => {
    setTwoFactor(false);
    setMode(next);
    setError(null);
  };
  const openWeb = (path: string) => void WebBrowser.openBrowserAsync(`${apiBaseUrl()}${path}`);
  const up = mode === "up";

  return (
    <Screen padded={false}>
      <StepHeader onBack={router.canGoBack() ? () => router.back() : undefined} step={up ? 1 : undefined} />

      <Appear style={{ alignItems: "center", paddingHorizontal: space.xl, gap: 6, marginTop: up ? 10 : 18 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }} accessible accessibilityRole="header" accessibilityLabel={up ? "Create Your Account" : "Welcome Back"}>
          <Txt style={{ fontFamily: font.heavy, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, color: theme.ink }}>{up ? "Create Your " : "Welcome "}</Txt>
          <GradientWord text={up ? "Account" : "Back"} size={32} colors={VIOLET_GRADIENT} />
        </View>
        <Txt style={{ textAlign: "center", fontFamily: font.regular, fontSize: 15, lineHeight: 20, color: theme.muted, maxWidth: 330 }}>
          {up ? "A calm place for your communities. Free to join, no pushy notifications." : "Good to see you again. Sign in to get back to your people."}
        </Txt>
      </Appear>

      <Appear index={1} style={{ padding: space.lg, paddingTop: space.lg }}>
        <View style={[{ backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, padding: space.lg, gap: space.lg }, shadow.card]}>
          <FilterPills
            layout="fill"
            inset={0}
            items={[{ key: "up", label: "Create account", icon: "sparkles" }, { key: "in", label: "Sign in", icon: "log-in-outline" }]}
            value={mode}
            onChange={(k) => switchMode(k as "in" | "up")}
          />

          {up ? <Field label="Display name" value={name} onChangeText={setName} autoComplete="nickname" maxLength={40} placeholder="What should we call you?" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={up ? "new-password" : "current-password"} placeholder="At least 8 characters" />
          {twoFactor && <><Field label={backup?'Backup code':'Authenticator code'} value={authCode} onChangeText={setAuthCode} keyboardType={backup?'default':'number-pad'} maxLength={backup?30:6} autoComplete="one-time-code" placeholder={backup?'Single-use backup code':'Six-digit code'}/><Button small variant="secondary" label={backup?'Use authenticator':'Use backup code'} onPress={()=>{setBackup(!backup);setAuthCode('');}}/></>}

          {!up ? (
            <Pressable onPress={() => { setResetEmail(email); setResetState("idle"); setResetError(null); setResetOpen(true); }} accessibilityRole="button" accessibilityLabel="Forgot your password?" hitSlop={12} style={{ alignSelf: "flex-end", marginTop: -6 }}>
              <Txt variant="small" tone="accent" style={{ fontFamily: font.bold }}>Forgot your password?</Txt>
            </Pressable>
          ) : null}
          {up ? <BirthdayFields value={birthday} onChange={setBirthday} /> : null}

          {error ? <Txt tone="danger" accessibilityLiveRegion="polite">{error}</Txt> : null}
          <GradientButton label={twoFactor ? 'Verify code' : up ? "Create My Account" : "Sign In"} gradient="hero" size="lg" iconRight="arrow-forward" full busy={busy} onPress={() => void submit()} />
          {(['google','apple'] as const).filter(provider=>capabilities.data?.[provider]).map(provider=><Button key={provider} variant="secondary" label={`Continue with ${provider==='apple'?'Apple':'Google'}`} busy={busy} onPress={async()=>{setBusy(true);setError(null);try{await socialSignIn(provider);}catch(e){setError(errorMessage(e));setBusy(false);}}}/>)}
          {capabilities.data?.phone&&<View style={{gap:10}}><Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+16045551234"/>{phoneSent&&<Field label="SMS code" value={phoneCode} onChangeText={setPhoneCode} keyboardType="number-pad" maxLength={6}/>}<Button label={phoneSent?'Verify SMS code':'Send SMS code'} variant="secondary" busy={busy} onPress={async()=>{setBusy(true);setError(null);try{if(phoneSent)await verifyPhoneCode(phone,phoneCode);else{await sendPhoneCode(phone);setPhoneSent(true);}}catch(e){if((e as {twoFactorRequired?:boolean}).twoFactorRequired)setTwoFactor(true);setError(errorMessage(e));}finally{setBusy(false);}}}/></View>}

          <Txt variant="caption" tone="subtle" style={{ textAlign: "center" }}>
            By continuing you agree to the{" "}
            <Txt variant="caption" tone="accent" onPress={() => openWeb("/terms")}>Terms</Txt> and{" "}
            <Txt variant="caption" tone="accent" onPress={() => openWeb("/privacy")}>Privacy policy</Txt>.
          </Txt>
        </View>
      </Appear>

      <Pressable onPress={() => switchMode(up ? "in" : "up")} accessibilityRole="button" accessibilityLabel={up ? "I already have an account: sign in" : "New here? Create an account"} style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
        <Txt style={{ fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: theme.accent }}>{up ? "I already have an account" : "New here? Create an account"}</Txt>
      </Pressable>

      <Sheet visible={resetOpen} title="Reset your password" onClose={() => setResetOpen(false)}>
        {resetState === "sent" ? (
          <>
            <Txt>If an account exists for {resetEmail.trim()}, we’ve sent a link to choose a new password. It works for one hour.</Txt>
            <GradientButton label="Done" gradient="hero" size="lg" full onPress={() => setResetOpen(false)} />
          </>
        ) : (
          <>
            <Txt tone="muted">Enter your email and we’ll send you a reset link.</Txt>
            <Field label="Email" value={resetEmail} onChangeText={setResetEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={resetError} />
            <GradientButton label="Send reset link" gradient="hero" size="lg" full busy={resetState === "sending"} onPress={() => void sendReset()} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
