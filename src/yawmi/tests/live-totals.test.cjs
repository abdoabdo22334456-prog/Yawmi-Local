const test=require('node:test'),assert=require('node:assert/strict');
const {totals,totalLabel}=require('../dist/plan-time.js');
test('planned activity time increases each second by the running open activity elapsed time',()=>{
 const day={items:[{minutes:199,kind:'focus'},{minutes:0,kind:'personal',actualStart:100000,done:false}]};
 assert.equal(totals(day,160000).activitySeconds,200*60);
 assert.equal(totals(day,161000).activitySeconds,200*60+1);
 assert.equal(totalLabel(totals(day,161000).activitySeconds,'en'),'3 س و20 د و1 ث');
});
test('finished open durations remain in the total and stop increasing; unstarted or unfinished metadata does not invent time',()=>{
 const day={items:[{minutes:0,kind:'focus',done:true,actualStart:100000,actualEnd:175000},{minutes:0,kind:'personal',done:false},{minutes:0,kind:'personal',done:true,actualStart:100000}]};
 assert.equal(totals(day,200000).activitySeconds,75);
 assert.equal(totals(day,900000).activitySeconds,75);
});
test('breaks use their own total, clock skew clamps at zero, and an empty day stays at zero',()=>{
 const day={items:[{minutes:10,kind:'break'},{minutes:0,kind:'break',actualStart:100000,done:false},{minutes:30,kind:'focus'},{minutes:0,kind:'focus',actualStart:999000,done:false}]};
 assert.deepEqual(totals(day,160000),{activitySeconds:1800,breakSeconds:660});
 assert.deepEqual(totals({items:[]}),{activitySeconds:0,breakSeconds:0});
 assert.equal(totalLabel(0,'en'),'0 دقيقة');
});
