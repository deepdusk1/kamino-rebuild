import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { authRequest, rpc } from "@/api/client";
import { AUTH_RETURN_URL, oauthErrorMessage, parseAuthReturn } from "./oauth-return";
import { deleteSecret, readSecret, writeSecret } from "./storage";

/**
 * Google and Apple sign-in.
 *
 * Web flow (Google everywhere, Apple on Android):
 * 1. `beginMobileOAuth` gives a one-time flow id plus a secret "verifier" that only this phone knows.
 * 2. The sign-in page opens in the system browser (Chrome Custom Tab / ASWebAuthenticationSession).
 * 3. The server sends the browser back to `kamino://auth-complete?flow=…&proof=…` (or `&error=…`).
 * 4. `finishMobileOAuth` swaps verifier + proof for a session token. Neither half alone is enough.
 *
 * Android can close Kamino while the browser is open (low memory). The flow is saved first, so when the browser's
 * return link reopens the app, `resumeOAuthFromLink` finishes the sign-in instead of losing it.
 *
 * Native flow (Apple on iPhone): the system "Sign in with Apple" sheet, then the server checks Apple's signed token.
 */

export type Provider = "google" | "apple";

/** Thrown when the person closed the sign-in window themselves; screens show nothing for it. */
export class SignInCancelled extends Error {
  readonly cancelled = true;
  constructor() {
    super("Sign-in was cancelled.");
    this.name = "SignInCancelled";
  }
}

const PENDING_KEY = "kamino.oauth-pending";
/** The server forgets a flow after 10 minutes; a saved flow older than that can't be finished. */
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

type PendingFlow = { flowId: string; verifier: string; provider: Provider; startedAt: number };

async function savePending(flow: PendingFlow) {
  await writeSecret(PENDING_KEY, JSON.stringify(flow));
}

async function readPending(): Promise<PendingFlow | null> {
  const raw = await readSecret(PENDING_KEY);
  if (!raw) return null;
  try {
    const flow = JSON.parse(raw) as PendingFlow;
    if (Date.now() - flow.startedAt > PENDING_MAX_AGE_MS) {
      await deleteSecret(PENDING_KEY);
      return null;
    }
    return flow;
  } catch {
    await deleteSecret(PENDING_KEY);
    return null;
  }
}

export async function clearPendingOAuth() {
  await deleteSecret(PENDING_KEY);
}

/** Turns the browser's return link into a session token, or throws a readable error. */
async function finishFromLink(url: string, flow: PendingFlow): Promise<string> {
  const result = parseAuthReturn(url);
  if (!result || (result.flowId && result.flowId !== flow.flowId)) {
    throw new Error("The sign-in response could not be verified. Please try again.");
  }
  if (result.kind === "error") throw new Error(oauthErrorMessage(result.code, flow.provider));
  const exchanged = await rpc<{ token: string }>("finishMobileOAuth", {
    flowId: flow.flowId,
    verifier: flow.verifier,
    callbackProof: result.proof,
  });
  return exchanged.token;
}

/** Signs in through the provider's web page. Resolves with a Kamino session token. */
async function webSignIn(provider: Provider): Promise<string> {
  const start = await rpc<{ flowId: string; verifier: string; url: string; returnUrl: string }>(
    "beginMobileOAuth",
    provider,
  );
  const flow: PendingFlow = { flowId: start.flowId, verifier: start.verifier, provider, startedAt: Date.now() };
  await savePending(flow);
  try {
    const result = await WebBrowser.openAuthSessionAsync(start.url, start.returnUrl || AUTH_RETURN_URL, {
      // Android: keep the sign-in tab inside Kamino's task, so returning lands back in the app.
      createTask: false,
    });
    if (result.type !== "success") throw new SignInCancelled();
    return await finishFromLink(result.url, flow);
  } finally {
    await clearPendingOAuth();
  }
}

/**
 * Finishes a sign-in whose browser returned after Android restarted Kamino (the original screen was gone).
 * Returns the session token, or null when the link isn't a sign-in return or nothing was waiting for it.
 */
export async function resumeOAuthFromLink(url: string | null): Promise<string | null> {
  if (!url || !parseAuthReturn(url)) return null;
  const flow = await readPending();
  if (!flow) return null;
  try {
    return await finishFromLink(url, flow);
  } finally {
    await clearPendingOAuth();
  }
}

/** Sign in with Apple through the iPhone's own sheet (Face ID, "Hide my email"). */
async function nativeAppleSignIn(): Promise<string> {
  // A random value Apple puts inside its signed token; the server checks it matches, so a stolen token can't be replayed.
  const nonce = Crypto.randomUUID();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new SignInCancelled();
    throw new Error("Sign in with Apple isn't available right now. Please try again.");
  }
  if (!credential.identityToken) throw new Error("Apple didn't confirm the sign-in. Please try again.");
  // Apple only shares the name (and email) the very first time; the server keeps them from then on.
  const firstName = credential.fullName?.givenName ?? undefined;
  const lastName = credential.fullName?.familyName ?? undefined;
  const { body, token } = await authRequest("sign-in/social", {
    provider: "apple",
    idToken: {
      token: credential.identityToken,
      nonce,
      ...(firstName || lastName || credential.email
        ? { user: { name: { firstName, lastName }, ...(credential.email ? { email: credential.email } : {}) } }
        : {}),
    },
  });
  const session = token ?? (typeof body.token === "string" ? body.token : null);
  if (!session) throw new Error("The server did not return a session. Please try again.");
  return session;
}

/** Whether the iPhone's own Sign in with Apple can be used (iOS 13+, in a real build). */
async function canUseNativeApple(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Signs in with Google or Apple and resolves with a Kamino session token. */
export async function signInWithProvider(provider: Provider): Promise<string> {
  if (provider === "apple" && (await canUseNativeApple())) return nativeAppleSignIn();
  return webSignIn(provider);
}

/**
 * The human check (Cloudflare Turnstile) before creating an email account, when the server has one switched on.
 * Resolves with the check's token.
 */
export async function runCaptcha(pageUrl: string, returnUrl: string): Promise<string> {
  const result = await WebBrowser.openAuthSessionAsync(pageUrl, returnUrl, { createTask: false });
  if (result.type !== "success") throw new Error("Complete the verification to create your account.");
  const token = new URLSearchParams(result.url.split("?")[1] ?? "").get("token");
  if (!token) throw new Error("Verification failed. Please try again.");
  return token;
}
