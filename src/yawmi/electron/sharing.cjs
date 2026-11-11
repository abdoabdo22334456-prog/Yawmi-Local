'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {atomicWrite}=require('./state.cjs');
const {changes,pairingCode,displayCode,nudgeEligible}=require('./sharing-events.cjs');
const PROJECT='yawmi-private-20261024-a16d';
class Sharing {
  constructor({root,safeStorage,onNudge=()=>{},onStatus=()=>{},onSignal=()=>{},onAcceptProposal=()=>{}}){
    Object.assign(this,{root,safeStorage,onNudge,onStatus,onSignal,onAcceptProposal});
    this.file=path.join(root,'sharing.json');this.keyFile=path.join(root,'sharing-key.bin');
    try{this.config=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{this.config={ownerId:randomUUID(),ownerName:'صاحب الجدول',enabled:false};}
    if(!/^[a-zA-Z0-9-]{12,100}$/.test(this.config.ownerId))throw Error('إعداد مشاركة غير صالح.');
    this.state=null;this.synced={};this.events=[];this.viewers=[];this.message='المشاركة مقفولة';this.online=false;this.flushing=false;
  }
  persist(){atomicWrite(this.file,JSON.stringify(this.config));}
  status(){return {configured:fs.existsSync(this.keyFile),enabled:this.config.enabled,online:this.online,message:this.message,ownerName:this.config.ownerName,viewers:this.viewers.map(v=>({uid:v.uid,name:v.name})),invite:this.invite?{code:this.invite.code,expiresAt:this.invite.expiresAt}:null,couple:this.couple?.snapshot()||null};}
  report(message,online=false){this.message=message;this.online=online;this.onStatus(this.status());}
  async importKey(file){
    if(!await this.safeStorage.isAsyncEncryptionAvailable())throw Error('تشفير Windows غير متاح على الجهاز.');
    if(fs.statSync(file).size>16384)throw Error('ملف الاتصال غير صالح.');
    const key=JSON.parse(fs.readFileSync(file,'utf8'));
    if(key.type!=='service_account'||key.project_id!==PROJECT||typeof key.private_key!=='string'||!key.private_key.startsWith('-----BEGIN PRIVATE KEY-----')||typeof key.client_email!=='string'||!key.client_email.endsWith('@'+PROJECT+'.iam.gserviceaccount.com'))throw Error('الملف لازم يكون حساب خدمة مشروع يومي المخصص.');
    await this.stop();atomicWrite(this.keyFile,await this.safeStorage.encryptStringAsync(JSON.stringify(key)));
    this.config.enabled=false;this.persist();this.report('الاتصال جاهز. فعّل المشاركة لما تكون مستعد.');
    return this.status();
  }
  async enable(name){
    if(typeof name!=='string'||!name.trim()||name.length>50)throw Error('اكتب اسم من حرف إلى ٥٠ حرف.');
    this.config.ownerName=name.trim();this.config.enabled=true;this.persist();await this.start();return this.status();
  }
  async start(){
    if(!this.config.enabled||this.db)return;
    if(!fs.existsSync(this.keyFile))throw Error('جهّز ملف الاتصال الأول.');
    const {initializeApp,cert}=require('firebase-admin/app');
    const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
    const {getMessaging}=require('firebase-admin/messaging');
    let key;
    try{key=JSON.parse((await this.safeStorage.decryptStringAsync(fs.readFileSync(this.keyFile))).result);}
    catch{this.report('تعذّر قراءة إعداد الاتصال المشفّر. احتفظنا بالملف الأصلي؛ يلزم إصلاح إعداد الاتصال.');throw Error(this.message);}
    this.firebaseApp=initializeApp({projectId:PROJECT,credential:cert(key)},'yawmi-'+randomUUID());
    this.db=getFirestore(this.firebaseApp);this.db.settings({ignoreUndefinedProperties:true});this.messaging=getMessaging(this.firebaseApp);
    this.FieldValue=FieldValue;this.Timestamp=Timestamp;this.owner=this.db.collection('owners').doc(this.config.ownerId);
    this.report('جاري الاتصال بالمشاركة…');
    try{
      const slot=this.owner.collection('pairing').doc('slot');
      await this.db.runTransaction(async tx=>{const existing=await tx.get(slot);if(!existing.exists)tx.set(slot,{viewerUid:null});});
      this.unview=this.owner.collection('viewers').where('active','==',true).limit(2).onSnapshot(s=>{this.viewers=s.docs.map(d=>({uid:d.id,...d.data()}));this.couple?.viewerChanged();this.report('المشاركة متصلة',true);},()=>this.report('تعذّر الاتصال. هنحاول تاني تلقائيًا.'));
      this.unnudge=this.owner.collection('nudges').where('status','==','pending').limit(20).onSnapshot(s=>{for(const change of s.docChanges())if(change.type!=='removed')this.receive(change.doc).catch(()=>this.report('تعذّر استلام طلب تنبيه.'));},()=>this.report('تعذّر استقبال التنبيهات. راجع الإنترنت.'));
      this.interval=setInterval(()=>this.flush(),15000);this.interval.unref?.();await this.flush();
      const {Couple}=require('./couple.cjs');this.couple=new Couple(this);await this.couple.start();
    }catch(error){await this.stop();this.report('تعذّر تفعيل المشاركة. راجع الاتصال وإعداد Firebase.');throw Error(this.message);}
  }
  update(next){
    if(this.config.enabled){for(const event of changes(this.state,next))this.events.push({...event,at:Date.now()});this.events=this.events.slice(-50);}
    this.state=next;clearTimeout(this.debounce);this.debounce=setTimeout(()=>this.flush(),900);this.debounce.unref?.();
  }
  async flush(){
    if(!this.db||!this.config.enabled||this.flushing)return;this.flushing=true;
    try{
      const days=this.state?.days||{},dates=new Set([...Object.keys(days),...Object.keys(this.synced)]);
      for(const date of dates){
        const day=days[date],serialized=JSON.stringify(day||null);if(this.synced[date]===serialized)continue;
        const ref=this.owner.collection('days').doc(date);
        if(day){const data={start:day.start,breakMinutes:day.breakMinutes,items:day.items,updatedAt:this.FieldValue.serverTimestamp()};if(Buffer.byteLength(JSON.stringify(data))>800000)throw Error('اليوم أكبر من حجم المشاركة');await ref.set(data);}else await ref.delete();
        this.synced[date]=serialized;
      }
      while(this.events.length&&this.config.enabled){const event=this.events[0];if(Date.now()-event.at<120000)await this.notify(event);this.events.shift();}
      this.report('المشاركة متصلة · الجدول متزامن',true);
    }catch{this.report('المشاركة غير متصلة. خطتك محفوظة محليًا، والتحديث هيتبعت لما الاتصال يرجع.');}
    finally{this.flushing=false;}
  }
  async notify(event){
    // Re-read authorization immediately before sending; revoked tokens are never
    // kept in a persistent notification queue or exposed to the renderer.
    const viewers=await this.owner.collection('viewers').where('active','==',true).limit(2).get();
    for(const viewer of viewers.docs){if(!this.config.enabled)return;const token=viewer.get('fcmToken');if(typeof token!=='string'||!token)continue;
      try{await this.messaging.send({token,notification:{title:event.title,body:event.body},data:{date:event.date,type:event.type},android:{priority:'high',ttl:120000,notification:{channelId:'yawmi_schedule_quiet',defaultSound:false,defaultVibrateTimings:false,visibility:'private',tag:event.type+':'+event.date,icon:'ic_notification'}}});}
      catch(error){if(!(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(error.code)||(error.code==='messaging/invalid-argument'&&/registration token/i.test(error.message))))throw error;}
    }
  }
  async receive(document){
    if(!this.config.enabled||!this.db)return;
    const data=await this.db.runTransaction(async tx=>{
      const current=await tx.get(document.ref);if(!current.exists||current.get('status')!=='pending')return null;
      const n=current.data();if(typeof n.senderUid!=='string')return null;
      const viewer=await tx.get(this.owner.collection('viewers').doc(n.senderUid));
      const normalized={...n,createdAt:n.createdAt?.toMillis?.(),expiresAt:n.expiresAt?.toMillis?.()};
      const valid=nudgeEligible(normalized,viewer.exists&&viewer.get('active')===true);
      tx.update(document.ref,{status:valid?'delivered':'expired',deliveredAt:this.FieldValue.serverTimestamp()});
      return valid?{name:String(viewer.get('name')||'صديقتك').slice(0,50)}:null;
    });
    if(data&&this.config.enabled)this.onNudge(data.name);
  }
  async createInvite(){
    if(!this.db||!this.config.enabled)throw Error('فعّل المشاركة الأول.');
    const slot=this.owner.collection('pairing').doc('slot'),code=pairingCode(),expires=Date.now()+600000;
    const oldInvite=this.invite?.raw;
    await this.db.runTransaction(async tx=>{
      const current=await tx.get(slot);if(current.get('viewerUid'))throw Error('البرنامج مرتبط بالفعل. الغِ الربط القديم قبل كود جديد.');
      if(oldInvite)tx.delete(this.db.collection('invites').doc(oldInvite));
      tx.set(this.db.collection('invites').doc(code),{ownerId:this.config.ownerId,ownerName:this.config.ownerName,expiresAt:this.Timestamp.fromMillis(expires),claimedBy:null,claimedAt:null});
    });
    this.invite={raw:code,code:displayCode(code),expiresAt:expires};return this.status();
  }
  async revoke(uid){
    if(!this.db||typeof uid!=='string'||!this.viewers.some(v=>v.uid===uid))throw Error('الربط غير موجود.');
    await this.db.runTransaction(async tx=>{const slot=this.owner.collection('pairing').doc('slot');const current=await tx.get(slot);tx.update(this.owner.collection('viewers').doc(uid),{active:false});if(current.get('viewerUid')===uid)tx.set(slot,{viewerUid:null});});
    this.viewers=this.viewers.filter(v=>v.uid!==uid);this.invite=null;return this.status();
  }
  async pause(){this.config.enabled=false;this.persist();await this.stop();this.events=[];this.report('المشاركة متوقفة. التطبيق على الهاتف يحتفظ بآخر جدول وصله.');return this.status();}
  async stop(){
    this.couple?.stop();this.couple=null;
    clearTimeout(this.debounce);clearInterval(this.interval);this.unview?.();this.unnudge?.();this.unview=this.unnudge=null;
    const old=this.firebaseApp;this.db=null;this.firebaseApp=null;this.synced={};
    if(old){const{deleteApp}=require('firebase-admin/app');await deleteApp(old).catch(()=>{});}
  }
}
module.exports={Sharing,PROJECT};
