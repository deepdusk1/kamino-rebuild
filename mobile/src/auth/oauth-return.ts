/**
 * Reading the address the server sends the browser back to after Google or Apple sign-in:
 *
 *   kamino://auth-complete?flow=<id>&proof=<one-time proof>     signed in
 *   kamino://auth-complete?flow=<id>&error=<code>               the provider or the server refused
 *
 * Kept free of React Native imports so it can be unit-tested.
 */
export const AUTH_RETURN_URL = "kamino://auth-complete";
export const CAPTCHA_RETURN_URL = "kamino://captcha-complete";

export type AuthReturn =
  | { kind: "ok"; flowId: string; proof: string }
  | { kind: "error"; flowId: string | null; code: string }
  | null;

/** True for the app links the sign-in browser returns to (which are not screens of their own). */
export function isAuthReturnLink(path: string): boolean {
  return /(?:^|[:/])(?:auth-complete|captcha-complete)(?:[/?#]|$)/.test(path);
}

export function parseAuthReturn(url: string): AuthReturn {
  if (!url.startsWith(AUTH_RETURN_URL)) return null;
  const query = url.slice(AUTH_RETURN_URL.length).replace(/^\?/, "");
  const params = new URLSearchParams(query);
  const flowId = params.get("flow");
  const error = params.get("error");
  if (error) return { kind: "error", flowId, code: error };
  const proof = params.get("proof");
  if (!flowId || !proof) return { kind: "error", flowId, code: "invalid_response" };
  return { kind: "ok", flowId, proof };
}

/** A plain sentence for each reason sign-in can fail. Unknown codes get a general message. */
export function oauthErrorMessage(code: string, provider: "google" | "apple" | null): string {
  const who = provider === "apple" ? "Apple" : provider === "google" ? "Google" : "the provider";
  switch (code) {
    case "access_denied":
    case "user_cancelled_authorize":
      return `You cancelled signing in with ${who}.`;
    case "account_not_linked":
      return "This email already has a Kamino account. Sign in with your email and password, then connect it in Settings.";
    case "email_not_found":
    case "email_doesn't_match":
      return `${who} didn't share an email address, which Kamino needs to create your account.`;
    case "banned":
    case "account_suspended":
      return "This account is suspended or banned. Contact Kamino support.";
    case "signup_disabled":
      return "New accounts can't be created right now.";
    case "flow_expired":
    case "state_mismatch":
    case "please_restart_the_process":
      return "Sign-in took too long. Please try again.";
    default:
      return `Signing in with ${who} didn't work. Please try again.`;
  }
}
