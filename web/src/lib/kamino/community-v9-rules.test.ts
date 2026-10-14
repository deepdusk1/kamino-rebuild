import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventOccurrences, calendarEvent, validatedWebUrl } from './community-v9-rules.ts';

test('monthly recurrence clamps short months and preserves duration', () => {
  const rows = eventOccurrences('2027-01-31T19:00:00Z', '2027-01-31T20:30:00Z', 'monthly', 3);
  assert.deepEqual(rows.map(r => r.startsAt), ['2027-01-31T19:00:00.000Z','2027-02-28T19:00:00.000Z','2027-03-31T19:00:00.000Z']);
  assert.equal(new Date(rows[1]!.endsAt!).getTime()-new Date(rows[1]!.startsAt).getTime(), 90*60000);
  assert.equal(eventOccurrences('2027-01-01T00:00:00Z',undefined,'daily',100).length,12);
  assert.throws(() => eventOccurrences('invalid',undefined,'none'),/valid start/);
  assert.throws(() => eventOccurrences('2027-01-01T00:00:00Z','2026-12-31T00:00:00Z','none'),/after/);
});
test('calendar exports escape text and fold UTF-8 lines without adding fields', () => {
  const value=calendarEvent({id:19,title:'Meet, learn; share\\together',body:'Hello\nEND:VEVENT\nBEGIN:VEVENT\n'+ '🎨'.repeat(100),startsAt:'2027-01-01T19:00:00Z',endsAt:null,location:'Studio',onlineUrl:'',status:'cancelled'});
  assert.ok(value.includes('STATUS:CANCELLED\r\n'));
  assert.ok(value.includes('SUMMARY:Meet\\, learn\\; share\\\\together'));
  assert.equal(value.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1);
  assert.ok(value.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
});
test('event links reject executable and credential-bearing URLs', () => {
  assert.throws(()=>validatedWebUrl('javascript:alert(1)'),/https/);
  assert.throws(()=>validatedWebUrl('https://user:secret@example.com'),/username/);
  assert.equal(validatedWebUrl(' https://example.com/room '),'https://example.com/room');
});
