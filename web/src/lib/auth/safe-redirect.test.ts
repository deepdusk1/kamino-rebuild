import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeRedirect } from './safe-redirect.ts';
test('sign-in keeps community invitations and app paths', () => {
  assert.equal(safeRedirect('/invite/my-code?source=friend'), '/invite/my-code?source=friend');
  assert.equal(safeRedirect('/c/art#join'), '/c/art#join');
});
test('sign-in never redirects to another origin or ambiguous backslashes', () => {
  for (const value of ['https://attacker.test','//attacker.test','/\\attacker.test','/ \n/attacker.test','javascript:alert(1)',null]) assert.equal(safeRedirect(value), '/');
});
