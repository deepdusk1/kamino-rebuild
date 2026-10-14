import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authRequest, rpc, setAuthToken, setUnauthorizedHandler } from "@/api/client";
import {apiBaseUrl} from '@/api/config';
import * as WebBrowser from 'expo-web-browser';
import { api } from "@/api/endpoints";
import { deleteSecret, readSecret, writeSecret } from "./storage";
import { unregisterPushDevice } from "@/lib/push";

const TOKEN_KEY = "kamino.session-token";

/** `needsAge`: signed in, but has not passed the 13+ birthday check yet. */
type Status = "loading" | "signedOut" | "needsAge" | "signedIn";

export type Birthday = { year: number; month: number; day: number };

type Session = {
  status: Status;
  /** The signed-in user's ID (null when signed out). Used to scope per-account storage like the offline queue. */
  userId: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, birthday: Birthday) => Promise<void>;
  /** Sends the birthday to the server. Resolves false (and signs out) when the person is too young. */
  confirmAge: (birthday: Birthday) => Promise<boolean>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  verifyTwoFactor: (code: string, backup?: boolean) => Promise<void>;
  socialSignIn: (provider:'google'|'apple') => Promise<void>;
  sendPhoneCode: (phoneNumber:string) => Promise<void>;
  verifyPhoneCode: (phoneNumber:string,code:string) => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [userId, setUserId] = useState<string | null>(null);

  const clearLocal = useCallback(async () => {
    const { unwireOfflineFlush } = await import("@/lib/offline-queue");
    unwireOfflineFlush();
    setAuthToken(null);
    setUserId(null);
    await deleteSecret(TOKEN_KEY);
    queryClient.clear();
    setStatus("signedOut");
  }, [queryClient]);

  // On launch: restore a saved token and check the server still accepts it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await readSecret(TOKEN_KEY);
      if (!saved) return void (!cancelled && setStatus("signedOut"));
      setAuthToken(saved);
      try {
        const boot = await api.bootstrap();
        if (cancelled) return;
        if (!boot.profile) await clearLocal();
        else {
          setUserId(boot.profile.userId ?? null);
          setStatus(boot.profile.minAgeConfirmed ? "signedIn" : "needsAge");
        }
      } catch (error) {
        if (cancelled) return;
        // Offline at launch keeps the session; only a real "not signed in" answer logs out.
        const unauthorized = (error as { status?: number }).status === 401;
        if (unauthorized) await clearLocal();
        else setStatus("signedIn");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearLocal]);

  // Any later 401 (token revoked, account deleted) drops the user back to the sign-in screen.
  useEffect(() => {
    setUnauthorizedHandler(() => void clearLocal());
    return () => setUnauthorizedHandler(null);
  }, [clearLocal]);

  const finishSignIn = useCallback(
    async (token: string | null) => {
      if (!token) throw new Error("The server did not return a session. Please try again.");
      setAuthToken(token);
      await writeSecret(TOKEN_KEY, token);
      queryClient.clear();
      const boot = await api.bootstrap(); // creates the member profile on first sign-in
      setUserId(boot.profile?.userId ?? null);
      setStatus(boot.profile?.minAgeConfirmed === false ? "needsAge" : "signedIn");
    },
    [queryClient],
  );

  const value = useMemo<Session>(
    () => ({
      status,
      userId,
      signIn: async (email, password) => {
        const { token, body } = await authRequest("sign-in/email", { email: email.trim(), password });
        if (body.twoFactorRedirect) throw Object.assign(new Error('Enter your authenticator code to complete sign-in.'), { twoFactorRequired: true });
        await finishSignIn(token);
      },
      signUp: async (name, email, password, birthday) => {
        const capabilities=await rpc<{captchaSiteKey:string|null}>('getSignInCapabilities');
        let captchaToken='';
        if(capabilities.captchaSiteKey){const result=await WebBrowser.openAuthSessionAsync(`${apiBaseUrl()}/captcha`,'kamino://captcha-complete');if(result.type!=='success')throw new Error('Complete the verification to create your account.');captchaToken=new URL(result.url).searchParams.get('token')??'';if(!captchaToken)throw new Error('Verification failed. Please try again.');}
        const { token } = await authRequest("sign-up/email", { name: name.trim(), email: email.trim(), password },captchaToken?{'x-captcha-response':captchaToken}:{});
        if (!token) throw new Error('Check your email for the confirmation link, then sign in to complete your account.');
        setAuthToken(token);
        const answer = await api.confirmAge(birthday);
        if (!answer.ok) {
          await clearLocal(); // the server has already erased the account
          throw new Error("Kamino is for people aged 13 and over, so we can't create an account for you.");
        }
        await finishSignIn(token);
      },
      confirmAge: async (birthday) => {
        const answer = await api.confirmAge(birthday);
        if (!answer.ok) {
          await clearLocal();
          return false;
        }
        queryClient.clear();
        setStatus("signedIn");
        return true;
      },
      signOut: async () => {
        await unregisterPushDevice().catch(() => undefined);
        await authRequest("sign-out", {}).catch(() => undefined); // best effort: local sign-out must always work
        await clearLocal();
      },
      requestPasswordReset: async (email) => {
        await authRequest("request-password-reset", { email: email.trim(), redirectTo: "/reset-password" });
      },
      verifyTwoFactor: async (code, backup = false) => {
        const { token } = await authRequest(backup ? 'two-factor/verify-backup-code' : 'two-factor/verify-totp', { code: code.trim() });
        await finishSignIn(token);
      },
      socialSignIn: async provider => {
        const flow=await rpc<{flowId:string;verifier:string;url:string;returnUrl:string}>('beginMobileOAuth',provider);
        const result=await WebBrowser.openAuthSessionAsync(flow.url,flow.returnUrl);
        if(result.type!=='success')throw new Error('Sign-in was cancelled.');
        const callback=new URL(result.url),callbackProof=callback.searchParams.get('proof');
        if(callback.searchParams.get('flow')!==flow.flowId||!callbackProof)throw new Error('The sign-in response could not be verified.');
        const exchanged=await rpc<{token:string}>('finishMobileOAuth',{flowId:flow.flowId,verifier:flow.verifier,callbackProof});await finishSignIn(exchanged.token);
      },
      sendPhoneCode: async phoneNumber => {await authRequest('phone-number/send-otp',{phoneNumber:phoneNumber.trim()});},
      verifyPhoneCode: async(phoneNumber,code)=>{const response=await authRequest('phone-number/verify',{phoneNumber:phoneNumber.trim(),code:code.trim()});if(response.body.twoFactorRedirect)throw Object.assign(new Error('Enter your authenticator code to complete sign-in.'),{twoFactorRequired:true});await finishSignIn(response.token??(typeof response.body.token==='string'?response.body.token:null));},
    }),
    [status, userId, finishSignIn, clearLocal, queryClient],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** The raw session token, for surfaces that need to hand the sign-in to a WebView (watch party). */
export async function readSessionToken(): Promise<string | null> {
  return readSecret(TOKEN_KEY);
}
