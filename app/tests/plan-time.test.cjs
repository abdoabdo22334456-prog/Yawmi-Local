'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { timeline, totals } = require('../dist/plan-time.js');

const item = over => ({ id: String(Math.random()), name: 'x', kind: 'focus', minutes: 30, done: false, ...over });

test('timeline chains timed items from the start time', () => {
  const rows = timeline({ start: '09:00', items: [item({ minutes: 45 }), item({ kind: 'break', minutes: 10 })] }, '2026-11-11');
  assert.deepEqual(rows.map(r => [r.start, r.end]), [[540, 585], [585, 595]]);
});
test('an unfinished open item blocks the times after it', () => {
  const rows = timeline({ start: '09:00', items: [item({ minutes: 0 }), item({ minutes: 20 })] }, '2026-11-11');
  assert.equal(rows[0].end, null);
  assert.equal(rows[1].start, null);
  assert.equal(rows[1].end, null);
});
test('plans can run past midnight', () => {
  const rows = timeline({ start: '23:30', items: [item({ minutes: 60 })] }, '2026-11-11');
  assert.equal(rows[0].end, 1410 + 60);
});
test('totals separate activity from break time and count open items live', () => {
  const now = 1_800_000_000_000;
  const day = { items: [item({ minutes: 45 }), item({ kind: 'break', minutes: 10 }), item({ minutes: 0, actualStart: now - 90_000 })] };
  const t = totals(day, now);
  assert.equal(t.activitySeconds, 45 * 60 + 90);
  assert.equal(t.breakSeconds, 600);
  const closed = totals({ items: [item({ minutes: 0, done: true, actualStart: now - 60_000, actualEnd: now - 30_000 })] }, now + 999_999);
  assert.equal(closed.activitySeconds, 30);
});
