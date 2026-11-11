'use strict';
(() => {
  const bridge = window.yawmiDesktop;
  if (!bridge) return;
  const $ = id => document.getElementById(id);
  const message = text => window.dispatchEvent(new CustomEvent('yawmi:message', { detail: text }));
  document.documentElement.classList.add('desktop-app');
  const toolbar = document.createElement('div');
  toolbar.className = 'desktop-toolbar';
  toolbar.setAttribute('aria-label', 'أدوات يومي');
  toolbar.innerHTML = '<span class="desktop-badge">برنامجك اليومي</span><button class="text-button" id="desktop-sharing" title="Ctrl+Shift+M">♡ مشاركة الجدول</button><button class="text-button" id="desktop-import" title="Ctrl+O">↥ استيراد</button><button class="text-button" id="desktop-export" title="Ctrl+Shift+S">↧ نسخة احتياطية</button><button class="icon-button shortcut-help" id="desktop-shortcuts" title="اختصارات الكيبورد" aria-label="اختصارات الكيبورد">⌨</button>';
  document.querySelector('.header-left').prepend(toolbar);
  const note = document.querySelector('.device-note p');
  note.textContent = 'كل بياناتك محفوظة محليًا في يومي. تقدر تصغّر النافذة والمؤقت يكمل، وخلي البرنامج مفتوح لتنبيه نهاية الوقت.';
  let busy = false;
  const share=document.createElement('dialog');share.id='sharing-dialog';
  share.innerHTML='<div class="dialog-heading"><div><span class="eyebrow">بينك وبينها</span><h2>قريبين، حتى وإنتوا بعيد</h2></div><button id="close-sharing" class="icon-button" aria-label="إغلاق المشاركة">×</button></div><p class="field-note">صديقتك تشوف جدولك وتستقبل تحديثاته بهدوء. ولو محتاجاك، تبعت لك منبّه على الكمبيوتر.</p><p id="share-status" role="status"></p><label class="field-label" for="share-owner-name">اسمك اللي يظهر عندها</label><input id="share-owner-name" maxlength="50" placeholder="اسمك" autocomplete="off"><div class="sharing-actions"><button class="primary" id="share-enable">فعّل المشاركة</button><button class="secondary" id="share-pause">أوقف المزامنة</button><button class="secondary" id="share-import-key">تجهيز الاتصال</button></div><section id="share-connected"><h3>الربط الحالي</h3><p id="share-viewer"></p><button class="secondary" id="share-revoke">إلغاء الربط</button></section><section id="share-code-section"><h3>كود خاص لصديقتك</h3><p class="field-note">الكود لشخص واحد ولمرة واحدة، وصالح ١٠ دقائق. ابعته لها مع تطبيق يومي على الموبايل.</p><button class="secondary" id="share-invite">اعمل كود ربط</button><input id="share-code" readonly dir="ltr" aria-label="كود الاقتران"><p id="share-expiry" class="field-note"></p></section><p class="field-note">الإنترنت مطلوب للمشاركة. خلي يومي مفتوحًا لاستقبال «محتاجك». إغلاقه يوقف المزامنة والتنبيهات لحد ما تفتحه تاني.</p>';
  document.body.append(share);let shareState,shareBusy=false;
  function paintShare(value){
    shareState=value;$('share-status').textContent=value.message;
    if(document.activeElement!==$('share-owner-name'))$('share-owner-name').value=value.ownerName;
    $('share-import-key').hidden=value.configured;$('share-enable').hidden=value.enabled;
    $('share-pause').hidden=!value.enabled;$('share-enable').disabled=!value.configured;
    const viewer=value.viewers?.[0];$('share-connected').hidden=!viewer;
    $('share-viewer').textContent=viewer?viewer.name+' · مشاهدة وتنبيهات فقط':'';
    $('share-code-section').hidden=!!viewer||!value.enabled;
    const valid=value.invite&&value.invite.expiresAt>Date.now();
    $('share-code').hidden=!valid;$('share-code').value=valid?value.invite.code:'';
    $('share-expiry').textContent=valid?'صالح لحد '+new Date(value.invite.expiresAt).toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'})+' · اضغط على الكود لتحديده ونسخه':'';
  }
  async function sharingAction(action,value){
    if(shareBusy)return;shareBusy=true;
    const buttons=share.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
    try{const result=await bridge.sharing(action,value);if(result.ok)paintShare(result.status);else if(!result.canceled)$('share-status').textContent=result.error||'تعذّر الاتصال. جرّب تاني.';}
    catch{$('share-status').textContent='تعذّر الاتصال بالمشاركة.';}
    finally{shareBusy=false;buttons.forEach(b=>b.disabled=false);if(shareState&&!shareState.configured)$('share-enable').disabled=true;}
  }
  async function openSharing(){if(document.querySelector('dialog[open]'))return;share.showModal();await sharingAction('status');}
  $('close-sharing').onclick=()=>share.close();$('desktop-sharing').onclick=openSharing;
  $('share-enable').onclick=()=>sharingAction('enable',$('share-owner-name').value);
  $('share-pause').onclick=()=>sharingAction('pause');$('share-import-key').onclick=()=>sharingAction('import-key');
  $('share-invite').onclick=()=>sharingAction('invite');$('share-revoke').onclick=()=>sharingAction('revoke',shareState?.viewers?.[0]?.uid);
  $('share-code').onclick=()=>$('share-code').select();
  bridge.onSharingStatus(paintShare);
  bridge.onNudge(text=>{window.yawmiAlarm.start(text);});
  async function backup(action) {
    if (busy || document.querySelector('dialog[open]')) return;
    busy = true;
    $('desktop-import').disabled = $('desktop-export').disabled = true;
    try {
      const result = await (action === 'import' ? bridge.importBackup() : bridge.exportBackup());
      if (result.canceled) return;
      if (!result.ok) { message(result.error || 'تعذّر إتمام العملية.'); return; }
      if (action === 'import') window.dispatchEvent(new CustomEvent('yawmi:imported', { detail: result.state }));
      else message('النسخة الاحتياطية اتحفظت في المكان اللي اخترته');
    } catch { message('تعذّر إتمام العملية. جرّب تاني.'); }
    finally { busy = false; $('desktop-import').disabled = $('desktop-export').disabled = false; }
  }
  const help = document.createElement('dialog');
  help.id = 'shortcuts-dialog';
  help.innerHTML = '<div class="dialog-heading"><h2>كل حاجة تحت إيدك</h2><button class="icon-button" aria-label="إغلاق الاختصارات" id="close-shortcuts">×</button></div><dl class="shortcut-list"><div><dt>نشاط جديد</dt><dd><kbd>Ctrl + N</kbd></dd></div><div><dt>تشغيل / إيقاف المؤقت</dt><dd><kbd>Ctrl + Space</kbd></dd></div><div><dt>خطة النهارده</dt><dd><kbd>Ctrl + T</kbd></dd></div><div><dt>إعدادات اليوم</dt><dd><kbd>Ctrl + ,</kbd></dd></div><div><dt>استيراد نسخة</dt><dd><kbd>Ctrl + O</kbd></dd></div><div><dt>تصدير نسخة</dt><dd><kbd>Ctrl + Shift + S</kbd></dd></div><div><dt>إغلاق يومي</dt><dd><kbd>Alt + F4</kbd></dd></div></dl><p class="field-note">اضغط Alt لإظهار قائمة البرنامج. الإغلاق يوقف التنبيهات، وآخر خطة محفوظة هتكون موجودة لما تفتح تاني.</p>';
  document.body.append(help);
  $('close-shortcuts').onclick = () => help.close();
  $('desktop-import').onclick = () => backup('import');
  $('desktop-export').onclick = () => backup('export');
  $('desktop-shortcuts').onclick = () => { if (!document.querySelector('dialog[open]')) help.showModal(); };
  bridge.onCommand(command => {
    if (command === 'resume') { window.dispatchEvent(new Event('yawmi:resume')); return; }
    if (busy || document.querySelector('dialog[open]')) return;
    if (command === 'add') $('add-button').click();
    else if (command === 'timer') $('timer-toggle').click();
    else if (command === 'today') $('today-button').click();
    else if (command === 'settings') $('settings-button').click();
    else if (command === 'sharing') openSharing();
    else if (command === 'shortcuts') help.showModal();
    else if (command === 'import' || command === 'export') backup(command);
  });
})();
