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
