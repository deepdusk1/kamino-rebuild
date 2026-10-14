import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactCandidates, matchSelectedContacts, previewContacts } from './contact-import.ts';

test('contacts are not read if permission is declined', async () => {
  let reads = 0;
  const result = await previewContacts({ requestPermission: async () => false, readDetails: async () => { reads++; return []; } });
  assert.equal(reads, 0); assert.equal(result.permissionDenied, true); assert.deepEqual(result.candidates, []);
});
test('contact preview normalizes/deduplicates emails, skips invalid fields and caps at200', () => {
  const candidates = contactCandidates([
    { fullName: 'Local Name', emails: [{ address: ' PERSON@EXAMPLE.TEST ' }, { address: 'person@example.test' }, { address: 'broken' }, { address: null }] },
    ...Array.from({ length: 250 }, (_, index) => ({ fullName: `Local ${index}`, emails: [{ address: `person${index}@example.test` }] })),
  ]);
  assert.equal(candidates.length, 200);
  assert.deepEqual(candidates[0], { name: 'Local Name', email: 'person@example.test' });
});
test('nothing is matched before selection; confirmed emails are batched with no names and results deduplicate', async () => {
  const candidates = contactCandidates(Array.from({ length: 250 }, (_, index) => ({ fullName: `Private name ${index}`, emails: [{ address: `member${index}@example.test` }] })));
  const requests: string[][] = [];
  const matcher = async (emails: string[]) => { requests.push(emails); return [{ userId: 'same-member' }]; };
  assert.deepEqual(await matchSelectedContacts(candidates, new Set(), matcher), []);
  assert.equal(requests.length, 0);
  const selected = new Set([...candidates.map(candidate => candidate.email), 'unpreviewed@example.test']);
  const matches = await matchSelectedContacts(candidates, selected, matcher);
  assert.equal(requests.length, 2); assert.equal(requests[0]!.length, 100); assert.equal(requests[1]!.length, 100);
  assert.ok(requests.flat().every(email => email.endsWith('@example.test') && !email.includes('Private')));
  assert.ok(!requests.flat().includes('unpreviewed@example.test')); assert.deepEqual(matches, [{ userId: 'same-member' }]);
});
