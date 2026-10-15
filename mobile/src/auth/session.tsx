import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authRequest, rpc, setAuthToken, setUnauthorizedHandler } from "@/api/client";
import { apiBaseUrl } from "@/api/config";
import { api } from "@/api/endpoints";
import { YOUNG_MESSAGE } from "@/lib/age";
import { unregisterPushDevice } from "@/lib/push";
import { clearPendingOAuth, resumeOAuthFromLink, runCaptcha, signInWithProvider, type Provider } from "./oauth";
import { CAPTCHA_RETURN_URL } from "./oauth-return";
import { deleteSecret, readSecret, writeSecret } from "./storage";

const TOKEN_KEY = "kamino.session-token";
/** Who is signed in and whether they passed the 18+ check, for starting up without a connection. */
const ACCOUNT_KEY = "kamino.session-account";

/** `needsAge`: signed in, but has not passed the 18+ birthday check yet. */
type Status = "loading" | "signedOut" | "needsAge" | "signedIn";

export type Birthday = { year: number; month: number; day: number };

type Session = {
  status: Status;
  /** The signed-in user's ID (null when signed out). Used to scope per-account storage like the offline queue. */
  userId: string | null;
  /** Shown on the sign-in screens, e.g. "Your session ended" after the server signed this phone out. */
  notice: string | null;
  clearNotice: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, birthday: Birthday) => Promise<void>;
  /** Sends the birthday to the server. Resolves false (and signs out) when the person is too young. */
  confirmAge: (birthday: Birthday) => Promise<boolean>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  verifyTwoFactor: (code: string, backup?: boolean) => Promise<void>;
  /** Google or Apple. Rejects with `SignInCancelled` (`cancelled: true`) when the person closed the window. */
  socialSignIn: (provider: Provider) => Promise<void>;
  sendPhoneCode: (phoneNumber: string) => Promise<void>;
  verifyPhoneCode: (phoneNumber: string, code: string) => Promise<void>;
};

type SavedAccount = { userId: string | null; ageConfirmed: boolean };

async function readAccount(): Promise<SavedAccount | null> {
  try {
    const raw = await readSecret(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as SavedAccount) : null;
  } catch {
    return null;
  }
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const statusRef = useRef<Status>("loading");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const remember = useCallback(async (account: SavedAccount) => {
    await writeSecret(ACCOUNT_KEY, JSON.stringify(account));
  }, []);

  const clearLocal = useCallback(async () => {
    const { unwireOfflineFlush } = await import("@/lib/offline-queue");
    unwireOfflineFlush();
    setAuthToken(null);
    setUserId(null);
    await Promise.all([deleteSecret(TOKEN_KEY), deleteSecret(ACCOUNT_KEY), clearPendingOAuth()]);
    queryClient.clear();
    setStatus("signedOut");
  }, [queryClient]);

  /** Saves a new session token, loads the account and moves on to the age check or the app. */
  const finishSignIn = useCallback(
    async (token: string | null) => {
      if (!token) throw new Error("The server did not return a session. Please try again.");
      setAuthToken(token);
      queryClient.clear();
      let boot: Awaited<ReturnType<typeof api.bootstrap>>;
      try {
        boot = await api.bootstrap(); // creates the member profile on first sign-in
      } catch (error) {
        setAuthToken(null);
        throw error;
      }
      if (!boot.profile) {
        setAuthToken(null);
        throw new Error("Your account couldn't be loaded. Please try again.");
      }
      await writeSecret(TOKEN_KEY, token);
      const ageConfirmed = boot.profile.minAgeConfirmed === true;
      await remember({ userId: boot.profile.userId ?? null, ageConfirmed });
      setNotice(null);
      setUserId(boot.profile.userId ?? null);
      setStatus(ageConfirmed ? "signedIn" : "needsAge");
    },
    [queryClient, remember],
  );

  // On launch: restore a saved session, or finish a Google/Apple sign-in whose return link reopened the app.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await readSecret(TOKEN_KEY);
      if (!saved) {
        // Android may have closed Kamino while the sign-in browser was open; the return link restarts it.
        const resumed = await resumeOAuthFromLink(await Linking.getInitialURL().catch(() => null)).catch(
          (error: unknown) => {
            if (!cancelled) setNotice(error instanceof Error ? error.message : "Sign-in didn't finish.");
            return null;
          },
        );
        if (cancelled) return;
        if (resumed) {
          await finishSignIn(resumed).catch(() => {
            if (!cancelled) setStatus("signedOut");
          });
          return;
        }
        setStatus("signedOut");
        return;
      }
      setAuthToken(saved);
      try {
        const boot = await api.bootstrap();
        if (cancelled) return;
        if (!boot.profile) return void (await clearLocal());
        const ageConfirmed = boot.profile.minAgeConfirmed === true;
        await remember({ userId: boot.profile.userId ?? null, ageConfirmed });
        setUserId(boot.profile.userId ?? null);
        setStatus(ageConfirmed ? "signedIn" : "needsAge");
      } catch (error) {
        if (cancelled) return;
        if ((error as { status?: number }).status === 401) {
          setNotice("Your session ended. Please sign in again.");
          await clearLocal();
          return;
        }
        // Offline at launch: keep the session, using what was known last time. Someone who never passed the
        // 18+ check stays on it.
        const account = await readAccount();
        setUserId(account?.userId ?? null);
        setStatus(account?.ageConfirmed ? "signedIn" : "needsAge");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearLocal, finishSignIn, remember]);

  // Any later 401 (session expired or revoked, account deleted) drops the person back to the sign-in screen,
  // with a note saying why.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (statusRef.current === "signedIn" || statusRef.current === "needsAge")
        setNotice("Your session ended. Please sign in again.");
      void clearLocal();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearLocal]);

  const value = useMemo<Session>(
    () => ({
      status,
      userId,
      notice,
      clearNotice: () => setNotice(null),
      signIn: async (email, password) => {
        const { token, body } = await authRequest("sign-in/email", { email: email.trim(), password });
        if (body.twoFactorRedirect)
          throw Object.assign(new Error("Enter your authenticator code to complete sign-in."), { twoFactorRequired: true });
        await finishSignIn(token);
      },
      signUp: async (name, email, password, birthday) => {
        const capabilities = await rpc<{ captchaSiteKey: string | null }>("getSignInCapabilities");
        const captchaToken = capabilities.captchaSiteKey
          ? await runCaptcha(`${apiBaseUrl()}/captcha`, CAPTCHA_RETURN_URL)
          : "";
        const { token } = await authRequest(
          "sign-up/email",
          { name: name.trim(), email: email.trim(), password },
          captchaToken ? { "x-captcha-response": captchaToken } : {},
        );
        if (!token)
          throw new Error("Check your email for the confirmation link, then sign in to finish creating your account.");
        // The 18+ check runs before the account is used for anything.
        setAuthToken(token);
        const answer = await api.confirmAge(birthday).catch((error: unknown) => {
          setAuthToken(null);
          throw error;
        });
        if (!answer.ok) {
          await clearLocal(); // the server has already erased the account
          throw new Error(YOUNG_MESSAGE);
        }
        await finishSignIn(token);
      },
      confirmAge: async (birthday) => {
        const answer = await api.confirmAge(birthday);
        if (!answer.ok) {
          await clearLocal();
          return false;
        }
        await remember({ userId, ageConfirmed: true });
        queryClient.clear();
        setStatus("signedIn");
        return true;
      },
      signOut: async () => {
        await unregisterPushDevice().catch(() => undefined);
        await authRequest("sign-out", {}).catch(() => undefined); // best effort: local sign-out must always work
        // Unsent messages are private too: they don't stay on the phone after signing out.
        if (userId) {
          const { clearQueue } = await import("@/lib/offline-queue");
          await clearQueue(userId).catch(() => undefined);
        }
        setNotice(null);
        await clearLocal();
      },
      requestPasswordReset: async (email) => {
        await authRequest("request-password-reset", { email: email.trim(), redirectTo: "/reset-password" });
      },
      verifyTwoFactor: async (code, backup = false) => {
        const { token } = await authRequest(backup ? "two-factor/verify-backup-code" : "two-factor/verify-totp", {
          code: code.trim(),
        });
        await finishSignIn(token);
      },
      socialSignIn: async (provider) => {
        setNotice(null);
        await finishSignIn(await signInWithProvider(provider));
      },
      sendPhoneCode: async (phoneNumber) => {
        await authRequest("phone-number/send-otp", { phoneNumber: phoneNumber.trim() });
      },
      verifyPhoneCode: async (phoneNumber, code) => {
        const response = await authRequest("phone-number/verify", { phoneNumber: phoneNumber.trim(), code: code.trim() });
        if (response.body.twoFactorRedirect)
          throw Object.assign(new Error("Enter your authenticator code to complete sign-in."), { twoFactorRequired: true });
        await finishSignIn(response.token ?? (typeof response.body.token === "string" ? response.body.token : null));
      },
    }),
    [status, userId, notice, finishSignIn, clearLocal, queryClient, remember],
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

/** True for an error that only means the person closed the sign-in window (show nothing for it). */
export function isCancelledSignIn(error: unknown): boolean {
  return Boolean((error as { cancelled?: boolean } | null)?.cancelled);
}
