'use strict';
const { app, BrowserWindow, Menu, protocol, session, ipcMain, dialog, Notification, powerMonitor, nativeTheme, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { MAX_BYTES, parseBackup, atomicWrite, makeStore } = require('./state.cjs');
const locales = require('../dist/locales.js');

const ORIGIN = 'yawmi://app';
const HOME = ORIGIN + '/index.html';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; media-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
const BG = { dark: '#0f1412', light: '#f3f0e8' };
protocol.registerSchemesAsPrivileged([{ scheme: 'yawmi', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.enableSandbox();
app.setName('Yawmi Local');
app.setAppUserModelId('Yawmi.Local.Desktop');

// Own data folder: never touches the original Yawmi (server-linked) app's data.
const qaMode = !app.isPackaged && process.env.YAWMI_QA === '1';
const dataRoot = qaMode ? path.join(app.getPath('temp'), 'Yawmi-Local-QA') : path.join(app.getPath('appData'), 'YawmiLocal');
fs.mkdirSync(dataRoot, { recursive: true });
app.setPath('userData', dataRoot);
app.setPath('sessionData', path.join(dataRoot, 'Chromium'));
const store = makeStore(dataRoot);

let window, currentState, startupWarning, backupBusy = false, lastNotification = 0;
const prefsFile = path.join(dataRoot, 'prefs.json');
const systemLang = () => { const code = String(app.getLocale() || 'en').slice(0, 2).toLowerCase(); return locales.langs.includes(code) ? code : 'en'; };
let prefs = { theme: null, lang: null };
try {
  const saved = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
  if (['light', 'dark'].includes(saved.theme)) prefs.theme = saved.theme;
  if (locales.langs.includes(saved.lang)) prefs.lang = saved.lang;
} catch {}
const lang = () => prefs.lang || systemLang();
const tr = (key, params) => {
  let text = locales.strings[lang()][key] ?? locales.strings.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
  return text;
};
const backgroundColor = () => BG[prefs.theme || (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')];

function trusted(event) {
  return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && [HOME, ORIGIN + '/'].includes(event.senderFrame.url);
}
function ensureTrusted(event) { if (!trusted(event)) throw Object.assign(new Error('forbidden'), { code: 'forbidden' }); }
const codeOf = error => error?.code && typeof error.code === 'string' && /^[a-z_]+$/.test(error.code) ? error.code : 'generic';
function send(command) { if (window && !window.isDestroyed()) window.webContents.send('yawmi:command', command); }

function registerIPC() {
  ipcMain.on('yawmi:load', event => {
    if (!trusted(event)) { event.returnValue = { state: null, warning: 'unreadable', prefs: { theme: null, lang: null } }; return; }
    event.returnValue = { state: currentState, warning: startupWarning, version: app.getVersion(), prefs };
  });
  ipcMain.on('yawmi:save', (event, input) => {
    if (!trusted(event)) { event.returnValue = { ok: false, error: 'forbidden' }; return; }
    try { currentState = store.save(input); event.returnValue = { ok: true }; }
    catch (error) { event.returnValue = { ok: false, error: codeOf(error) }; }
  });
  ipcMain.handle('yawmi:prefs', (event, patch) => {
    ensureTrusted(event);
    try {
      const next = { ...prefs };
      if (patch && 'theme' in patch) { if (!['light', 'dark'].includes(patch.theme)) return { ok: false }; next.theme = patch.theme; }
      if (patch && 'lang' in patch) { if (!locales.langs.includes(patch.lang)) return { ok: false }; next.lang = patch.lang; }
      atomicWrite(prefsFile, JSON.stringify(next));
      prefs = next;
      nativeTheme.themeSource = prefs.theme || 'system';
      window?.setBackgroundColor(backgroundColor());
      window?.setTitle(tr('app.title'));
      createMenu();
      return { ok: true };
    } catch { return { ok: false }; }
  });
  ipcMain.handle('yawmi:export', async event => {
    ensureTrusted(event);
    if (backupBusy) return { canceled: true };
    backupBusy = true;
    try {
      const picked = await dialog.showSaveDialog(window, { title: tr('file.exportTitle'), defaultPath: `Yawmi-Backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: tr('file.filter'), extensions: ['json'] }] });
      if (picked.canceled || !picked.filePath) return { canceled: true };
      const envelope = { format: 'yawmi-backup', version: 1, exportedAt: new Date().toISOString(), state: currentState || { days: {}, timer: null } };
      atomicWrite(picked.filePath, JSON.stringify(envelope, null, 2));
      return { ok: true };
    } catch (error) { return { ok: false, error: codeOf(error) }; }
    finally { backupBusy = false; }
  });
  ipcMain.handle('yawmi:import', async event => {
    ensureTrusted(event);
    if (backupBusy) return { canceled: true };
    backupBusy = true;
    try {
      const picked = await dialog.showOpenDialog(window, { title: tr('file.importTitle'), properties: ['openFile'], filters: [{ name: tr('file.filter'), extensions: ['json'] }] });
      if (picked.canceled || picked.filePaths.length !== 1) return { canceled: true };
      const file = picked.filePaths[0];
      if (fs.statSync(file).size > MAX_BYTES) throw Object.assign(new Error('too_big'), { code: 'too_big' });
      const imported = parseBackup(fs.readFileSync(file, 'utf8'));
      const confirmation = await dialog.showMessageBox(window, { type: 'question', title: tr('imp.title'), message: tr('imp.confirm'), detail: tr('imp.detail'), buttons: [tr('imp.cancel'), tr('imp.ok')], defaultId: 0, cancelId: 0, noLink: true });
      if (confirmation.response !== 1) return { canceled: true };
      if (currentState) atomicWrite(path.join(dataRoot, `before-import-${Date.now()}.json`), JSON.stringify(currentState));
      // A backup is a plan, not permission to run a timer from another computer.
      if (imported.timer) {
        imported.timer.remaining = imported.timer.running ? Math.min(43200, Math.max(0, Math.ceil((imported.timer.deadline - Date.now()) / 1000))) : imported.timer.remaining;
        imported.timer.running = false;
      }
      currentState = store.save(imported);
      return { ok: true, state: currentState };
    } catch (error) { return { ok: false, error: codeOf(error) }; }
    finally { backupBusy = false; }
  });
  ipcMain.handle('yawmi:notify', (event, message) => {
    ensureTrusted(event);
    if (typeof message !== 'string' || message.length > 250 || Date.now() - lastNotification < 5000) return false;
    lastNotification = Date.now();
    if (Notification.isSupported()) {
      const notice = new Notification({ title: tr('notif.title'), body: message, silent: true, icon: path.join(app.getAppPath(), 'assets/icon.png') });
      notice.on('click', () => { if (window?.isMinimized()) window.restore(); window?.show(); window?.focus(); });
      notice.show();
    }
    if (window && !window.isFocused()) window.flashFrame(true);
    if (window) { if (window.isMinimized()) window.restore(); window.show(); }
    return true;
  });
}

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: tr('menu.app'), submenu: [
      { label: tr('m.add'), accelerator: 'CmdOrCtrl+N', click: () => send('add') },
      { label: tr('m.timer'), accelerator: 'CmdOrCtrl+Space', click: () => send('timer') },
      { label: tr('m.today'), accelerator: 'CmdOrCtrl+T', click: () => send('today') },
      { type: 'separator' },
      { label: tr('m.import'), accelerator: 'CmdOrCtrl+O', click: () => send('import') },
      { label: tr('m.export'), accelerator: 'CmdOrCtrl+Shift+S', click: () => send('export') },
      { label: tr('m.settings'), accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
      { type: 'separator' }, { label: tr('m.quit'), accelerator: 'Alt+F4', role: 'close' }
    ] },
    { label: tr('menu.edit'), submenu: [{ label: tr('m.undo'), role: 'undo' }, { label: tr('m.redo'), role: 'redo' }, { type: 'separator' }, { label: tr('m.cut'), role: 'cut' }, { label: tr('m.copy'), role: 'copy' }, { label: tr('m.paste'), role: 'paste' }, { label: tr('m.selectAll'), role: 'selectAll' }] },
    { label: tr('menu.view'), submenu: [{ label: tr('m.zoomIn'), role: 'zoomIn' }, { label: tr('m.zoomOut'), role: 'zoomOut' }, { label: tr('m.zoomReset'), role: 'resetZoom' }, { type: 'separator' }, { label: tr('m.fullscreen'), role: 'togglefullscreen' }, { label: tr('m.minimize'), role: 'minimize' }] },
    { label: tr('menu.help'), submenu: [{ label: tr('m.shortcuts'), click: () => send('shortcuts') }, { label: tr('m.about'), click: () => dialog.showMessageBox(window, { type: 'info', title: tr('m.about'), message: tr('about.msg', { version: app.getVersion() }), detail: tr('about.detail') }) }] }
  ]));
}

async function createWindow() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(path.join(dataRoot, 'window.json'), 'utf8')); } catch {}
  const appIcon = nativeImage.createFromBuffer(fs.readFileSync(path.join(app.getAppPath(), 'assets/icon.png')));
  window = new BrowserWindow({
    width: Number.isInteger(saved.width) ? Math.max(900, Math.min(2400, saved.width)) : 1360,
    height: Number.isInteger(saved.height) ? Math.max(650, Math.min(1600, saved.height)) : 940,
    minWidth: 900, minHeight: 650,
    show: false, title: tr('app.title'), backgroundColor: backgroundColor(),
    icon: appIcon, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, devTools: !app.isPackaged, spellcheck: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  window.setIcon(appIcon);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (qaMode) window.webContents.on('console-message', details => console.log('[QA renderer]', details.message));
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
  window.webContents.on('render-process-gone', (_event, details) => { if (details.reason !== 'clean-exit') dialog.showErrorBox(tr('notif.title'), tr('crash.msg')); });
  window.once('ready-to-show', () => { if (saved.maximized) window.maximize(); window.show(); });
  await window.loadURL(HOME);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    nativeTheme.themeSource = prefs.theme || 'system';
    const loaded = store.load(); currentState = loaded.state; startupWarning = loaded.warning;
    const allowedFiles = new Map([
      ['/index.html', 'text/html; charset=utf-8'], ['/style.css', 'text/css; charset=utf-8'],
      ['/locales.js', 'text/javascript; charset=utf-8'], ['/i18n.js', 'text/javascript; charset=utf-8'],
      ['/plan-time.js', 'text/javascript; charset=utf-8'], ['/alarm.js', 'text/javascript; charset=utf-8'], ['/app.js', 'text/javascript; charset=utf-8'],
      ['/sounds/alarm.wav', 'audio/wav'], ['/icon.svg', 'image/svg+xml'], ['/fonts/NotoSansArabic.ttf', 'font/ttf']
    ]);
    protocol.handle('yawmi', async request => {
      const url = new URL(request.url);
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      if (request.method !== 'GET' || url.hostname !== 'app' || url.username || url.password || url.port || !allowedFiles.has(pathname)) return new Response('Forbidden', { status: 403 });
      try {
        const data = await fs.promises.readFile(path.join(app.getAppPath(), 'dist', pathname.slice(1)));
        return new Response(data, { headers: { 'Content-Type': allowedFiles.get(pathname), 'Content-Length': String(data.length), 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    // Strictly offline: every request that is not the local app protocol is cancelled.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', event => event.preventDefault());
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => callback({ cancel: !details.url.startsWith(ORIGIN + '/') }));
    registerIPC(); createMenu(); await createWindow();
    powerMonitor.on('resume', () => send('resume'));
  }).catch(error => { dialog.showErrorBox(tr('startup.fail'), String(error.message)); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
