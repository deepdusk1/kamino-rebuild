import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { claimOAuthFlow, completeOAuthFlow, verifierHash } from './mobile-oauth-state.ts';
import type { Sql } from '@/lib/db';

let pg: PGlite;
let sql: Sql;
before(async () => {
  pg = new PGlite(); await pg.waitReady;
  await pg.exec('create table "user"(id text primary key)');
  for (const file of ['0030_identity_signin.sql', '0031_identity_oauth_proof.sql']) {
    await pg.exec(await readFile(new URL(`../../../migrations/${file}`, import.meta.url), 'utf8'));
  }
  sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let statement = strings[0];
    for (let i = 0; i < values.length; i++) statement += `$${i + 1}${strings[i + 1]}`;
    return (await pg.query(statement, values)).rows;
  }) as Sql;
  sql.query = async (statement, values = []) => (await pg.query(statement, values)).rows as never;
});
after(async () => { await pg?.close(); });

async function begin(id: string) {
  await sql`insert into identity_oauth_flows(id,verifier_hash,provider) values(${id},${verifierHash('device-verifier')},'google')`;
}
test('native handoff requires completion, device verifier and callback-only proof', async () => {
  await begin('proof');
  await assert.rejects(claimOAuthFlow(sql, 'proof', 'device-verifier', 'unknown'), /expired|used/);
  const proof = await completeOAuthFlow(sql, 'proof', 'session-proof');
  await assert.rejects(claimOAuthFlow(sql, 'proof', 'wrong-verifier', proof), /expired|used/);
  await assert.rejects(claimOAuthFlow(sql, 'proof', 'device-verifier', 'wrong-proof'), /expired|used/);
  assert.equal(await claimOAuthFlow(sql, 'proof', 'device-verifier', proof), 'session-proof');
  await assert.rejects(claimOAuthFlow(sql, 'proof', 'device-verifier', proof), /expired|used/);
});
test('expired handoffs cannot complete or exchange even with valid proofs', async () => {
  await begin('expired-start');
  await sql`update identity_oauth_flows set expires_at=now()-interval '1 second' where id='expired-start'`;
  await assert.rejects(completeOAuthFlow(sql, 'expired-start', 'expired-session'), /expired/);
  await begin('expired-exchange');
  const proof = await completeOAuthFlow(sql, 'expired-exchange', 'expired-session');
  await sql`update identity_oauth_flows set expires_at=now()-interval '1 second' where id='expired-exchange'`;
  await assert.rejects(claimOAuthFlow(sql, 'expired-exchange', 'device-verifier', proof), /expired|used/);
});
test('browser callback cannot be rebound and simultaneous exchange has one winner', async () => {
  await begin('race');
  const proof = await completeOAuthFlow(sql, 'race', 'original-session');
  await assert.rejects(completeOAuthFlow(sql, 'race', 'different-session'), /expired/);
  const results = await Promise.allSettled([
    claimOAuthFlow(sql, 'race', 'device-verifier', proof),
    claimOAuthFlow(sql, 'race', 'device-verifier', proof),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});
