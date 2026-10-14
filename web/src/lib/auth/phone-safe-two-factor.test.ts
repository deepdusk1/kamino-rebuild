import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { phoneNumber } from 'better-auth/plugins';
import { phoneSafeTwoFactor } from './phone-safe-two-factor.ts';

function totp(uri: string) {
  const secret = new URL(uri).searchParams.get('secret')!;
  let bits = '';
  for (const c of secret.toUpperCase()) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', key).update(counter).digest(), offset = hash[19]! & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
test('an approved SMS code cannot bypass enabled authenticator authentication', async () => {
  const database: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  const auth = betterAuth({
    database: memoryAdapter(database), baseURL: 'https://identity.test', secret: 'isolated-test-secret-that-is-over-32-characters',
    emailAndPassword: { enabled: true },
    plugins: [phoneSafeTwoFactor(), phoneNumber({
      // Isolated transport fixture: never part of the application/provider configuration.
      sendOTP: async () => {}, verifyOTP: async ({ code }) => code === '654321',
    })],
  });
  async function request(path: string, body: unknown, cookie = '') {
    const response = await auth.handler(new Request(`https://identity.test/api/auth/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://identity.test', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json(), cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
  }
  const account = await request('sign-up/email', { name: 'Phone MFA fixture', email: 'phone-mfa@example.test', password: 'fixture-password-strong' });
  assert.equal(account.status, 200, JSON.stringify(account.body));
  database.user[0]!.phoneNumber = '+16045551234'; database.user[0]!.phoneNumberVerified = true;
  const setup = await request('two-factor/enable', { password: 'fixture-password-strong' }, account.cookie);
  assert.equal(setup.status, 200, JSON.stringify(setup.body));
  const verify = await request('two-factor/verify-totp', { code: totp(setup.body.totpURI) }, account.cookie);
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  database.session.length = 0;
  const rejected = await request('phone-number/verify', { phoneNumber: '+16045551234', code: '000000' });
  assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
  const challenge = await request('phone-number/verify', { phoneNumber: '+16045551234', code: '654321' });
  assert.equal(challenge.status, 200, JSON.stringify(challenge.body));
  assert.equal(challenge.body.twoFactorRedirect, true);
  assert.equal(challenge.body.token, undefined);
  assert.equal(database.session.length, 0, 'No usable session exists before authenticator completion');
  const finished = await request('two-factor/verify-backup-code', { code: setup.body.backupCodes[0] }, challenge.cookie);
  assert.equal(finished.status, 200, JSON.stringify(finished.body));
  assert.ok(finished.body.token);
  assert.equal(database.session.length, 1);
});
