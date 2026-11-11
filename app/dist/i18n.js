'use strict';
(() => {
  const L = window.yawmiLocales;
  let lang = 'en';
  const detect = (tag = navigator.language || 'en') => {
    const code = String(tag).slice(0, 2).toLowerCase();
    return L.langs.includes(code) ? code : 'en';
  };
  const bcp = () => L.meta[lang].bcp;
  const t = (key, params) => {
    let text = L.strings[lang][key] ?? L.strings.en[key] ?? key;
    if (params) for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
    return text;
  };
  const unit = (value, name, display = 'short') =>
    new Intl.NumberFormat(bcp(), { style: 'unit', unit: name, unitDisplay: display, maximumFractionDigits: 0 }).format(value);
  const num = value => Number(value).toLocaleString(bcp());
  const join = parts => parts.filter(Boolean).join(' ');
  // Planned duration: "45 minutes" · "1 h 30 min" · open-ended items get a label.
  function dur(minutes) {
    if (minutes === 0) return t('dur.open');
    if (minutes < 60) return unit(minutes, 'minute', 'long');
    return join([unit(Math.floor(minutes / 60), 'hour'), minutes % 60 ? unit(minutes % 60, 'minute') : '']);
  }
  // Elapsed / total time from seconds: "1 h 5 min 3 s".
  function seconds(total, zeroAsMinutes = false) {
    total = Math.max(0, Math.floor(total));
    if (total === 0) return zeroAsMinutes ? unit(0, 'minute') : unit(0, 'second');
    const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
    return join([h ? unit(h, 'hour') : '', m ? unit(m, 'minute') : '', s ? unit(s, 'second') : '']);
  }
  // Minutes from midnight (may exceed 1440) → localized clock text.
  function clock(minutes) {
    const offset = Math.floor(minutes / 1440), within = ((Math.floor(minutes) % 1440) + 1440) % 1440;
    const text = new Intl.DateTimeFormat(bcp(), { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Math.floor(within / 60), within % 60));
    return offset ? `${text} (${offset > 0 ? '+' : '−'}${unit(Math.abs(offset), 'day')})` : text;
  }
  const dateLabel = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(bcp(), { weekday: 'long', day: 'numeric', month: 'long' });
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { const v = t(el.dataset.i18nTitle); el.title = v; el.setAttribute('aria-label', v); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  }
  function setLang(next) {
    lang = L.langs.includes(next) ? next : 'en';
    const { dir } = L.meta[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = t('app.title');
    apply();
    return lang;
  }
  window.yawmiI18n = Object.freeze({ t, dur, seconds, clock, num, dateLabel, apply, setLang, detect, get lang() { return lang; }, meta: L.meta, langs: L.langs });
})();
