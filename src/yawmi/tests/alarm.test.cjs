'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAlarm } = require('../dist/alarm.js');
const fakeAudio = () => ({ loop: false, volume: 1, currentTime: 13, plays: 0, pauses: 0, play() { this.plays++; return Promise.resolve(); }, pause() { this.pauses++; } });
test('rings in a continuous media loop until explicitly stopped and resets playback', async () => {
  const audio = fakeAudio(), changes = [], alarm = createAlarm(audio, x => changes.push(x));
  await alarm.start(); assert.equal(alarm.ringing,true); assert.equal(audio.loop,true); assert.equal(audio.currentTime,0);
  await alarm.start(); assert.equal(audio.plays,1); assert.equal(audio.pauses,0);
  audio.currentTime=0.8; alarm.stop(); assert.equal(alarm.ringing,false); assert.equal(audio.pauses,1); assert.equal(audio.currentTime,0); assert.deepEqual(changes,[true,false]);
  await alarm.start(); assert.equal(audio.plays,2); alarm.stop();
});
test('stopping while play is pending also stops a late playback start', async () => {
  const audio = fakeAudio(); let resolve;
  audio.play = () => new Promise(r => { resolve=r; });
  const alarm = createAlarm(audio), pending = alarm.start(); alarm.stop(); resolve(); await pending;
  assert.equal(alarm.ringing,false); assert.equal(audio.pauses,2); assert.equal(audio.currentTime,0);
});
test('a playback failure keeps the dismissal available and reports a retry', async () => {
  const audio=fakeAudio();audio.play=()=>Promise.reject(new Error('blocked'));let errors=0;
  const alarm=createAlarm(audio,()=>{},()=>errors++);await alarm.start();assert.equal(errors,1);assert.equal(alarm.ringing,true);alarm.stop();assert.equal(alarm.ringing,false);
});
