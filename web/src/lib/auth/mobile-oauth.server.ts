import { randomBytes } from 'node:crypto';
import { getSql } from '@/lib/db';
import { SESSION_TOKEN_COOKIE, auth } from './server';
import {
  OAUTH_FLOW_MINUTES,
  appReturnLocation,
  claimOAuthFlow,
  completeOAuthFlow,
  isFreshSession,
  verifierHash,
} from './mobile-oauth-state';

/**
 * Google / Apple sign-in for the phone app, through the system browser.
 *
 * 1. `beginOAuth` (RPC from the app) stores a flow with the hash of a secret only the phone knows.
 * 2. The browser opens `/api/v1/auth/mobile-start`, which hands over to Google or Apple.
 * 3. Better Auth handles the provider's answer and sends the browser to `/api/v1/auth/mobile-callback`, which
 *    binds the new session to the flow and sends the browser back to the app with a one-time proof
 *    (`kamino://auth-complete?flow&proof`), or with `&error=<code>` when anything went wrong.
 * 4. `exchangeOAuth` (RPC from the app) gives the session token only for the phone's secret plus that proof.
 */
export function configuredSocialProviders() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
  };
}

export async function beginOAuth(provider: 'google' | 'apple', origin: string) {
  if (!configuredSocialProviders()[provider])
    throw new Error(`${provider === 'apple' ? 'Apple' : 'Google'} sign-in isn't available yet.`);
  const sql = await getSql(),
    id = randomBytes(24).toString('base64url'),
    verifier = randomBytes(32).toString('base64url');
  await sql`delete from identity_oauth_flows where expires_at < now()`;
  await sql`insert into identity_oauth_flows(id,verifier_hash,provider,expires_at)
    values(${id},${verifierHash(verifier)},${provider},now() + ${OAUTH_FLOW_MINUTES} * interval '1 minute')`;
  return {
    flowId: id,
    verifier,
    url: `${origin}/api/v1/auth/mobile-start?flow=${encodeURIComponent(id)}`,
    returnUrl: 'kamino://auth-complete',
  };
}

function serverOrigin(request: Request) {
  return process.env.BETTER_AUTH_URL?.replace(/\/+$/, '') ?? new URL(request.url).origin;
}

/** Sends the browser back to the app. Also signs the browser itself out: the session now lives in the app. */
function backToApp(flowId: string, outcome: { proof: string } | { error: string }) {
  const headers = new Headers({
    location: appReturnLocation(flowId, outcome),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  const secure = SESSION_TOKEN_COOKIE.startsWith('__Host-') ? '; Secure' : '';
  const prefix = SESSION_TOKEN_COOKIE.replace(/\.session_token$/, '');
  for (const name of [SESSION_TOKEN_COOKIE, `${prefix}.session_data`])
    headers.append('set-cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  return new Response(null, { status: 302, headers });
}

export async function mobileOAuthStart(request: Request) {
  const id = new URL(request.url).searchParams.get('flow') ?? '';
  if (!id) return new Response('This sign-in link is incomplete. Return to Kamino and try again.', { status: 400 });
  const sql = await getSql();
  const flow = (
    await sql`select provider from identity_oauth_flows
      where id=${id} and expires_at>now() and used_at is null and session_id is null`
  )[0];
  if (!flow) return backToApp(id, { error: 'flow_expired' });
  const callback = `${serverOrigin(request)}/api/v1/auth/mobile-callback?flow=${encodeURIComponent(id)}`;
  try {
    const response = await auth.api.signInSocial({
      body: {
        provider: String(flow.provider) as 'google' | 'apple',
        callbackURL: callback,
        newUserCallbackURL: callback,
        // Refusals and errors come back here too (Better Auth adds `&error=…`), so they reach the app.
        errorCallbackURL: `${callback}&failed=1`,
        disableRedirect: false,
      },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.headers.get('location')) return backToApp(id, { error: 'provider_unavailable' });
    // Keep Better Auth's cookies (they hold the sign-in state the provider's answer is checked against).
    return new Response(null, { status: 302, headers: response.headers });
  } catch {
    return backToApp(id, { error: 'provider_unavailable' });
  }
}

export async function mobileOAuthCallback(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get('flow') ?? '';
  if (!id) return new Response('This sign-in link is incomplete. Return to Kamino and try again.', { status: 400 });
  if (params.get('failed') || params.get('error')) return backToApp(id, { error: params.get('error') ?? 'unknown' });
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return backToApp(id, { error: 'no_session' });
  // Only a session made by this sign-in may go to the phone, never one already sitting in the browser.
  if (!isFreshSession(session.session.createdAt)) return backToApp(id, { error: 'please_restart_the_process' });
  const sql = await getSql();
  try {
    const proof = await completeOAuthFlow(sql, id, session.session.id);
    return backToApp(id, { proof });
  } catch {
    return backToApp(id, { error: 'flow_expired' });
  }
}

export async function exchangeOAuth(id: string, verifier: string, callbackProof: string) {
  const sql = await getSql();
  const sessionId = await claimOAuthFlow(sql, id, verifier, callbackProof);
  const session = (await sql`select token from "session" where id=${sessionId} and "expiresAt">now()`)[0];
  if (!session) throw new Error('This sign-in session expired. Please try again.');
  return { token: String(session.token) };
}
