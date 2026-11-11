'use strict';
const { createHash, randomInt } = require('node:crypto');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function pairingCode() {
  return Array.from({ length: 24 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}
function displayCode(code) { return 'YW-' + code.match(/.{4}/g).join('-'); }
function planDay(day) {
  return day ? { start: day.start, breakMinutes: day.breakMinutes, items: day.items } : null;
}
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
// Produces events from validated local state. A countdown save or pause/resume is
// not a schedule edit. The first state after startup is a baseline, not an event.
function changes(previous, next) {
  if (!previous || !next) return [];
  const events = [];
  const dates = new Set([...Object.keys(previous.days), ...Object.keys(next.days)]);
  for (const date of dates) {
    const before = planDay(previous.days[date]), after = planDay(next.days[date]);
    if (fingerprint(before) === fingerprint(after)) continue;
    events.push({ type: 'schedule', date, title: 'الجدول اتحدّث', body: `في تعديل في خطة ${date}. افتح يومي عشان تشوفه.` });
    for (const item of after?.items || []) {
      const oldItem = before?.items.find(old => old.id === item.id);
      if(item.minutes===0&&item.actualStart&&!oldItem?.actualStart&&!item.done)events.push({type:'start',date,itemId:item.id,title:'نشاط مفتوح بدأ',body:item.name});
      if (item.done && oldItem && !oldItem.done) events.push({ type: 'finish', date, itemId: item.id, title: item.kind === 'break' ? 'البريك خلص' : 'النشاط خلص', body: item.name });
    }
  }
  const timer = next.timer, oldTimer = previous.timer;
  if (timer?.running && (!oldTimer || oldTimer.date !== timer.date || oldTimer.id !== timer.id)) {
    const item = next.days[timer.date]?.items.find(value => value.id === timer.id);
    if (item) events.push({ type: 'start', date: timer.date, itemId: item.id, title: item.kind === 'break' ? 'البريك بدأ' : 'النشاط بدأ', body: item.name });
  }
  return events;
}
function nudgeEligible(nudge, activeViewer, now = Date.now()) {
  return Boolean(activeViewer && nudge && nudge.status === 'pending' && typeof nudge.senderUid === 'string' && Number.isFinite(nudge.createdAt) && Number.isFinite(nudge.expiresAt) && nudge.createdAt <= now + 5000 && nudge.createdAt >= now - 180000 && nudge.expiresAt > now && nudge.expiresAt <= nudge.createdAt + 180000);
}
module.exports = { pairingCode, displayCode, changes, nudgeEligible };
