'use strict';
const serial=doc=>({id:doc.id,sender:doc.get('sender'),target:doc.get('target'),body:doc.get('body'),createdAt:doc.get('createdAt')?.toMillis?.()||0,notifiedAt:doc.get('notifiedAt')?.toMillis?.()||null});
class Chat {
  constructor(couple){this.c=couple;this.p=couple.p;this.messages=[];this.processing=new Set();this.retry=new Map();}
  watch(){
    const uid=this.p.viewers[0]?.uid;if(uid===this.uid)return;this.stop();this.uid=uid;this.messages=[];
    if(!uid){this.c.changed();return;}
    this.ref=this.p.owner.collection('chats').doc(uid).collection('messages');
    this.unsubscribe=this.ref.orderBy('createdAt','desc').limit(80).onSnapshot(snapshot=>{
      this.messages=snapshot.docs.map(serial).reverse();this.c.changed();
      for(const doc of snapshot.docs)if(doc.get('notifiedAt')===null)this.deliver(doc).catch(()=>{});
    },()=>this.p.report('تعذّر تحديث الشات. راجع الإنترنت.'));
  }
  async deliver(doc){
    if(this.processing.has(doc.id)||(this.retry.get(doc.id)||0)>Date.now())return;this.processing.add(doc.id);
    const uid=this.uid;
    try{
      const value=await doc.ref.get(),message=serial(value);if(value.get('notifiedAt')!==null)return;
      const viewer=await this.p.owner.collection('viewers').doc(uid).get();
      if(!viewer.get('active')||!this.p.config.enabled||uid!==this.uid)return;
      const fresh=Date.now()-message.createdAt<86400000;
      if(message.sender==='desktop'&&fresh){
        const token=viewer.get('fcmToken');if(!token)return;
        try{await this.p.messaging.send({token,data:{type:'chat',title:'يومي — رسالة ليك ♡',body:message.body,ownerId:this.p.config.ownerId,chatUid:this.uid,messageId:doc.id},android:{priority:'high',ttl:86400000}});}
        catch(error){if(!['messaging/registration-token-not-registered','messaging/invalid-registration-token','messaging/invalid-argument'].includes(error.code))throw error;}
      }
      // Claim inbound notifications transactionally, so a reconnect cannot repeat them.
      const claimed=await this.p.db.runTransaction(async tx=>{const current=await tx.get(doc.ref);if(current.get('notifiedAt')!==null)return false;tx.update(doc.ref,{notifiedAt:this.p.FieldValue.serverTimestamp()});return true;});
      if(claimed&&fresh&&message.sender===uid&&uid===this.uid)this.p.onSignal({type:'chat',body:message.body});
    }catch(error){this.retry.set(doc.id,Date.now()+30000);throw error;}finally{this.processing.delete(doc.id);}
  }
  async send(input){
    const uid=this.c.requirePartner();if(!input||typeof input.body!=='string'||!input.body.trim()||input.body.length>1000)throw Error('اكتب رسالة من حرف إلى ١٠٠٠ حرف.');
    if(Date.now()-(this.lastSent||0)<2000)throw Error('استنى ثانيتين بين الرسائل.');
    this.lastSent=Date.now();await this.p.owner.collection('chats').doc(uid).collection('messages').add({sender:'desktop',target:uid,body:input.body.trim(),createdAt:this.p.FieldValue.serverTimestamp(),notifiedAt:null});
  }
  stop(){this.unsubscribe?.();this.unsubscribe=null;this.uid=null;this.messages=[];}
  tick(){if(this.ref&&this.uid)for(const message of this.messages)if(!message.notifiedAt)this.deliver({id:message.id,ref:this.ref.doc(message.id)}).catch(()=>{});}
}
module.exports={Chat};
