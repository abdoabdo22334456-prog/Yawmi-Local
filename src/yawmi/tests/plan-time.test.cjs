const test=require('node:test'),assert=require('node:assert/strict');
const {clock,timeline}=require('../dist/plan-time.js');
test('12-hour clock handles midnight, noon and crossing a day',()=>{assert.equal(clock(0,'en'),'12:00 ص');assert.equal(clock(720,'en'),'12:00 م');assert.equal(clock(780,'en'),'1:00 م');assert.equal(clock(1445,'en'),'12:05 ص (+1 يوم)');});
test('actual start anchors this activity and the following activities, preserving earlier rows',()=>{
  const day={start:'09:00',items:[{minutes:30},{minutes:45,actualStart:new Date(2026,9,25,12,20).getTime()},{minutes:10}]};
  assert.deepEqual(timeline(day,'2026-10-25').map(({start,end})=>[start,end]),[[540,570],[740,785],[785,795]]);
});
