import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localToInstant,zonedLocalInput,zonedOccurrences,shiftedSeriesTime} from './event-time-v10.ts';
test('weekly local clocks stay fixed as UTC offsets change across spring and fall DST',()=>{
  const spring=zonedOccurrences('2026-03-02T03:30:00Z',undefined,'weekly',3,'America/Los_Angeles');
  assert.deepEqual(spring.map(e=>e.startsAt),['2026-03-02T03:30:00.000Z','2026-03-09T02:30:00.000Z','2026-03-16T02:30:00.000Z']);
  assert.deepEqual(spring.map(e=>zonedLocalInput(e.startsAt,'America/Los_Angeles').slice(-5)),['19:30','19:30','19:30']);
  const fall=zonedOccurrences('2026-10-26T02:30:00Z',undefined,'weekly',2,'America/Los_Angeles');
  assert.deepEqual(fall.map(e=>e.startsAt),['2026-10-26T02:30:00.000Z','2026-11-02T03:30:00.000Z']);
});
test('nonexistent wall times are rejected and repeated wall times require an explicit choice',()=>{
  assert.throws(()=>localToInstant('2026-03-08T02:30','America/Los_Angeles'),/does not exist/);
  assert.throws(()=>localToInstant('2026-11-01T01:30','America/Los_Angeles'),/occurs twice/);
  assert.equal(localToInstant('2026-11-01T01:30','America/Los_Angeles','earlier'),'2026-11-01T08:30:00.000Z');
  assert.equal(localToInstant('2026-11-01T01:30','America/Los_Angeles','later'),'2026-11-01T09:30:00.000Z');
  assert.throws(()=>zonedOccurrences('2026-03-01T10:30:00Z',undefined,'weekly',2,'America/Los_Angeles'),/does not exist/);
});
test('quarter-hour zones and monthly end-of-month clamping are handled without host time-zone dependence',()=>{
  assert.equal(localToInstant('2026-04-01T12:00','Asia/Kathmandu'),'2026-04-01T06:15:00.000Z');
  const events=zonedOccurrences('2026-01-31T18:00:00Z','2026-01-31T19:00:00Z','monthly',3,'UTC');
  assert.deepEqual(events.map(e=>e.startsAt),['2026-01-31T18:00:00.000Z','2026-02-28T18:00:00.000Z','2026-03-31T18:00:00.000Z']);
  assert.equal(events[1].endsAt,'2026-02-28T19:00:00.000Z');
});
test('editing a whole series changes local clock time and calendar displacement rather than adding UTC hours',()=>{
  const next=shiftedSeriesTime('2026-11-02T01:00:00Z','2026-10-26T00:00:00Z','2026-10-26T02:30:00Z','America/Los_Angeles','reject');
  assert.equal(next,'2026-11-02T03:30:00.000Z');
  assert.throws(()=>localToInstant('2026-02-30T12:00','UTC'),/valid/);
  assert.throws(()=>localToInstant('2026-10-01T12:00','Narnia/Forest'),/valid IANA/);
  assert.throws(()=>zonedOccurrences('bad',undefined,'weekly',2),/valid/);
});
