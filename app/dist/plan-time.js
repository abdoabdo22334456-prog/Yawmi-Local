'use strict';
// Pure scheduling maths — no DOM, no locale. Formatting lives in i18n.js.
(() => {
  function timeline(day, date) {
    const [hour, minute] = (day.start || '09:00').split(':').map(Number);
    let next = hour * 60 + minute, blocked = false;
    const midnight = new Date(date + 'T00:00:00');
    const localMinutes = timestamp => {
      const actual = new Date(timestamp);
      const days = Math.round((Date.UTC(actual.getFullYear(), actual.getMonth(), actual.getDate()) - Date.UTC(midnight.getFullYear(), midnight.getMonth(), midnight.getDate())) / 86400000);
      return days * 1440 + actual.getHours() * 60 + actual.getMinutes();
    };
    return (day.items || []).map(item => {
      if (Number.isFinite(item.actualStart) && item.actualStart > 0) { blocked = false; next = localMinutes(item.actualStart); }
      const start = blocked ? null : next;
      if (item.minutes === 0) {
        if (item.done && !item.actualStart) return { item, start, end: next };
        if (item.actualEnd && item.actualStart) { next = localMinutes(item.actualEnd); return { item, start, end: next }; }
        blocked = true; return { item, start, end: null };
      }
      next += item.minutes;
      return { item, start, end: blocked ? null : next };
    });
  }
  function totals(day, now = Date.now()) {
    const result = { activitySeconds: 0, breakSeconds: 0 };
    for (const item of day.items || []) {
      let seconds = item.minutes * 60;
      if (item.minutes === 0) {
        const end = item.done ? item.actualEnd : now;
        seconds = item.actualStart && end ? Math.max(0, Math.floor((end - item.actualStart) / 1000)) : 0;
      }
      result[item.kind === 'break' ? 'breakSeconds' : 'activitySeconds'] += seconds;
    }
    return result;
  }
  const api = { timeline, totals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.yawmiTime = Object.freeze(api);
})();
