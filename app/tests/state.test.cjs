'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateState, parseBackup, makeStore } = require('../electron/state.cjs');

const day = (extra = {}) => ({ start: '09:00', breakMinutes: 10, sample: false, items: [{ id: 'a-1', name: 'Write', kind: 'focus', minutes: 45, done: false }], ...extra });

test('accepts a valid plan and strips unknown fields', () => {
  const out = validateState({ days: { '2026-11-11': { ...day(), junk: 1 } }, timer: null, other: true });
  assert.deepEqual(Object.keys(out), ['days', 'timer']);
  assert.equal(out.days['2026-11-11'].junk, undefined);
});
test('rejects bad dates, kinds and durations with stable codes', () => {
  assert.throws(() => validateState({ days: { '2026-13-40': day() } }), { code: 'bad_day' });
  assert.throws(() => validateState({ days: { '2026-11-11': day({ items: [{ id: 'x', name: 'n', kind: 'nope', minutes: 5, done: false }] }) } }), { code: 'bad_activity' });
  assert.throws(() => validateState({ days: { '2026-11-11': day({ items: [{ id: 'x', name: 'n', kind: 'focus', minutes: 9999, done: false }] }) } }), { code: 'bad_activity' });
  assert.throws(() => validateState(null), { code: 'invalid_plan' });
});
test('open activities (minutes = 0) keep actual start/end', () => {
  const now = Date.now();
  const out = validateState({ days: { '2026-11-11': day({ items: [{ id: 'o', name: 'Open', kind: 'personal', minutes: 0, done: true, actualStart: now - 5000, actualEnd: now }] }) } });
  assert.equal(out.days['2026-11-11'].items[0].actualEnd, now);
});
test('timer must point at an unfinished, timed activity', () => {
  const base = { days: { '2026-11-11': day() } };
  assert.throws(() => validateState({ ...base, timer: { date: '2026-11-11', id: 'missing', remaining: 5, deadline: Date.now(), running: false } }), { code: 'bad_timer' });
  const ok = validateState({ ...base, timer: { date: '2026-11-11', id: 'a-1', remaining: 5, deadline: Date.now() + 5000, running: true } });
  assert.equal(ok.timer.id, 'a-1');
});
test('backup parsing: BOM, envelope, version and JSON errors', () => {
  const plan = { days: { '2026-11-11': day() }, timer: null };
  const env = JSON.stringify({ format: 'yawmi-backup', version: 1, state: plan });
  assert.ok(parseBackup(String.fromCharCode(0xfeff) + env).days['2026-11-11']);
  assert.throws(() => parseBackup(JSON.stringify({ format: 'yawmi-backup', version: 2, state: plan })), { code: 'version' });
  assert.throws(() => parseBackup('{nope'), { code: 'json' });
  assert.throws(() => parseBackup('x'.repeat(5 * 1024 * 1024 + 1)), { code: 'too_big' });
});
test('store saves atomically, keeps .previous and recovers from corruption', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yawmi-state-'));
  const store = makeStore(root);
  assert.deepEqual(store.load(), { state: null, warning: null });
  store.save({ days: { '2026-11-11': day() }, timer: null });
  store.save({ days: { '2026-11-12': day() }, timer: null });
  fs.writeFileSync(store.file, '{corrupt');
  const loaded = store.load();
  assert.equal(loaded.warning, 'recovered');
  assert.ok(loaded.state.days['2026-11-11']);
  fs.rmSync(root, { recursive: true, force: true });
});
