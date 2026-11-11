const test=require('node:test'),assert=require('node:assert/strict');
const {validateState}=require('../electron/state.cjs'),{timeline,elapsedText,activityRecord}=require('../dist/plan-time.js'),{changes}=require('../electron/sharing-events.cjs');
const date='2026-10-28',start=new Date(2026,9,28,11,0).getTime();
const plan=item=>({days:{[date]:{start:'09:00',breakMinutes:10,items:[{id:'open',name:'بعمل حاجة دلوقتي',kind:'personal',minutes:0,done:false,...item},{id:'next',name:'بعده',kind:'focus',minutes:30,done:false}]}},timer:null});
test('open activity saves without a countdown and cannot acquire an automatic alarm timer',()=>{
 const value=plan({actualStart:start});assert.equal(validateState(value).days[date].items[0].minutes,0);
 value.timer={id:'open',date,running:true,remaining:0,deadline:Date.now()};assert.throws(()=>validateState(value));
});
test('open finish persists elapsed time and rejects reversed or unfinished end timestamps',()=>{
 const value=plan({done:true,actualStart:start,actualEnd:start+75*60000});assert.equal(validateState(value).days[date].items[0].actualEnd,start+75*60000);
 assert.throws(()=>validateState(plan({done:true,actualStart:start,actualEnd:start-1})));
 assert.throws(()=>validateState(plan({actualStart:start,actualEnd:start+1})));
});
test('unknown open end does not invent future times; actual completion anchors the next activity',()=>{
 assert.deepEqual(timeline(plan({actualStart:start}).days[date],date).map(x=>[x.start,x.end]),[[660,null],[null,null]]);
 assert.deepEqual(timeline(plan({done:true,actualStart:start,actualEnd:start+75*60000}).days[date],date).map(x=>[x.start,x.end]),[[660,735],[735,765]]);
});
test('open activity right-hand times use the actual end clock minute when a short activity crosses a minute or midnight',()=>{
 for(const at of [new Date(2026,9,28,14,59,55).getTime(),new Date(2026,9,28,23,59,55).getTime()]){
  const day=plan({done:true,actualStart:at,actualEnd:at+13000}).days[date],rows=timeline(day,date),end=new Date(at+13000);
  const expected=(end.getDate()===28?0:1440)+end.getHours()*60+end.getMinutes();
  assert.equal(rows[0].end,expected);assert.equal(rows[1].start,expected);
  assert.equal(activityRecord(day.items[0],'en'),'13 ثانية');
 }
});
test('starting and manually finishing an open activity each generate their normal quiet schedule events once',()=>{
 const before=plan({}),running=plan({actualStart:start}),finished=plan({done:true,actualStart:start,actualEnd:start+60000});
 assert.equal(changes(before,running).filter(e=>e.type==='start').length,1);
 assert.equal(changes(running,finished).filter(e=>e.type==='finish').length,1);
 assert.equal(changes(running,structuredClone(running)).length,0);
});
test('open row shows currently while running, then only the measured duration even across midnight',()=>{
 const at=new Date(2026,9,28,23,59,50).getTime(),item={minutes:0,done:true,actualStart:at,actualEnd:at+75000};
 const record=activityRecord(item,'en-GB');assert.equal(record,'1 دقيقة و15 ثانية');assert.doesNotMatch(record,/بدأت|انتهيت|Oct|2026/);
 assert.equal(elapsedText(3661000,'en'),'1 ساعة و1 دقيقة و1 ثانية');assert.equal(elapsedText(0,'en'),'0 ثانية');
 assert.equal(activityRecord({minutes:0,actualStart:at}),'حاليًا');
 assert.equal(activityRecord({minutes:0}),'وقت مفتوح');
 assert.equal(activityRecord({minutes:0,done:true}),'تم');
});
