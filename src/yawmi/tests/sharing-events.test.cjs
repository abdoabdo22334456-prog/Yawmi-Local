'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pairingCode, displayCode, changes, nudgeEligible } = require('../electron/sharing-events.cjs');
const state = () => ({ days: { '2026-10-24': { start:'09:00', breakMinutes:10, items:[{id:'task-1',name:'شغل',kind:'focus',minutes:45,done:false}] } }, timer:null });
test('startup and countdown saves do not notify, a fresh timer start does', () => {
  const initial=state();
  assert.deepEqual(changes(null,initial),[]);
  const started=structuredClone(initial);started.timer={id:'task-1',date:'2026-10-24',running:true,remaining:2700,deadline:10000};
  assert.deepEqual(changes(initial,started).map(e=>e.type),['start']);
  const paused=structuredClone(started);paused.timer.running=false;paused.timer.remaining=2000;
  assert.deepEqual(changes(started,paused),[]);
  assert.deepEqual(changes(paused,started),[]);
});
test('completion notifies once with schedule update; editing has no completion',()=>{
  const before=state(),after=state();after.days['2026-10-24'].items[0].done=true;
  assert.deepEqual(changes(before,after).map(e=>e.type),['schedule','finish']);
  assert.deepEqual(changes(after,after),[]);
  after.days['2026-10-24'].items[0].name='تعديل';
  assert.deepEqual(changes(before,after).map(e=>e.type),['schedule','finish']);
  before.days['2026-10-24'].items[0].done=true;
  assert.deepEqual(changes(before,after).map(e=>e.type),['schedule']);
});
test('removed day notifies but importing already completed items does not announce completion',()=>{
  const before=state(),after=state();after.days={};
  assert.equal(changes(before,after)[0].type,'schedule');
  const imported=state();imported.days['2026-10-24'].items[0].done=true;
  assert.deepEqual(changes(after,imported).map(e=>e.type),['schedule']);
});
test('pairing codes use a 120 bit random alphabet and have the Android format',()=>{
  const codes=new Set(Array.from({length:100},()=>pairingCode()));assert.equal(codes.size,100);
  for(const code of codes){assert.match(code,/^[A-HJ-NP-Z2-9]{24}$/);assert.match(displayCode(code),/^YW(-[A-HJ-NP-Z2-9]{4}){6}$/);}
});
test('expired, future, already delivered, and revoked nudges cannot ring',()=>{
  const now=1000000,nudge={status:'pending',senderUid:'viewer',createdAt:now-1000,expiresAt:now+119000};
  assert.equal(nudgeEligible(nudge,true,now),true);
  assert.equal(nudgeEligible(nudge,false,now),false);
  for(const patch of [{status:'delivered'},{expiresAt:now},{createdAt:now+10000},{createdAt:now-200000},{expiresAt:now+500000}])assert.equal(nudgeEligible({...nudge,...patch},true,now),false);
});
