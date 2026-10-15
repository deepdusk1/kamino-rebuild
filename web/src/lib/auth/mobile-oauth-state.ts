import { createHash, randomBytes } from 'node:crypto';
import type { Sql } from '@/lib/db';

export const verifierHash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Only the browser callback receives this proof. A flow initiator cannot poll for another person's session. */
export async function completeOAuthFlow(sql: Sql, id: string, sessionId: string) {
  const proof = randomBytes(32).toString('base64url');
  const rows = await sql`update identity_oauth_flows set session_id=${sessionId}, callback_proof_hash=${verifierHash(proof)}
    where id=${id} and expires_at>now() and used_at is null and session_id is null returning id`;
  if (!rows.length) throw new Error('This sign-in request expired.');
  return proof;
}

/** All proofs and expiry are checked in one atomic claim; replay and simultaneous exchanges fail closed. */
export async function claimOAuthFlow(sql: Sql, id: string, verifier: string, callbackProof: string) {
  const rows = await sql`update identity_oauth_flows set used_at=now()
    where id=${id} and verifier_hash=${verifierHash(verifier)} and callback_proof_hash=${verifierHash(callbackProof)}
      and expires_at>now() and used_at is null and session_id is not null returning session_id`;
  if (!rows.length) throw new Error('The sign-in request expired or was already used. Please try again.');
  return String(rows[0]!.session_id);
}

/** How long a phone sign-in may take, from opening the browser to coming back. */
export const OAUTH_FLOW_MINUTES = 10;

/** Where the browser is sent back to in the app. */
export const APP_RETURN_URL = 'kamino://auth-complete';

/**
 * The app link the browser returns to: `?flow=…&proof=…` on success, `?flow=…&error=<code>` otherwise. Errors go
 * back to the app as well, so the person sees a message there instead of being stuck on a server page.
 */
export function appReturnLocation(flowId: string, outcome: { proof: string } | { error: string }): string {
  const params = new URLSearchParams({ flow: flowId });
  if ('proof' in outcome) params.set('proof', outcome.proof);
  else params.set('error', outcome.error.replace(/[^a-z0-9_'-]/gi, '_').slice(0, 60) || 'unknown');
  return `${APP_RETURN_URL}?${params.toString()}`;
}

/**
 * A browser session only counts for a phone sign-in if it was created during this sign-in. An older session left in
 * the browser (for example the website, signed in as someone else) must never be handed to the app.
 */
export function isFreshSession(createdAt: Date | string, now = new Date()): boolean {
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) && now.getTime() - created <= OAUTH_FLOW_MINUTES * 60_000 && created <= now.getTime() + 60_000;
}
