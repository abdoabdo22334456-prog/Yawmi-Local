'use strict';
const fs = require('node:fs');
const path = require('node:path');
const MAX_BYTES = 5 * 1024 * 1024;
const kinds = new Set(['focus', 'personal', 'movement', 'break']);
const dateKey = /^\d{4}-\d{2}-\d{2}$/;
// Errors carry a stable code; the renderer translates it (see locales.js "err.*").
const fail = code => Object.assign(new Error(code), { code });
function validDate(value) {
  if (typeof value !== 'string' || !dateKey.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function validateState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.days || typeof input.days !== 'object' || Array.isArray(input.days)) throw fail('invalid_plan');
  if (Object.keys(input.days).length > 3660) throw fail('days_limit');
  const output = { days: {}, timer: null };
  for (const [date, value] of Object.entries(input.days)) {
    if (!validDate(date) || !value || !Array.isArray(value.items) || value.items.length > 1000 || typeof value.start !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.start) || !integer(value.breakMinutes, 1, 120)) throw fail('bad_day');
    const ids = new Set();
    const items = value.items.map(item => {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100 || !kinds.has(item.kind) || !integer(item.minutes, 0, 720) || typeof item.done !== 'boolean') throw fail('bad_activity');
      ids.add(item.id);
      const clean = { id: item.id, name: item.name.trim(), kind: item.kind, minutes: item.minutes, done: item.done };
      if (item.actualStart != null) { if (!integer(item.actualStart, 946684800000, 4102444800000)) throw fail('bad_time'); clean.actualStart = item.actualStart; }
      if (item.actualEnd != null) { if (item.minutes !== 0 || !item.done || !clean.actualStart || !integer(item.actualEnd, clean.actualStart, 4102444800000)) throw fail('bad_time'); clean.actualEnd = item.actualEnd; }
      return clean;
    });
    output.days[date] = { start: value.start, breakMinutes: value.breakMinutes, sample: value.sample === true, items };
  }
  if (input.timer != null) {
    const tm = input.timer;
    const item = output.days[tm.date]?.items.find(i => i.id === tm.id && !i.done);
    if (!validDate(tm.date) || !item || item.minutes === 0 || typeof tm.running !== 'boolean' || !integer(tm.remaining, 0, 43200) || !Number.isFinite(tm.deadline) || tm.deadline < 0 || tm.deadline > Date.now() + 43380000) throw fail('bad_timer');
    output.timer = { date: tm.date, id: tm.id, remaining: tm.remaining, deadline: tm.deadline, running: tm.running };
  }
  if (Buffer.byteLength(JSON.stringify(output)) > MAX_BYTES) throw fail('too_big');
  return output;
}
function parseBackup(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw fail('too_big');
  let parsed;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw fail('json'); }
  if (!parsed || typeof parsed !== 'object') throw fail('invalid_plan');
  if (parsed.format === 'yawmi-backup' && parsed.version !== 1) throw fail('version');
  return validateState(parsed.format === 'yawmi-backup' ? parsed.state : parsed);
}
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, data, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
// Warning codes map to locales "warn.*".
function makeStore(root) {
  const file = path.join(root, 'plan.json');
  return {
    file,
    load() {
      if (!fs.existsSync(file)) return { state: null, warning: null };
      try {
        if (fs.statSync(file).size > MAX_BYTES) throw fail('too_big');
        return { state: parseBackup(fs.readFileSync(file, 'utf8')), warning: null };
      } catch {
        const preserved = path.join(root, `plan-recovery-${Date.now()}.json`);
        fs.copyFileSync(file, preserved);
        try { return { state: parseBackup(fs.readFileSync(file + '.previous', 'utf8')), warning: 'recovered' }; }
        catch { return { state: null, warning: 'unreadable' }; }
      }
    },
    save(input) {
      const state = validateState(input);
      if (fs.existsSync(file)) fs.copyFileSync(file, file + '.previous');
      atomicWrite(file, JSON.stringify(state));
      return state;
    }
  };
}
module.exports = { MAX_BYTES, validDate, validateState, parseBackup, atomicWrite, makeStore };
