'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateState, parseBackup, makeStore } = require('../electron/state.cjs');
const sample = () => ({ days: { '2026-10-24': { start: '09:00', breakMinutes: 10, sample: false, items: [{ id: 'test-1', name: 'مذاكرة', minutes: 45, kind: 'focus', done: false }] } }, timer: null });
test('round-trips a plan and running timer through an atomic on-disk save', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yawmi-test-'));
  try { const store = makeStore(root), state = sample();state.timer = { id:'test-1',date:'2026-10-24',running:true,remaining:2700,deadline:Date.now()+2700000 };store.save(state);assert.deepEqual(store.load().state,state);assert.equal(fs.existsSync(store.file+'.tmp'),false); }
  finally { fs.rmSync(root, { recursive:true,force:true }); }
});
test('accepts exported and legacy backups, ignoring unknown object properties', () => {
  assert.deepEqual(parseBackup(JSON.stringify({format:'yawmi-backup',version:1,state:sample()})), sample());
  assert.deepEqual(parseBackup('\uFEFF'+JSON.stringify(sample())),sample());
  const value=sample();value.extra='untrusted';assert.equal(validateState(value).extra,undefined);
});
test('rejects malformed, oversized, dangerous and inconsistent imported data', () => {
  for(const change of [s=>s.days['2026-10-24'].items[0].minutes=-1,s=>s.days['2026-10-24'].items[0].name='',s=>s.days['2026-10-24'].start='25:00',s=>s.days['2026-10-24'].items.push({...s.days['2026-10-24'].items[0]}),s=>s.timer={id:'missing',date:'2026-10-24',running:true,remaining:1,deadline:Date.now()},s=>s.days['2026-02-30']=s.days['2026-10-24']]){const value=sample();change(value);assert.throws(()=>validateState(value));}
  assert.throws(()=>parseBackup('x'.repeat(5*1024*1024+1)));
  assert.throws(()=>parseBackup(JSON.stringify({format:'yawmi-backup',version:999,state:sample()})));
  assert.throws(()=>parseBackup('{"days":{"__proto__":{}},"timer":null}'));
});
test('preserves damaged data and recovers the previous valid save', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'yawmi-recovery-'));
  try {const store=makeStore(root);store.save(sample());const next=sample();next.days['2026-10-24'].items[0].minutes=60;store.save(next);fs.writeFileSync(store.file,'broken');const recovered=store.load();assert.deepEqual(recovered.state,sample());assert.ok(recovered.warning);assert.ok(fs.readdirSync(root).some(f=>f.startsWith('plan-recovery-')));}
  finally{fs.rmSync(root,{recursive:true,force:true});}
});
