'use strict';
const { app, BrowserWindow, Menu, protocol, session, ipcMain, dialog, Notification, powerMonitor, nativeTheme, safeStorage, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { MAX_BYTES, parseBackup, atomicWrite, makeStore } = require('./state.cjs');
const { Sharing } = require('./sharing.cjs');
const ORIGIN = 'yawmi://app';
const HOME = ORIGIN + '/index.html';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; media-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
protocol.registerSchemesAsPrivileged([{ scheme: 'yawmi', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.enableSandbox();
app.setName('Yawmi');
// Give the branded release its own Windows identity, distinct from the old
// Electron-associated taskbar group cached under com.yawmi.desktop.
const WINDOWS_APP_ID='Yawmi.Desktop';
app.setAppUserModelId(WINDOWS_APP_ID);
const qaMode = !app.isPackaged && process.env.YAWMI_QA === '1';
const dataRoot = qaMode ? path.join(app.getPath('temp'), 'Yawmi-Desktop-QA') : path.join(app.getPath('appData'), 'Yawmi');
fs.mkdirSync(dataRoot, { recursive: true });
app.setPath('userData', dataRoot);
app.setPath('sessionData', path.join(dataRoot, 'Chromium'));
const store = makeStore(dataRoot);
let window, currentState, startupWarning, backupBusy = false;
let lastNotification = 0;
let sharing;
let selectedTheme='dark';try{const value=JSON.parse(fs.readFileSync(path.join(dataRoot,'theme.json'),'utf8')).theme;if(['light','dark'].includes(value))selectedTheme=value;}catch{}
function trusted(event) {
  return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && [HOME, ORIGIN + '/'].includes(event.senderFrame.url);
}
function ensureTrusted(event) { if (!trusted(event)) throw new Error('طلب غير مسموح.'); }
function send(command) { if (window && !window.isDestroyed()) window.webContents.send('yawmi:command', command); }
function registerIPC() {
  ipcMain.handle('yawmi:theme',(event,theme)=>{ensureTrusted(event);if(!['light','dark'].includes(theme))return{ok:false};try{atomicWrite(path.join(dataRoot,'theme.json'),JSON.stringify({theme}));selectedTheme=theme;nativeTheme.themeSource=theme;window?.setBackgroundColor(theme==='dark'?'#17151b':'#fff7fa');return{ok:true};}catch{return{ok:false};}});
  ipcMain.handle('yawmi:couple',async(event,action,input)=>{
    ensureTrusted(event);
    try{if(!sharing?.couple)throw Error('فعّل المشاركة واربطوا التطبيقين الأول.');return{ok:true,couple:await sharing.couple.action(action,input)};}
    catch(error){return{ok:false,error:error.message};}
  });
  ipcMain.on('yawmi:load', event => {
    if (!trusted(event)) { event.returnValue = { state: null, warning: 'طلب غير مسموح.' }; return; }
    event.returnValue = { state: currentState, warning: startupWarning, version: app.getVersion(), theme:selectedTheme };
  });
  ipcMain.on('yawmi:save', (event, input) => {
    if (!trusted(event)) { event.returnValue = { ok: false, error: 'طلب غير مسموح.' }; return; }
    try { currentState = store.save(input); sharing?.update(currentState); event.returnValue = { ok: true }; }
    catch (error) { event.returnValue = { ok: false, error: error.message }; }
  });
  ipcMain.handle('yawmi:export', async event => {
    ensureTrusted(event);
    if (backupBusy) return { canceled: true };
    backupBusy = true;
    try {
      const picked = await dialog.showSaveDialog(window, { title: 'تصدير نسخة احتياطية من يومي', defaultPath: `Yawmi-Backup-${new Date().toISOString().slice(0,10)}.json`, filters: [{ name: 'نسخة يومي', extensions: ['json'] }] });
      if (picked.canceled || !picked.filePath) return { canceled: true };
      const envelope = { format: 'yawmi-backup', version: 1, exportedAt: new Date().toISOString(), state: currentState || { days: {}, timer: null } };
      atomicWrite(picked.filePath, JSON.stringify(envelope, null, 2));
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
    finally { backupBusy = false; }
  });
  ipcMain.handle('yawmi:import', async event => {
    ensureTrusted(event);
    if (backupBusy) return { canceled: true };
    backupBusy = true;
    try {
      const picked = await dialog.showOpenDialog(window, { title: 'استيراد نسخة احتياطية ليومي', properties: ['openFile'], filters: [{ name: 'نسخة يومي', extensions: ['json'] }] });
      if (picked.canceled || picked.filePaths.length !== 1) return { canceled: true };
      const file = picked.filePaths[0];
      if (fs.statSync(file).size > MAX_BYTES) throw new Error('حجم الملف أكبر من ٥ ميجابايت.');
      const imported = parseBackup(fs.readFileSync(file, 'utf8'));
      const confirmation = await dialog.showMessageBox(window, { type: 'question', title: 'استيراد الخطة', message: 'نستبدل الخطة الحالية بالنسخة الاحتياطية؟', detail: 'هنحتفظ بنسخة من خطتك الحالية في مجلد بيانات يومي قبل الاستبدال.', buttons: ['إلغاء', 'استيراد'], defaultId: 0, cancelId: 0, noLink: true });
      if (confirmation.response !== 1) return { canceled: true };
      if (currentState) atomicWrite(path.join(dataRoot, `before-import-${Date.now()}.json`), JSON.stringify(currentState));
      // A backup is a plan, not permission to run a timer from another computer.
      if (imported.timer) {
        imported.timer.remaining = imported.timer.running ? Math.min(43200, Math.max(0, Math.ceil((imported.timer.deadline - Date.now()) / 1000))) : imported.timer.remaining;
        imported.timer.running = false;
      }
      currentState = store.save(imported);
      sharing?.update(currentState);
      return { ok: true, state: currentState };
    } catch (error) { return { ok: false, error: error.message }; }
    finally { backupBusy = false; }
  });
  ipcMain.handle('yawmi:notify', (event, message) => {
    ensureTrusted(event);
    if (typeof message !== 'string' || message.length > 250 || Date.now() - lastNotification < 5000) return false;
    lastNotification = Date.now();
    if (Notification.isSupported()) {
      const notice = new Notification({ title: 'يومي', body: message, silent: true, icon: path.join(app.getAppPath(), 'assets/icon.png') });
      notice.on('click', () => { if (window?.isMinimized()) window.restore(); window?.show(); window?.focus(); });
      notice.show();
    }
    if (window && !window.isFocused()) window.flashFrame(true);
    if (window) { if (window.isMinimized()) window.restore(); window.show(); }
    return true;
  });
  ipcMain.handle('yawmi:sharing', async (event, action, value) => {
    ensureTrusted(event);
    try {
      if (action === 'status') return {ok:true,status:sharing.status()};
      if (action === 'enable') return {ok:true,status:await sharing.enable(value)};
      if (action === 'pause') return {ok:true,status:await sharing.pause()};
      if (action === 'invite') return {ok:true,status:await sharing.createInvite()};
      if (action === 'revoke') {
        if(typeof value!=='string'||value.length>128)throw Error('طلب غير صالح.');
        const answer=await dialog.showMessageBox(window,{type:'question',title:'إلغاء الربط',message:'نلغي وصول صديقتك للجدول والتنبيهات؟',buttons:['رجوع','إلغاء الربط'],defaultId:0,cancelId:0,noLink:true});
        if(answer.response!==1)return {canceled:true};
        return {ok:true,status:await sharing.revoke(value)};
      }
      if (action === 'import-key') {
        const picked=await dialog.showOpenDialog(window,{title:'ملف اتصال Firebase الخاص بالكمبيوتر',properties:['openFile'],filters:[{name:'إعداد اتصال يومي',extensions:['json']}]});
        if(picked.canceled||picked.filePaths.length!==1)return {canceled:true};
        return {ok:true,status:await sharing.importKey(picked.filePaths[0])};
      }
      throw Error('طلب غير مسموح.');
    } catch(error) {return {ok:false,error:error.message};}
  });
}
function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'يومي', submenu: [
      { label: 'أضف نشاط', accelerator: 'CmdOrCtrl+N', click: () => send('add') },
      { label: 'تشغيل / إيقاف المؤقت', accelerator: 'CmdOrCtrl+Space', click: () => send('timer') },
      { label: 'النهارده', accelerator: 'CmdOrCtrl+T', click: () => send('today') },
      { type: 'separator' },
      { label: 'استيراد خطة', accelerator: 'CmdOrCtrl+O', click: () => send('import') },
      { label: 'تصدير نسخة احتياطية', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('export') },
      { label: 'إعدادات اليوم', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
      { label: 'المشاركة مع صديقتك', accelerator: 'CmdOrCtrl+Shift+M', click: () => send('sharing') },
      { type: 'separator' }, { label: 'إغلاق يومي', accelerator: 'Alt+F4', role: 'close' }
    ] },
    { label: 'تحرير', submenu: [{ label: 'تراجع', role: 'undo' }, { label: 'إعادة', role: 'redo' }, { type: 'separator' }, { label: 'قص', role: 'cut' }, { label: 'نسخ', role: 'copy' }, { label: 'لصق', role: 'paste' }, { label: 'تحديد الكل', role: 'selectAll' }] },
    { label: 'عرض', submenu: [{ label: 'تكبير', role: 'zoomIn' }, { label: 'تصغير', role: 'zoomOut' }, { label: 'الحجم الطبيعي', role: 'resetZoom' }, { type: 'separator' }, { label: 'ملء الشاشة', role: 'togglefullscreen' }, { label: 'تصغير النافذة', role: 'minimize' }] },
    { label: 'مساعدة', submenu: [{ label: 'الاختصارات', click: () => send('shortcuts') }, { label: 'عن يومي', click: () => dialog.showMessageBox(window, { type: 'info', title: 'عن يومي', message: `يومي ${app.getVersion()}`, detail: 'منظم يوم مرن للأنشطة والبريكات.\nكل بياناتك محفوظة محليًا. البرنامج يعمل دون إنترنت.\nيستمر المؤقت أثناء التصغير، والتطبيق يجب أن يظل مفتوحًا لإرسال التنبيهات.' }) }] }
  ]));
}
async function createWindow() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(path.join(dataRoot, 'window.json'), 'utf8')); } catch {}
  // Use the decoded branded image for the window and a real ICO for the shell.
  const appIcon=nativeImage.createFromBuffer(fs.readFileSync(path.join(app.getAppPath(),'assets/icon.png')));
  if(appIcon.isEmpty())throw Error('تعذّر تحميل أيقونة يومي.');
  window = new BrowserWindow({
    width: Number.isInteger(saved.width) ? Math.max(900, Math.min(2400, saved.width)) : 1360,
    height: Number.isInteger(saved.height) ? Math.max(650, Math.min(1600, saved.height)) : 940,
    minWidth: 900, minHeight: 650,
    show: false, title: 'يومي — يومك على مهلك', backgroundColor: selectedTheme==='dark'?'#17151b':'#fff7fa',
    icon: appIcon, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, devTools: !app.isPackaged, spellcheck: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  window.setIcon(appIcon);
  if(process.platform==='win32'){
    const branding=path.join(dataRoot,'branding');fs.mkdirSync(branding,{recursive:true});
    const taskbarIcon=path.join(branding,'yawmi-heart-v2.ico');
    const iconData=fs.readFileSync(path.join(app.getAppPath(),'assets/icon.ico'));
    if(!fs.existsSync(taskbarIcon)||!fs.readFileSync(taskbarIcon).equals(iconData))fs.writeFileSync(taskbarIcon,iconData);
    const portable=process.env.PORTABLE_EXECUTABLE_FILE;
    const launcher=app.isPackaged&&portable&&path.isAbsolute(portable)&&fs.existsSync(portable)?portable:process.execPath;
    window.setAppDetails({appId:qaMode?'Yawmi.Desktop.QA':WINDOWS_APP_ID,appIconPath:taskbarIcon,appIconIndex:0,relaunchCommand:`"${launcher}"${app.isPackaged?'':` "${app.getAppPath()}"`}`,relaunchDisplayName:'يومي — Yawmi'});
    if(app.isPackaged){
      // A matching Start-menu shortcut lets Windows resolve this application's
      // identity and icon independently of Electron and temporary portable paths.
      const start=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','Yawmi.lnk');
      const desktop=path.join(app.getPath('desktop'),'Yawmi.lnk');
      const details={target:launcher,cwd:path.dirname(launcher),description:'يومي — مساحتنا الصغيرة',icon:taskbarIcon,iconIndex:0,appUserModelId:WINDOWS_APP_ID};
      for(const link of [start,desktop]){
        try{const existing=fs.existsSync(link)?shell.readShortcutLink(link):null;if(existing&&!/^Yawmi(?:-Portable-[\d.]+-x64)?\.exe$/i.test(path.basename(existing.target)))continue;if(link===desktop&&!existing)continue;fs.mkdirSync(path.dirname(link),{recursive:true});shell.writeShortcutLink(link,existing?'update':'create',details);}catch{}
      }
    }
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (qaMode) {
    window.webContents.on('console-message', details => console.log('[QA renderer]', details.message));
    window.webContents.on('audio-state-changed', event => console.log('[QA audio]', event.audible));
  }
  window.webContents.on('will-navigate', (event, target) => { if (![HOME, ORIGIN + '/'].includes(target)) event.preventDefault(); });
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('page-title-updated', event => event.preventDefault());
  window.on('focus', () => window.flashFrame(false));
  window.on('close', event => {
    if (backupBusy) { event.preventDefault(); return; }
    const bounds = window.getNormalBounds();
    atomicWrite(path.join(dataRoot, 'window.json'), JSON.stringify({ width: bounds.width, height: bounds.height, maximized: window.isMaximized() }));
  });
  window.on('closed', () => { window = null; });
  window.webContents.on('render-process-gone', (_event, details) => { if (details.reason !== 'clean-exit') dialog.showErrorBox('يومي', 'الواجهة توقفت. اقفل البرنامج وافتحه تاني. آخر خطة محفوظة على جهازك.'); });
  window.once('ready-to-show', () => { if (saved.maximized) window.maximize(); window.show(); });
  await window.loadURL(HOME);
}
if (process.argv.includes('--verify-vault')) {
  app.whenReady().then(async()=>{
    try{const decoded=await safeStorage.decryptStringAsync(fs.readFileSync(path.join(dataRoot,'sharing-key.bin')));const value=JSON.parse(decoded.result);if(value.type!=='service_account'||!value.private_key||value.project_id!=='yawmi-private-20261024-a16d')throw Error('Unexpected credential');console.log('PASS packaged runtime can decrypt the configured Yawmi vault');app.exit(0);}
    catch{console.error('FAIL Yawmi vault verification');app.exit(1);}
  });
}
else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    nativeTheme.themeSource = selectedTheme;
    const loaded = store.load(); currentState = loaded.state; startupWarning = loaded.warning;
    sharing=new Sharing({root:dataRoot,safeStorage,onStatus:status=>{if(window&&!window.isDestroyed())window.webContents.send('yawmi:sharing-status',status);},onAcceptProposal:proposal=>{
      const next=structuredClone(currentState||{days:{},timer:null});
      next.days[proposal.date]||={start:new Date().toTimeString().slice(0,5),breakMinutes:10,sample:false,items:[]};
      const day=next.days[proposal.date],id='p-'+proposal.id;
      if(!day.items.some(item=>item.id===id))day.items.push({id,name:proposal.name,minutes:proposal.minutes,kind:proposal.kind,done:false});
      currentState=store.save(next);sharing.update(currentState);
      if(window&&!window.isDestroyed())window.webContents.send('yawmi:plan-updated',currentState);
    },onSignal:event=>{
      if(typeof event.body!=='string'||event.body.length>(event.type==='chat'?1000:250))return;
      if(event.type==='alarm'){sharing.onNudge(event.body);return;}
      if(window&&!window.isDestroyed())window.webContents.send('yawmi:couple-event',event);
      if(Notification.isSupported()){const note=new Notification({title:event.type==='chat'?'يومي — رسالة جديدة ♡':event.type==='missyou'?'يومي — وحشتني ❤️':'يومي — مساحة مشتركة',body:event.body,silent:true,icon:path.join(app.getAppPath(),'assets/icon.png')});note.on('click',()=>{if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();if(event.type==='chat')window.webContents.send('yawmi:couple-event',{type:'open-chat',body:''});}});note.show();}
    },onNudge:name=>{
      if(!window||window.isDestroyed())return;
      if(window.isMinimized())window.restore();window.show();window.flashFrame(true);
      window.webContents.send('yawmi:nudge',`${name} · اضغط إيقاف لإغلاق المنبّه.`);
      if(Notification.isSupported())new Notification({title:'يومي — محتاجك',body:`${name} بعتت لك تنبيه`,silent:true,icon:path.join(app.getAppPath(),'assets/icon.png')}).show();
    }});
    sharing.update(currentState);
    const allowedFiles = new Map([['/index.html','text/html; charset=utf-8'],['/style.css','text/css; charset=utf-8'],['/app.js','text/javascript; charset=utf-8'],['/theme.js','text/javascript; charset=utf-8'],['/plan-time.js','text/javascript; charset=utf-8'],['/couple.js','text/javascript; charset=utf-8'],['/alarm.js','text/javascript; charset=utf-8'],['/sounds/alarm.wav','audio/wav'],['/desktop.js','text/javascript; charset=utf-8'],['/icon.svg','image/svg+xml'],['/fonts/NotoSansArabic.ttf','font/ttf']]);
    protocol.handle('yawmi', async request => {
      const url = new URL(request.url);
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      if (request.method !== 'GET' || url.hostname !== 'app' || url.username || url.password || url.port || !allowedFiles.has(pathname)) return new Response('Forbidden', { status: 403 });
      try { const data = await fs.promises.readFile(path.join(app.getAppPath(), 'dist', pathname.slice(1))); return new Response(data, { headers: { 'Content-Type': allowedFiles.get(pathname), 'Content-Length': String(data.length), 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } }); }
      catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', event => event.preventDefault());
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => callback({ cancel: !details.url.startsWith(ORIGIN + '/') }));
    registerIPC(); createMenu(); await createWindow();
    sharing.start().catch(()=>{});
    powerMonitor.on('resume', () => send('resume'));
  }).catch(error => { dialog.showErrorBox('تعذّر تشغيل يومي', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit',()=>{sharing?.stop().catch(()=>{});});
}
