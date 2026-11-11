'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strings, langs, meta } = require('../dist/locales.js');

const params = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

test('every language has exactly the same keys', () => {
  const base = Object.keys(strings.en).sort();
  for (const lang of langs) assert.deepEqual(Object.keys(strings[lang]).sort(), base, `${lang} keys differ from en`);
});
test('placeholders match across languages', () => {
  for (const key of Object.keys(strings.en)) {
    for (const lang of langs) assert.deepEqual(params(strings[lang][key]), params(strings.en[key]), `${lang}:${key}`);
  }
});
test('no empty strings and every language declares direction', () => {
  for (const lang of langs) {
    assert.ok(['rtl', 'ltr'].includes(meta[lang].dir));
    for (const [k, v] of Object.entries(strings[lang])) assert.ok(v.trim().length > 0, `${lang}:${k}`);
  }
  assert.equal(meta.ar.dir, 'rtl');
});
