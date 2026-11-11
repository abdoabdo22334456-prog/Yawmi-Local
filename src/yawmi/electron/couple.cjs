'use strict';
const {validDate}=require('./state.cjs');
const MOODS=['happy','calm','busy','tired','sad','need_hug'];
const LOVES=['love_you','missing_you','thinking_of_you','want_time','grateful'];
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const millis=value=>value?.toMillis?.()||0;
const serial=doc=>{const data=doc.data();for(const[k,v]of Object.entries(data))if(v?.toMillis)data[k]=v.toMillis();return{id:doc.id,...data};};
class Couple {
  constructor(parent){this.p=parent;this.chat=new (require('./chat.cjs').Chat)(this);this.stops=[];this.dayStops=[];this.profiles={};this.proposals=[];this.alarms=[];this.partnerDay={start:'09:00',items:[]};this.date=new Date().toLocaleDateString('en-CA');this.processing=new Set();this.retryAt=new Map();this.attempts=new Map();this.activityBaseline=null;this.lastQuiet=0;}
  snapshot(){const uid=this.p.viewers[0]?.uid;return {ownProfile:this.profiles.desktop||{},partnerProfile:this.profiles[uid]||{},partnerDay:this.partnerDay,date:this.date,proposals:this.proposals,alarms:this.alarms,messages:this.chat.messages};}
  changed(){this.p.onStatus(this.p.status());}
  signal(type,body){this.p.onSignal({type,body});}
  async start(){
    const owner=this.p.owner;
    this.stops.push(owner.collection('profiles').limit(3).onSnapshot(s=>{const previous=this.profiles;this.profiles=Object.fromEntries(s.docs.map(d=>[d.id,serial(d)]));const uid=this.p.viewers[0]?.uid;
      if(uid&&previous[uid]&&JSON.stringify(previous[uid])!==JSON.stringify(this.profiles[uid])&&Date.now()-this.lastQuiet>10000){this.lastQuiet=Date.now();this.signal('status','صديقتك شاركتك حالتها الجديدة');}this.changed();},()=>{}));
    this.stops.push(owner.collection('proposals').where('state','==','pending').limit(40).onSnapshot(s=>{this.proposals=s.docs.map(serial).filter(d=>d.sender==='desktop'||this.p.viewers.some(v=>v.uid===d.sender));this.changed();},()=>{}));
    this.stops.push(owner.collection('alarms').where('state','==','pending').limit(50).onSnapshot(s=>{this.alarms=s.docs.map(serial);this.changed();this.tick();},()=>{}));
    this.stops.push(owner.collection('signals').where('target','==','desktop').where('state','==','pending').limit(20).onSnapshot(s=>{for(const change of s.docChanges())if(change.type!=='removed')this.receiveSignal(change.doc).catch(()=>{});},()=>{}));
    this.tickTimer=setInterval(()=>this.tick(),1000);this.tickTimer.unref?.();this.watchPartner(this.date);this.chat.watch();
  }
  watchPartner(date){
    if(!validDate(date))throw Error('اليوم غير صالح.');this.date=date;
    this.dayStops.forEach(stop=>stop());this.dayStops=[];this.partnerDay={start:'09:00',items:[]};this.activityBaseline=null;
    const uid=this.p.viewers[0]?.uid;this.partnerUid=uid;if(!uid){this.changed();return;}
    const day=this.p.owner.collection('partnerPlans').doc(uid).collection('days').doc(date);
    this.dayStops.push(day.onSnapshot(d=>{this.partnerDay.start=d.get('start')||'09:00';this.changed();},()=>{}));
    this.dayStops.push(day.collection('activities').orderBy('order').limit(1000).onSnapshot(s=>{
      const items=s.docs.map(d=>{const item=serial(d);return{id:item.id,name:item.name,minutes:item.minutes,kind:item.kind,done:item.done,actualStart:item.actualStart||null,actualEnd:item.actualEnd||null,deadline:item.deadline||null,remaining:item.remaining};});
      const fingerprint=JSON.stringify(items);
      if(this.activityBaseline!==null&&this.activityBaseline!==fingerprint&&Date.now()-this.lastQuiet>10000){this.lastQuiet=Date.now();this.signal('schedule','صديقتك حدّثت جدولها');}
      this.activityBaseline=fingerprint;this.partnerDay.items=items;this.changed();
    },()=>{}));this.changed();
  }
  viewerChanged(){this.chat.watch();const uid=this.p.viewers[0]?.uid;if(uid!==this.partnerUid)this.watchPartner(this.date);this.changed();}
  requirePartner(){const viewer=this.p.viewers[0];if(!viewer||!this.p.db||!this.p.config.enabled)throw Error('اربطوا التطبيقين وفعّلوا المشاركة الأول.');return viewer.uid;}
  async sendQuiet(title,body,type){await this.p.notify({title,body,type,date:this.date});}
  async profile(input){
    if(!input||!MOODS.includes(input.mood)||!LOVES.includes(input.love)||typeof input.note!=='string'||input.note.length>80)throw Error('الحالة غير صالحة.');
    this.requirePartner();
    await this.p.owner.collection('profiles').doc('desktop').set({name:this.p.config.ownerName,mood:input.mood,love:input.love,note:input.note.trim(),updatedAt:this.p.FieldValue.serverTimestamp()});
    await this.sendQuiet('حالة جديدة ليك','شوف الحالة والمزاج اللي شاركهم معاك صاحب الجدول','status');
  }
  async missYou(){this.requirePartner();if(Date.now()-(this.lastMissYou||0)<10000)throw Error('استنى شوية بين كل «وحشتني» والتانية.');await this.sendQuiet('وحشتني ❤️','وحشتني… وبفكّر فيك دلوقتي','missyou');this.lastMissYou=Date.now();}
  async propose(input){
    const target=this.requirePartner();
    if(!input||!validDate(input.date)||!text(input.name,100)||!Number.isInteger(input.minutes)||input.minutes<1||input.minutes>720||!['focus','personal','movement','break'].includes(input.kind))throw Error('راجع بيانات اقتراح النشاط.');
    await this.p.owner.collection('proposals').add({sender:'desktop',target,date:input.date,name:input.name.trim(),minutes:input.minutes,kind:input.kind,state:'pending',createdAt:this.p.FieldValue.serverTimestamp(),resolvedAt:null});
    await this.sendQuiet('اقتراح ليومك',input.name.trim(),'proposal');
  }
  async respond(input){
    this.requirePartner();if(!input||!text(input.id,100)||!['accepted','rejected'].includes(input.decision))throw Error('قرار غير صالح.');
    const ref=this.p.owner.collection('proposals').doc(input.id),snap=await ref.get(),proposal=snap.data();
    if(!proposal||proposal.target!=='desktop'||proposal.state!=='pending'||!this.p.viewers.some(v=>v.uid===proposal.sender))throw Error('الاقتراح غير متاح.');
    if(input.decision==='accepted')await this.p.onAcceptProposal({...proposal,id:snap.id});
    await ref.update({state:input.decision,resolvedAt:this.p.FieldValue.serverTimestamp()});
    await this.sendQuiet(input.decision==='accepted'?'اقتراحك اتقبل ✓':'رد على اقتراحك',proposal.name,input.decision);
  }
  async alarm(input){
    const target=this.requirePartner(),now=Date.now();
    if(!input||!text(input.body,140)||!Number.isFinite(input.dueAt)||input.dueAt<now-5000||input.dueAt>now+7*86400000)throw Error('اختار موعد من دلوقتي لحد ٧ أيام ورسالة قصيرة.');
    await this.p.owner.collection('alarms').add({sender:'desktop',target,body:input.body.trim(),dueAt:this.p.Timestamp.fromMillis(Math.max(now,input.dueAt)),createdAt:this.p.FieldValue.serverTimestamp(),state:'pending',pushSentAt:null});
    this.tick();
  }
  async cancelAlarm(id){
    this.requirePartner();if(!text(id,100))throw Error('منبّه غير صالح.');
    const ref=this.p.owner.collection('alarms').doc(id),doc=await ref.get();
    if(!doc.exists||doc.get('state')!=='pending'||(doc.get('sender')!=='desktop'&&doc.get('target')!=='desktop'))throw Error('المنبّه غير متاح.');
    await ref.update({state:'cancelled'});await this.sendQuiet('منبّه اتلغى','افتح مساحة المنبّهات عشان تشوف التحديث','alarm_cancelled');
  }
  async tick(){
    if(!this.p.db||!this.p.config.enabled)return;
    this.chat.tick();
    for(const alarm of this.alarms){
      if(this.processing.has(alarm.id)||(this.retryAt.get(alarm.id)||0)>Date.now())continue;
      if(alarm.target==='desktop'&&alarm.dueAt<=Date.now()){
        this.processing.add(alarm.id);
        try{
          const result=await this.p.db.runTransaction(async tx=>{
            const ref=this.p.owner.collection('alarms').doc(alarm.id),current=await tx.get(ref);if(current.get('state')!=='pending')return null;
            const sender=current.get('sender');if(typeof sender!=='string'||sender==='desktop')return null;
            const viewer=await tx.get(this.p.owner.collection('viewers').doc(sender));
            const valid=viewer.get('active')===true&&millis(current.get('dueAt'))>=Date.now()-120000;
            tx.update(ref,{state:valid?'delivered':'expired'});return valid?current.get('body'):null;
          });if(result)this.signal('alarm',result);
        }catch{}finally{this.processing.delete(alarm.id);}
      }else if(alarm.target!=='desktop'&&!alarm.pushSentAt){
        this.processing.add(alarm.id);
        try{
          if(alarm.dueAt<Date.now()-120000){await this.p.owner.collection('alarms').doc(alarm.id).update({state:'expired'});continue;}
          const viewer=await this.p.owner.collection('viewers').doc(alarm.target).get();
          if(viewer.get('active')!==true)continue;
          const token=viewer.get('fcmToken');if(!token)continue;
          await this.p.messaging.send({token,data:{type:'alarm',alarmId:alarm.id,ownerId:this.p.config.ownerId,body:alarm.body,dueAt:String(alarm.dueAt)},android:{priority:'high',ttl:Math.max(60000,Math.min(7*86400000,alarm.dueAt-Date.now()+120000))}});
          await this.p.owner.collection('alarms').doc(alarm.id).update({pushSentAt:this.p.FieldValue.serverTimestamp()});
        }catch(error){const attempt=(this.attempts.get(alarm.id)||0)+1;this.attempts.set(alarm.id,attempt);this.retryAt.set(alarm.id,Date.now()+Math.min(300000,15000*2**Math.min(attempt,5)));}finally{this.processing.delete(alarm.id);}
      }
    }
  }
  async receiveSignal(doc){
    const body=await this.p.db.runTransaction(async tx=>{
      const current=await tx.get(doc.ref);if(current.get('state')!=='pending')return null;
      const sender=current.get('sender');if(typeof sender!=='string')return null;
      const viewer=await tx.get(this.p.owner.collection('viewers').doc(sender));
      const valid=viewer.get('active')===true&&millis(current.get('expiresAt'))>Date.now();
      tx.update(doc.ref,{state:valid?'delivered':'expired'});return valid?current.get('body'):null;
    });if(body)this.signal('missyou',body);
  }
  async action(action,input){
    if(action==='chat'){await this.chat.send(input);return this.snapshot();}
    if(action==='watch'){this.watchPartner(input);return this.snapshot();}
    if(!['profile','missYou','propose','respond','alarm','cancelAlarm'].includes(action))throw Error('طلب غير مسموح.');
    await this[action](input);return this.snapshot();
  }
  stop(){this.chat.stop();clearInterval(this.tickTimer);[...this.stops,...this.dayStops].forEach(stop=>stop());this.stops=[];this.dayStops=[];}
}
module.exports={Couple,MOODS,LOVES};
