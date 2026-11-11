'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const KEY = 'yawmi.flex.v1';
  const categories = { focus: 'تركيز', personal: 'شخصي', movement: 'حركة', break: 'بريك' };
  const ar = n => Number(n).toLocaleString('ar-EG');
  const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
  let state = { days: {}, timer: null }, selectedDate = today(), filter = 'all', editing = null, toastTimeout, pendingConfirm, selectedId = null;
  let storageOkay = true;
  try { const saved = window.yawmiDesktop ? window.yawmiDesktop.initialState : JSON.parse(localStorage.getItem(KEY)); if (saved && saved.days && typeof saved.days === 'object') state = structuredClone(saved); } catch { storageOkay = false; }
  function day() {
    const existing = state.days[selectedDate];
    if (!existing || !Array.isArray(existing.items)) state.days[selectedDate] = { start: '09:00', breakMinutes: 10, items: [], sample: false };
    return state.days[selectedDate];
  }
  function save() {
    try { if (window.yawmiDesktop) { const result = window.yawmiDesktop.saveState(state); storageOkay = result.ok; } else { localStorage.setItem(KEY, JSON.stringify(state)); storageOkay = true; } } catch { storageOkay = false; }
    $('save-status').innerHTML = storageOkay ? '<i></i> محفوظ على جهازك' : 'تعذّر الحفظ — صدّر نسخة احتياطية قبل الإغلاق';
  }
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function duration(n) { if(n===0)return "مفتوح · بدون وقت محدد";return n >= 60 ? `${ar(Math.floor(n/60))} س${n%60 ? ` و${ar(n%60)} د` : ''}` : n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتين' : `${ar(n)} ${n>=3 && n<=10?'دقائق':'دقيقة'}`; }
  function clockTime(minutes) { return window.yawmiTime.clock(minutes); }
  function startMinutes() { const [h,m] = day().start.split(':').map(Number); return h*60+m; }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),4500); }
  function getFocus() {
    const active = state.timer?.date === selectedDate ? day().items.find(i=>i.id===state.timer.id && !i.done) : null;
    return active || day().items.find(i=>i.minutes===0&&i.actualStart&&!i.done) || day().items.find(i=>i.id===selectedId && !i.done) || day().items.find(i=>!i.done);
  }
  function remaining(t) { return t.running ? Math.max(0, Math.ceil((t.deadline-Date.now())/1000)) : t.remaining; }
  function render() {
    const d=day(), items=d.items;
    $('day-date').value=selectedDate;
    const parsed = new Date(`${selectedDate}T12:00:00`);
    $('date-label').textContent=parsed.toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'});
    $('today-button').hidden=selectedDate===today();
    const tasks=items.filter(i=>i.kind!=='break'), complete=tasks.filter(i=>i.done).length;
    renderTotals();
    $('done-total').textContent=`${ar(complete)} من ${ar(tasks.length)}`;
    const progress=tasks.length ? Math.round(complete/tasks.length*100) : 0;
    $('progress-label').textContent=`${ar(progress)}٪`; $('progress-fill').style.width=`${progress}%`;
    $('item-count').textContent=ar(items.length); $('start-time-button').textContent=clockTime(startMinutes());
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));
    let minute=startMinutes(), focus=getFocus();
    const rows=window.yawmiTime.timeline(d,selectedDate).map(({item,start,end},index)=>{
      minute=end;
      if(filter==='task' && item.kind==='break' || filter==='break' && item.kind!=='break') return '';
      return `<article class="activity-row ${item.kind==='break'?'is-break':''} ${item.done?'done':''} ${focus?.id===item.id?'active':''}" data-id="${esc(item.id)}"><div class="row-time">${item.minutes===0&&!item.actualStart?"—":start===null?"بعد المفتوح":clockTime(start)}<span>${item.minutes===0?(item.actualEnd?clockTime(end):item.actualStart&&!item.done?"حاليًا":"—"):end===null?"نهاية مفتوحة":clockTime(end)}</span></div><div class="activity-body"><button class="task-check" data-action="done" aria-label="${item.done?'إلغاء إتمام':'إتمام'} ${esc(item.name)}" aria-pressed="${item.done}">${item.done?'✓':''}</button><div class="activity-info"><h3 class="activity-name">${esc(item.name)}</h3><div class="activity-meta"><span class="category-tag ${item.kind}">${categories[item.kind]}</span><span class="${item.minutes===0&&!item.done&&item.actualStart?"currently-label":""}">◷ ${item.minutes===0?esc(window.yawmiTime.activityRecord(item)):duration(item.minutes)}</span></div></div><div class="row-actions">${!item.done?`<button class="play-task" data-action="select" title="اختيار النشاط في المؤقت" aria-label="اختيار ${esc(item.name)} في المؤقت">◀</button>`:''}<div class="row-edit-actions"><button class="mini-button" data-action="edit" title="تعديل" aria-label="تعديل ${esc(item.name)}">✎</button><button class="mini-button" data-action="delete" title="حذف" aria-label="حذف ${esc(item.name)}">×</button></div><div class="move-buttons"><button class="mini-button" data-action="up" ${index===0?'disabled':''} title="تحريك لفوق" aria-label="تحريك ${esc(item.name)} لفوق">↑</button><button class="mini-button" data-action="down" ${index===items.length-1?'disabled':''} title="تحريك لتحت" aria-label="تحريك ${esc(item.name)} لتحت">↓</button></div></div></div></article>`;
    }).join('');
    const empty = items.length ? '<div class="empty-state"><h3>مفيش عناصر من النوع ده</h3><p>غيّر الفلتر أو ضيف عنصر جديد.</p></div>' : '<div class="empty-state"><span class="empty-symbol">✳</span><h3>يومك لسه مساحة فاضية</h3><p>ابدأ بنشاط واحد، وسيب مكان لبريك.<br>أو جرّب خطة بسيطة وتعدّلها على مزاجك.</p><button class="primary" data-empty="add">＋ أول نشاط</button><button class="secondary" data-empty="sample">جرّب خطة بسيطة</button></div>';
    $('schedule-list').innerHTML=(d.sample?'<div class="sample-note">دي خطة للتجربة. عدّلها حسب يومك أو امسحها من الإعدادات.</div>':'')+(rows||empty);
    $('end-time-label').textContent=items.length&&minute===null?'النشاط المفتوح ملوش نهاية محددة':items.length?`نهاية الخطة ${clockTime(minute)}${minute>=1440?' · تمتد لليوم التالي':''}`:'ابدأ بحاجة صغيرة';
    renderTimer();
  }
  function renderTotals(){const totals=window.yawmiTime.totals(day());$('activity-total').textContent=window.yawmiTime.totalLabel(totals.activitySeconds);$('break-total').textContent=window.yawmiTime.totalLabel(totals.breakSeconds);}
  function renderTimer() {
    const focus=getFocus(), t=state.timer, matching=focus && t?.date===selectedDate && t.id===focus.id;
    const open=focus?.minutes===0,openRunning=open&&focus.actualStart&&!focus.done;const sec=openRunning?Math.max(0,Math.floor((Date.now()-focus.actualStart)/1000)):matching?remaining(t):(focus?focus.minutes*60:0);
    $('focus-title').textContent=focus?focus.name:day().items.length?'خلصت خطتك، برافو عليك!':'مساحة لبداية جديدة';
    $('focus-category').textContent=focus?`${categories[focus.kind]} · ${duration(focus.minutes)}`:'ضيف نشاط جديد وقت ما تحب';
    $('focus-caption').textContent=matching&&t.running?'دلوقتي وقتك لـ':'خطوتك الجاية';
    $('timer-state').textContent=open?(openRunning?'حاليًا':'وقت مفتوح'):matching?(t.running?(focus.kind==='break'?'وقت الراحة':'وقت التركيز'):'متوقف مؤقتًا'):'جاهز تبدأ؟';
    $('timer-display').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
    $('timer-subtitle').textContent=focus?.kind==='break'?'خُد نفسك وارتاح':'على قد خطوتك';
    $('timer-arc').style.strokeDashoffset=String(615.75*(1-(open?1:focus?Math.min(1,sec/(focus.minutes*60)):1)));
    $('timer-toggle').innerHTML=open?(openRunning?'شغال لحد ما تخلص ♡':'بعمله دلوقتي ◀'):matching&&t.running?'وقفة صغيرة <span>Ⅱ</span>':matching?'كمّل النشاط <span>◀</span>':focus?.kind==='break'?'ابدأ البريك <span>◀</span>':'ابدأ النشاط <span>◀</span>';
    ['timer-toggle','extend-button','finish-button'].forEach(id=>$(id).disabled=!focus);$('timer-toggle').disabled=!focus||!!openRunning;$('extend-button').disabled=!focus||open;
    if(state.timer && state.timer.date!==selectedDate) $('timer-state').textContent=state.timer.running?'المؤقت شغال في يوم تاني':'في مؤقت متوقف في يوم تاني';
  }
  function showConfirm(title,message,action) { $('confirm-title').textContent=title; $('confirm-message').textContent=message; pendingConfirm=action; $('confirm-dialog').showModal(); }
  function askSwitch(action) {
    if(state.timer) showConfirm('نغيّر النشاط؟','في مؤقت لنشاط تاني. لو كمّلت هنعيد ضبطه، والنشاط هيفضل في جدولك.',()=>{state.timer=null;action();save();render();}); else action();
  }
  function openActivity(item=null,kind=null) {
    editing=item?.id||null;
    $('form-title').textContent=item?'تعديل النشاط':kind==='break'?'ضيف بريك':'أضف نشاط';
    $('activity-name').value=item?.name||(kind==='break'?'بريك صغير':'');
    $('activity-open').checked=item?.minutes===0;$('activity-duration').disabled=$('activity-open').checked;
    $('activity-duration').value=item?.minutes||(kind==='break'?day().breakMinutes:45);
    $('activity-kind').value=item?.kind||kind||'focus';
    $('with-break').checked=!item&&kind!=='break';
    $('with-break').parentElement.hidden=!!item||kind==='break';
    $('break-minutes-label').textContent=duration(day().breakMinutes);
    $('save-activity').textContent=item?'احفظ التعديل':'أضف لليوم';
    $('activity-dialog').showModal(); $('activity-name').focus();
  }
  function finish(id,notify=false) {
    const date=state.timer?.id===id?state.timer.date:selectedDate;
    const item=state.days[date]?.items.find(i=>i.id===id);
    if(!item)return;
    if(item.minutes===0&&item.actualStart)item.actualEnd=Math.max(item.actualStart,Date.now());item.done=true;
    if(state.timer?.id===id)state.timer=null;
    selectedId=null;save();render();
    const message=item.kind==='break'?'البريك خلص. جاهز لخطوة جديدة؟':`خلص وقت «${item.name}». خطوة حلوة في يومك!`;
    toast(notify?message:'تمام، خطوة وخلصت ✓');
    if(notify && window.yawmiDesktop) { window.yawmiDesktop.notify(message).catch(()=>{}); }
    else if(notify && 'Notification' in window && Notification.permission==='granted') { try { new Notification('يومي',{body:message,icon:'icon.svg'}); } catch {} }
    if(notify) window.yawmiAlarm.start(message);
  }
  function tick() { renderTotals();if(state.timer?.running && remaining(state.timer)===0) finish(state.timer.id,true); else renderTimer(); }
  function chooseDate(value) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;selectedDate=value;selectedId=null;filter='all';render(); }
  $('activity-form').addEventListener('submit',e=>{
    e.preventDefault(); const name=$('activity-name').value.trim(), minutes=$('activity-open').checked?0:Number($('activity-duration').value),kind=$('activity-kind').value;
    if(!name){$('activity-name').setCustomValidity('اكتب اسم النشاط');$('activity-name').reportValidity();return;}
    if(!Number.isInteger(minutes)||minutes<0||minutes>720){$('activity-duration').setCustomValidity('اختار عدد صحيح من ١ إلى ٧٢٠ دقيقة');$('activity-duration').reportValidity();return;}
    const apply=()=>{ const existing=day().items.find(i=>i.id===editing);if(existing){Object.assign(existing,{name,minutes,kind});delete existing.actualStart;delete existing.actualEnd;}else{day().items.push({id:uid(),name,minutes,kind,done:false});if($('with-break').checked&&kind!=='break') day().items.push({id:uid(),name:'بريك صغير',minutes:day().breakMinutes,kind:'break',done:false});}save();render();$('activity-dialog').close();toast(existing?'التعديل اتحفظ':'اتضاف لجدولك'); };
    if(editing && state.timer?.id===editing) askSwitch(apply);else apply();
  });
  ['activity-name','activity-duration'].forEach(id=>$(id).addEventListener('input',()=>$(id).setCustomValidity('')));
  $('activity-kind').addEventListener('change',()=>{const isBreak=$('activity-kind').value==='break';$('with-break').parentElement.hidden=!!editing||isBreak;if(isBreak)$('with-break').checked=false;});
  $('activity-open').onchange=()=>{$('activity-duration').disabled=$('activity-open').checked;if($('activity-open').checked)$('with-break').checked=false;};
  $('add-button').onclick=()=>openActivity();
  $('quick-break').onclick=$('sidebar-break').onclick=()=>openActivity(null,'break');
  $('schedule-list').addEventListener('click',e=>{
    const empty=e.target.closest('[data-empty]');if(empty){if(empty.dataset.empty==='add')openActivity();else{day().items=[['أهم حاجة عايز أخلصها',45,'focus'],['بريك وفنجان قهوة',10,'break'],['شوية حركة',20,'movement'],['وقت لحاجة بحبها',30,'personal']].map(([name,minutes,kind])=>({id:uid(),name,minutes,kind,done:false}));day().sample=true;save();render();}return;}
    const button=e.target.closest('[data-action]'),row=e.target.closest('[data-id]');if(!button||!row)return;
    const item=day().items.find(i=>i.id===row.dataset.id);if(!item)return;
    switch(button.dataset.action){
      case 'edit':openActivity(item);break;
      case 'delete':showConfirm('حذف النشاط؟',`هنشيل «${item.name}» من خطة اليوم.`,()=>{day().items=day().items.filter(i=>i.id!==item.id);if(state.timer?.id===item.id)state.timer=null;save();render();toast('اتحذف من الجدول');});break;
      case 'select':{const choose=()=>{selectedId=item.id;render();toast('النشاط جاهز في المؤقت. اضغط ابدأ.');};if(state.timer && (state.timer.id!==item.id||state.timer.date!==selectedDate))askSwitch(choose);else choose();break;}
      case 'done':if(item.minutes===0&&item.actualStart){if(!item.done)item.actualEnd=Math.max(item.actualStart,Date.now());else{delete item.actualStart;delete item.actualEnd;}}item.done=!item.done;if(state.timer?.id===item.id)state.timer=null;save();render();break;
      case 'up':case 'down':{const index=day().items.indexOf(item),target=index+(button.dataset.action==='up'?-1:1);if(target>=0&&target<day().items.length){[day().items[index],day().items[target]]=[day().items[target],day().items[index]];save();render();}break;}
    }
  });
  $('timer-toggle').onclick=()=>{
    const item=getFocus();if(!item)return;
    if(selectedDate!==today()){toast('افتح جدول النهارده عشان تبدأ النشاط بوقته الفعلي.');return;}
    const apply=()=>{for(const d of Object.values(state.days))for(const old of d.items)if(old.id!==item.id&&old.minutes===0&&old.actualStart&&!old.done){old.done=true;old.actualEnd=Math.max(old.actualStart,Date.now());}
      if(item.minutes===0){item.actualStart=Date.now();delete item.actualEnd;state.timer=null;save();render();return;}
      if(state.timer?.id===item.id && state.timer.date===selectedDate){if(state.timer.running){state.timer.remaining=remaining(state.timer);state.timer.running=false;}else{state.timer.deadline=Date.now()+state.timer.remaining*1000;state.timer.running=true;}}else{item.actualStart=Date.now();state.timer={id:item.id,date:selectedDate,remaining:item.minutes*60,deadline:Date.now()+item.minutes*60000,running:true};}save();render();};
    if(state.timer && (state.timer.id!==item.id||state.timer.date!==selectedDate))askSwitch(apply);else apply();
  };
  $('extend-button').onclick=()=>{const item=getFocus();if(!item)return;if(item.minutes>715){toast('أقصى مدة للنشاط ١٢ ساعة');return;}item.minutes+=5;if(state.timer?.id===item.id&&state.timer.date===selectedDate){if(state.timer.running)state.timer.deadline+=300000;else state.timer.remaining+=300;}save();render();toast('زودنا ٥ دقائق وظبطنا باقي المواعيد');};
  $('finish-button').onclick=()=>{const item=getFocus();if(item)finish(item.id);};
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('confirm-yes').onclick=()=>{const action=pendingConfirm;pendingConfirm=null;$('confirm-dialog').close();action?.();};
  $('day-date').onchange=e=>chooseDate(e.target.value);
  function shiftDate(offset) { const d=new Date(`${selectedDate}T12:00:00`);d.setDate(d.getDate()+offset);chooseDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); }
  $('prev-day').onclick=()=>shiftDate(-1);$('next-day').onclick=()=>shiftDate(1);$('today-button').onclick=()=>chooseDate(today());
  const settings=()=>{const [hour,minute]=day().start.split(':').map(Number);$('day-hour').value=hour%12||12;$('day-minute').value=String(minute).padStart(2,'0');$('day-period').value=hour<12?'am':'pm';$('default-break').value=day().breakMinutes;updateNotificationStatus();$('settings-dialog').showModal();};
  $('settings-button').onclick=$('start-time-button').onclick=settings;
  $('settings-form').onsubmit=e=>{e.preventDefault();const minutes=Number($('default-break').value),hour=Number($('day-hour').value),minute=Number($('day-minute').value);if(!Number.isInteger(minutes)||minutes<1||minutes>120||!Number.isInteger(hour)||hour<1||hour>12||!Number.isInteger(minute)||minute<0||minute>59)return;day().start=`${String(hour%12+($('day-period').value==='pm'?12:0)).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;day().breakMinutes=minutes;save();render();$('settings-dialog').close();toast('الإعدادات اتحفظت');};
  $('clear-day').onclick=()=>{$('settings-dialog').close();showConfirm('نمْسح خطة اليوم؟','هنحذف كل أنشطة وبريكات اليوم المختار. باقي الأيام هتفضل محفوظة.',()=>{day().items=[];day().sample=false;if(state.timer?.date===selectedDate)state.timer=null;save();render();toast('اليوم جاهز لبداية جديدة');});};
  function updateNotificationStatus(){if(window.yawmiDesktop){$('notifications-button').hidden=true;$('notifications-status').textContent='تنبيه نهاية المؤقت مدمج في البرنامج. خلّي يومي مفتوح، حتى لو النافذة مصغّرة. ممكن وضع عدم الإزعاج في Windows يخفي التنبيه.';return;}const available='Notification' in window;const permission=available?Notification.permission:'unsupported';$('notifications-button').disabled=!available||permission==='granted'||permission==='denied';$('notifications-status').textContent=permission==='granted'?'تنبيه المتصفح مفعّل. خلي الصفحة مفتوحة.':permission==='denied'?'التنبيهات مقفولة. تقدر تسمح بيها من إعدادات الموقع في المتصفح.':available?'هنعرض تنبيه عند انتهاء المؤقت إذا سمحت للمتصفح.':'المتصفح ده مش بيدعم التنبيهات. التنبيه جوه الصفحة متاح.';}
  $('notifications-button').onclick=async()=>{try{await Notification.requestPermission();updateNotificationStatus();}catch{toast('التنبيهات مش متاحة في المتصفح ده');}};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  window.addEventListener('storage',e=>{if(e.key!==KEY)return;try{const other=JSON.parse(e.newValue);if(other?.days){state=other;render();}}catch{}});
  window.addEventListener('yawmi:imported',event=>{state=structuredClone(event.detail);selectedId=null;filter='all';save();render();tick();toast('الخطة اتنقلت ليومي بنجاح');});
  window.addEventListener('yawmi:resume',tick);
  window.addEventListener('yawmi:accepted-proposal',event=>{state=structuredClone(event.detail);save();render();toast('الاقتراح اتضاف لجدولك ✓');});
  window.addEventListener('yawmi:message',event=>toast(event.detail));
  save();render();tick();setInterval(tick,1000);
  if(window.yawmiDesktop?.startupWarning) toast(window.yawmiDesktop.startupWarning);
})();
