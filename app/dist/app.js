'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const I = window.yawmiI18n, T = window.yawmiTime, t = I.t;
  const bridge = window.yawmiDesktop || null;           // present in the desktop app, absent in a plain browser preview
  const STATE_KEY = 'yawmi.local.state.v1', PREFS_KEY = 'yawmi.local.prefs.v1';
  const KINDS = ['focus', 'personal', 'movement', 'break'];
  const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateKey(new Date());
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const readLocal = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };

  let state = { days: {}, timer: null }, prefs = { theme: null, lang: null };
  let selectedDate = today(), filter = 'all', editing = null, toastTimeout, pendingConfirm, selectedId = null, storageOkay = true;

  try {
    const saved = bridge ? bridge.initialState : readLocal(STATE_KEY);
    if (saved && saved.days && typeof saved.days === 'object') state = structuredClone(saved);
    prefs = { ...prefs, ...(bridge ? bridge.prefs : readLocal(PREFS_KEY)) };
  } catch { storageOkay = false; }

  /* ---------- helpers ---------- */
  const day = () => {
    const existing = state.days[selectedDate];
    if (!existing || !Array.isArray(existing.items)) state.days[selectedDate] = { start: '09:00', breakMinutes: 10, items: [], sample: false };
    return state.days[selectedDate];
  };
  const startMinutes = () => { const [h, m] = day().start.split(':').map(Number); return h * 60 + m; };
  const errorText = code => { const key = `err.${code}`; const text = t(key); return text === key ? t('err.generic') : text; };
  const toast = message => { const el = $('toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('visible'), 4500); };
  const percent = n => new Intl.NumberFormat(I.meta[I.lang].bcp, { style: 'percent', maximumFractionDigits: 0 }).format(n / 100);

  function save() {
    try {
      if (bridge) { const r = bridge.saveState(state); storageOkay = r.ok; }
      else { localStorage.setItem(STATE_KEY, JSON.stringify(state)); storageOkay = true; }
    } catch { storageOkay = false; }
    paintSave();
  }
  function paintSave() {
    $('save-status').classList.toggle('bad', !storageOkay);
    $('save-text').textContent = t(storageOkay ? 'save.ok' : 'save.fail');
  }
  function savePrefs(patch) {
    prefs = { ...prefs, ...patch };
    if (bridge) return bridge.setPrefs(patch);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
    return Promise.resolve({ ok: true });
  }
  const activityRecord = item => {
    if (item.minutes !== 0) return '';
    if (item.done) return item.actualStart && item.actualEnd ? I.seconds((item.actualEnd - item.actualStart) / 1000) : t('time.done');
    return item.actualStart ? t('time.now') : t('dur.open');
  };

  /* ---------- selection of what the timer shows ---------- */
  function getFocus() {
    const active = state.timer?.date === selectedDate ? day().items.find(i => i.id === state.timer.id && !i.done) : null;
    return active || day().items.find(i => i.minutes === 0 && i.actualStart && !i.done) || day().items.find(i => i.id === selectedId && !i.done) || day().items.find(i => !i.done);
  }
  const remaining = tm => tm.running ? Math.max(0, Math.ceil((tm.deadline - Date.now()) / 1000)) : tm.remaining;

  /* ---------- rendering ---------- */
  function render() {
    const d = day(), items = d.items;
    $('day-date').value = selectedDate;
    $('date-label').textContent = I.dateLabel(selectedDate);
    $('today-button').hidden = selectedDate === today();
    const tasks = items.filter(i => i.kind !== 'break'), complete = tasks.filter(i => i.done).length;
    renderTotals();
    $('done-total').textContent = t('doneOf', { done: I.num(complete), total: I.num(tasks.length) });
    const progress = tasks.length ? Math.round(complete / tasks.length * 100) : 0;
    $('progress-label').textContent = percent(progress);
    $('progress-fill').style.width = `${progress}%`;
    $('progress-bar').setAttribute('aria-valuenow', String(progress));
    $('item-count').textContent = I.num(items.length);
    $('start-time-button').textContent = I.clock(startMinutes());
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('selected', b.dataset.filter === filter));

    let minute = startMinutes();
    const focus = getFocus();
    const rows = T.timeline(d, selectedDate).map(({ item, start, end }, index) => {
      minute = end;
      if (filter === 'task' && item.kind === 'break' || filter === 'break' && item.kind !== 'break') return '';
      const isOpen = item.minutes === 0;
      const top = isOpen && !item.actualStart ? '—' : start === null ? t('time.afterOpen') : I.clock(start);
      const bottom = isOpen ? (item.actualEnd ? I.clock(end) : item.actualStart && !item.done ? t('time.now') : '—') : end === null ? t('time.openEnd') : I.clock(end);
      const name = esc(item.name);
      const live = isOpen && !item.done && item.actualStart;
      return `<article class="row k-${item.kind}${item.done ? ' done' : ''}${focus?.id === item.id ? ' active' : ''}" data-id="${esc(item.id)}">
        <div class="row-time"><b>${esc(top)}</b><span>${esc(bottom)}</span></div>
        <div class="row-card">
          <button class="check" data-action="done" aria-pressed="${item.done}" aria-label="${esc(t(item.done ? 'row.uncomplete' : 'row.complete', { name: item.name }))}">${ic('check')}</button>
          <div class="row-info"><h3>${name}</h3><div class="row-meta"><span class="tag">${esc(t('kind.' + item.kind))}</span><span class="dur${live ? ' live' : ''}">${ic('clock')}${esc(isOpen ? activityRecord(item) : I.dur(item.minutes))}</span></div></div>
          <div class="row-actions">
            ${item.done ? '' : `<button class="round play" data-action="select" title="${esc(t('tip.select'))}" aria-label="${esc(t('row.select', { name: item.name }))}">${ic('play')}</button>`}
            <div class="row-tools">
              <button class="tool" data-action="edit" title="${esc(t('tip.edit'))}" aria-label="${esc(t('row.edit', { name: item.name }))}">${ic('edit')}</button>
              <button class="tool" data-action="delete" title="${esc(t('tip.delete'))}" aria-label="${esc(t('row.delete', { name: item.name }))}">${ic('trash')}</button>
              <button class="tool" data-action="up" ${index === 0 ? 'disabled' : ''} title="${esc(t('tip.up'))}" aria-label="${esc(t('row.up', { name: item.name }))}">${ic('up')}</button>
              <button class="tool" data-action="down" ${index === items.length - 1 ? 'disabled' : ''} title="${esc(t('tip.down'))}" aria-label="${esc(t('row.down', { name: item.name }))}">${ic('down')}</button>
            </div>
          </div>
        </div>
      </article>`;
    }).join('');
    const empty = items.length
      ? `<div class="empty"><h3>${esc(t('empty.filtered.title'))}</h3><p>${esc(t('empty.filtered.body'))}</p></div>`
      : `<div class="empty"><span class="empty-art">${ic('leaf')}</span><h3>${esc(t('empty.title'))}</h3><p>${esc(t('empty.body'))}</p><div class="empty-actions"><button class="primary" data-empty="add">${ic('plus')}${esc(t('empty.add'))}</button><button class="secondary" data-empty="sample">${esc(t('empty.sample'))}</button></div></div>`;
    $('schedule-list').innerHTML = (d.sample ? `<div class="sample-note">${esc(t('sample.note'))}</div>` : '') + (rows || empty);
    $('end-time-label').textContent = items.length && minute === null ? t('sched.endOpen')
      : items.length ? t('sched.end', { time: I.clock(minute) }) + (minute >= 1440 ? ' · ' + t('sched.endNext') : '')
      : t('sched.endEmpty');
    renderTimer();
  }
  function renderTotals() {
    const totals = T.totals(day());
    $('activity-total').textContent = I.seconds(totals.activitySeconds, true);
    $('break-total').textContent = I.seconds(totals.breakSeconds, true);
  }
  const mmss = sec => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
  function renderTimer() {
    const focus = getFocus(), tm = state.timer, matching = !!focus && tm?.date === selectedDate && tm.id === focus.id;
    const open = focus?.minutes === 0, openRunning = !!(open && focus.actualStart && !focus.done);
    const sec = openRunning ? Math.max(0, Math.floor((Date.now() - focus.actualStart) / 1000)) : matching ? remaining(tm) : (focus ? focus.minutes * 60 : 0);
    const running = matching && tm.running;
    $('focus-title').textContent = focus ? focus.name : day().items.length ? t('timer.doneTitle') : t('timer.idleTitle');
    $('focus-category').textContent = focus ? `${t('kind.' + focus.kind)} · ${I.dur(focus.minutes)}` : t('timer.noneCat');
    $('focus-caption').textContent = running || openRunning ? t('timer.current') : t('timer.next');
    $('timer-state').textContent = open ? (openRunning ? t('time.now') : t('timer.open')) : matching ? (running ? t(focus.kind === 'break' ? 'timer.resting' : 'timer.focusing') : t('timer.paused')) : t('timer.ready');
    $('timer-state').classList.toggle('live', running || openRunning);
    $('timer-display').textContent = mmss(sec);
    $('timer-subtitle').textContent = focus?.kind === 'break' ? t('timer.subBreak') : t('timer.sub');
    $('timer-arc').style.strokeDashoffset = String(615.75 * (1 - (open ? 1 : focus ? Math.min(1, sec / (focus.minutes * 60)) : 1)));
    const label = open ? (openRunning ? ['check', 'timer.openBtn'] : ['play', 'timer.startOpen'])
      : running ? ['pause', 'timer.pause'] : matching ? ['play', 'timer.resume'] : ['play', focus?.kind === 'break' ? 'timer.startBreak' : 'timer.start'];
    $('timer-toggle').innerHTML = `${ic(label[0])}<span>${esc(t(label[1]))}</span>`;
    ['timer-toggle', 'extend-button', 'finish-button'].forEach(id => { $(id).disabled = !focus; });
    $('timer-toggle').disabled = !focus || openRunning;
    $('extend-button').disabled = !focus || open;
    if (tm && tm.date !== selectedDate) $('timer-state').textContent = tm.running ? t('timer.otherDay') : t('timer.otherDayPaused');
  }

  /* ---------- confirm / dialogs ---------- */
  function showConfirm(title, message, action, yes = t('btn.continue')) {
    $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-yes').textContent = yes;
    pendingConfirm = action; $('confirm-dialog').showModal();
  }
  function askSwitch(action) {
    if (state.timer) showConfirm(t('confirm.switch.title'), t('confirm.switch.msg'), () => { state.timer = null; action(); save(); render(); });
    else action();
  }
  function openActivity(item = null, kind = null) {
    editing = item?.id || null;
    $('form-title').textContent = item ? t('dlg.edit') : kind === 'break' ? t('dlg.break') : t('dlg.add');
    $('activity-name').value = item?.name || (kind === 'break' ? t('break.name') : '');
    $('activity-open').checked = item?.minutes === 0;
    $('activity-duration').disabled = $('activity-open').checked;
    $('activity-duration').value = item?.minutes || (kind === 'break' ? day().breakMinutes : 45);
    $('activity-kind').value = item?.kind || kind || 'focus';
    $('with-break').checked = !item && kind !== 'break';
    $('with-break-row').hidden = !!item || kind === 'break';
    $('with-break-text').textContent = t('form.withBreak', { dur: I.dur(day().breakMinutes) });
    $('save-activity').textContent = item ? t('btn.saveEdit') : t('btn.addToDay');
    $('activity-dialog').showModal(); $('activity-name').focus();
  }
  function finish(id, notify = false) {
    const date = state.timer?.id === id ? state.timer.date : selectedDate;
    const item = state.days[date]?.items.find(i => i.id === id);
    if (!item) return;
    if (item.minutes === 0 && item.actualStart) item.actualEnd = Math.max(item.actualStart, Date.now());
    item.done = true;
    if (state.timer?.id === id) state.timer = null;
    selectedId = null; save(); render();
    const message = item.kind === 'break' ? t('toast.breakUp') : t('toast.timeUp', { name: item.name });
    toast(notify ? message : t('toast.done'));
    if (notify) {
      if (bridge) bridge.notify(message).catch(() => {});
      window.yawmiAlarm.start(message);
    }
  }
  function tick() {
    renderTotals();
    if (state.timer?.running && remaining(state.timer) === 0) finish(state.timer.id, true); else renderTimer();
  }
  function chooseDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return; selectedDate = value; selectedId = null; filter = 'all'; render(); }
  function shiftDate(offset) { const d = new Date(`${selectedDate}T12:00:00`); d.setDate(d.getDate() + offset); chooseDate(dateKey(d)); }

  /* ---------- language + theme ---------- */
  function paintLangSwitch() {
    $('lang-switch').innerHTML = I.langs.map(code => `<button type="button" data-lang="${code}" class="${code === I.lang ? 'selected' : ''}" lang="${code}" title="${esc(I.meta[code].name)}" aria-label="${esc(I.meta[code].name)}" aria-pressed="${code === I.lang}">${esc(I.meta[code].short)}</button>`).join('');
  }
  // Default names (sample plan, auto breaks) follow the language unless the user renamed them.
  const AUTO = { 'sample-1': 'sample.1', 'sample-2': 'sample.2', 'sample-3': 'sample.3', 'sample-4': 'sample.4', 'auto-break': 'break.name' };
  const autoKey = item => { const m = /^(sample-[1-4]|auto-break)-/.exec(item.id); return m ? AUTO[m[1]] : null; };
  function relocalize(from, to) {
    const S = window.yawmiLocales.strings; let changed = false;
    for (const d of Object.values(state.days)) for (const item of d.items) {
      const key = autoKey(item);
      if (key && item.name === S[from][key]) { item.name = S[to][key]; changed = true; }
    }
    if (changed) save();
  }
  function applyLanguage(code) {
    const previous = I.lang;
    I.setLang(code);
    if (previous !== code) relocalize(previous, code);
    KINDS.forEach((k, i) => { $('activity-kind').options[i].textContent = t('kind.' + k); });
    paintLangSwitch(); paintTheme(); paintSave(); render();
    if (!$('alarm-dialog').open) $('alarm-hint').textContent = t('alarm.hint');
  }
  const currentTheme = () => prefs.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function paintTheme() {
    const theme = currentTheme(); document.documentElement.dataset.theme = theme;
    const b = $('theme-button'); b.innerHTML = ic(theme === 'dark' ? 'sun' : 'moon');
    const label = t(theme === 'dark' ? 'tip.toLight' : 'tip.toDark'); b.title = label; b.setAttribute('aria-label', label);
  }
  $('lang-switch').addEventListener('click', e => {
    const b = e.target.closest('[data-lang]'); if (!b || b.dataset.lang === I.lang) return;
    savePrefs({ lang: b.dataset.lang }); applyLanguage(b.dataset.lang);
  });
  $('theme-button').onclick = async () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    try { const r = await savePrefs({ theme: next }); if (r && r.ok === false) throw 0; paintTheme(); } catch { prefs.theme = null; toast(t('toast.themeFail')); }
  };

  /* ---------- events ---------- */
  $('activity-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('activity-name').value.trim(), minutes = $('activity-open').checked ? 0 : Number($('activity-duration').value), kind = $('activity-kind').value;
    if (!name) { $('activity-name').setCustomValidity(t('val.name')); $('activity-name').reportValidity(); return; }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 720) { $('activity-duration').setCustomValidity(t('val.minutes')); $('activity-duration').reportValidity(); return; }
    const apply = () => {
      const existing = day().items.find(i => i.id === editing);
      if (existing) { Object.assign(existing, { name, minutes, kind }); delete existing.actualStart; delete existing.actualEnd; }
      else {
        day().items.push({ id: kind === 'break' && name === t('break.name') ? `auto-break-${uid()}` : uid(), name, minutes, kind, done: false });
        if ($('with-break').checked && kind !== 'break') day().items.push({ id: `auto-break-${uid()}`, name: t('break.name'), minutes: day().breakMinutes, kind: 'break', done: false });
      }
      save(); render(); $('activity-dialog').close(); toast(existing ? t('toast.edited') : t('toast.added'));
    };
    if (editing && state.timer?.id === editing) askSwitch(apply); else apply();
  });
  ['activity-name', 'activity-duration'].forEach(id => $(id).addEventListener('input', () => $(id).setCustomValidity('')));
  $('activity-kind').addEventListener('change', () => { const isBreak = $('activity-kind').value === 'break'; $('with-break-row').hidden = !!editing || isBreak; if (isBreak) $('with-break').checked = false; });
  $('activity-open').onchange = () => { $('activity-duration').disabled = $('activity-open').checked; if ($('activity-open').checked) $('with-break').checked = false; };
  $('add-button').onclick = () => openActivity();
  $('quick-break').onclick = $('sidebar-break').onclick = () => openActivity(null, 'break');

  $('schedule-list').addEventListener('click', e => {
    const empty = e.target.closest('[data-empty]');
    if (empty) {
      if (empty.dataset.empty === 'add') openActivity();
      else {
        day().items = [['sample.1', 45, 'focus'], ['sample.2', 10, 'break'], ['sample.3', 20, 'movement'], ['sample.4', 30, 'personal']].map(([key, minutes, kind], n) => ({ id: `sample-${n + 1}-${uid()}`, name: t(key), minutes, kind, done: false }));
        day().sample = true; save(); render();
      }
      return;
    }
    const button = e.target.closest('[data-action]'), row = e.target.closest('[data-id]');
    if (!button || !row) return;
    const item = day().items.find(i => i.id === row.dataset.id); if (!item) return;
    switch (button.dataset.action) {
      case 'edit': openActivity(item); break;
      case 'delete': showConfirm(t('confirm.delete.title'), t('confirm.delete.msg', { name: item.name }), () => { day().items = day().items.filter(i => i.id !== item.id); if (state.timer?.id === item.id) state.timer = null; save(); render(); toast(t('toast.deleted')); }, t('btn.delete')); break;
      case 'select': { const choose = () => { selectedId = item.id; render(); toast(t('toast.picked')); }; if (state.timer && (state.timer.id !== item.id || state.timer.date !== selectedDate)) askSwitch(choose); else choose(); break; }
      case 'done':
        if (item.minutes === 0 && item.actualStart) { if (!item.done) item.actualEnd = Math.max(item.actualStart, Date.now()); else { delete item.actualStart; delete item.actualEnd; } }
        item.done = !item.done; if (state.timer?.id === item.id) state.timer = null; save(); render(); break;
      case 'up': case 'down': {
        const index = day().items.indexOf(item), target = index + (button.dataset.action === 'up' ? -1 : 1);
        if (target >= 0 && target < day().items.length) { [day().items[index], day().items[target]] = [day().items[target], day().items[index]]; save(); render(); }
        break;
      }
    }
  });

  $('timer-toggle').onclick = () => {
    const item = getFocus(); if (!item) return;
    if (selectedDate !== today()) { toast(t('toast.openToday')); return; }
    const apply = () => {
      for (const d of Object.values(state.days)) for (const old of d.items) if (old.id !== item.id && old.minutes === 0 && old.actualStart && !old.done) { old.done = true; old.actualEnd = Math.max(old.actualStart, Date.now()); }
      if (item.minutes === 0) { item.actualStart = Date.now(); delete item.actualEnd; state.timer = null; save(); render(); return; }
      if (state.timer?.id === item.id && state.timer.date === selectedDate) {
        if (state.timer.running) { state.timer.remaining = remaining(state.timer); state.timer.running = false; }
        else { state.timer.deadline = Date.now() + state.timer.remaining * 1000; state.timer.running = true; }
      } else {
        item.actualStart = Date.now();
        state.timer = { id: item.id, date: selectedDate, remaining: item.minutes * 60, deadline: Date.now() + item.minutes * 60000, running: true };
      }
      save(); render();
    };
    if (state.timer && (state.timer.id !== item.id || state.timer.date !== selectedDate)) askSwitch(apply); else apply();
  };
  $('extend-button').onclick = () => {
    const item = getFocus(); if (!item) return;
    if (item.minutes > 715) { toast(t('toast.extendMax')); return; }
    item.minutes += 5;
    if (state.timer?.id === item.id && state.timer.date === selectedDate) { if (state.timer.running) state.timer.deadline += 300000; else state.timer.remaining += 300; }
    save(); render(); toast(t('toast.extended'));
  };
  $('finish-button').onclick = () => { const item = getFocus(); if (item) finish(item.id); };
  $('filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) { filter = b.dataset.filter; render(); } });
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => $(b.dataset.close).close(); });
  $('confirm-yes').onclick = () => { const action = pendingConfirm; pendingConfirm = null; $('confirm-dialog').close(); action?.(); };
  $('day-date').onchange = e => chooseDate(e.target.value);
  $('prev-day').onclick = () => shiftDate(-1); $('next-day').onclick = () => shiftDate(1); $('today-button').onclick = () => chooseDate(today());

  const openSettings = () => {
    $('day-start').value = day().start; $('default-break').value = day().breakMinutes; $('settings-dialog').showModal();
  };
  $('settings-button').onclick = $('start-time-button').onclick = openSettings;
  $('settings-form').onsubmit = e => {
    e.preventDefault();
    const minutes = Number($('default-break').value), start = $('day-start').value;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) return;
    day().start = start; day().breakMinutes = minutes; save(); render(); $('settings-dialog').close(); toast(t('toast.settings'));
  };
  $('clear-day').onclick = () => {
    $('settings-dialog').close();
    showConfirm(t('confirm.clear.title'), t('confirm.clear.msg'), () => { day().items = []; day().sample = false; if (state.timer?.date === selectedDate) state.timer = null; save(); render(); toast(t('toast.cleared')); }, t('btn.clear'));
  };
  $('test-alarm').onclick = () => { $('settings-dialog').close(); window.yawmiAlarm.start(t('alarm.testMsg')); };
  $('shortcuts-button').onclick = () => { if (!document.querySelector('dialog[open]')) $('shortcuts-dialog').showModal(); };

  /* ---------- backup (desktop only) ---------- */
  let busy = false;
  async function backup(action) {
    if (!bridge || busy || document.querySelector('dialog[open]')) return;
    busy = true; $('import-button').disabled = $('export-button').disabled = true;
    try {
      const result = await (action === 'import' ? bridge.importBackup() : bridge.exportBackup());
      if (result.canceled) return;
      if (!result.ok) { toast(errorText(result.error)); return; }
      if (action === 'import') { state = structuredClone(result.state); selectedId = null; filter = 'all'; save(); render(); tick(); toast(t('toast.imported')); }
      else toast(t('toast.backup'));
    } catch { toast(t('toast.fail')); }
    finally { busy = false; $('import-button').disabled = $('export-button').disabled = false; }
  }
  $('import-button').onclick = () => backup('import'); $('export-button').onclick = () => backup('export');
  if (!bridge) { $('import-button').hidden = $('export-button').hidden = true; }
  else {
    document.documentElement.classList.add('desktop-app');
    bridge.onCommand(command => {
      if (command === 'resume') { tick(); return; }
      if (busy || document.querySelector('dialog[open]')) return;
      if (command === 'add') openActivity();
      else if (command === 'timer') $('timer-toggle').click();
      else if (command === 'today') chooseDate(today());
      else if (command === 'settings') openSettings();
      else if (command === 'shortcuts') $('shortcuts-dialog').showModal();
      else if (command === 'import' || command === 'export') backup(command);
    });
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!prefs.theme) paintTheme(); });
  window.addEventListener('storage', e => {
    if (bridge || e.key !== STATE_KEY) return;
    try { const other = JSON.parse(e.newValue); if (other?.days) { state = other; render(); } } catch {}
  });

  applyLanguage(prefs.lang || I.detect());
  save(); tick(); setInterval(tick, 1000);
  if (bridge?.startupWarning) toast(t('warn.' + bridge.startupWarning));
})();
