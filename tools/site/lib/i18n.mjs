// Translations: site-src/i18n/<code>.json holds flat dotted keys ("nav.airports"). A missing key falls back to English and is
// listed once in the build log, so a translator sees what is left. Values may contain {name} placeholders.
import fs from 'node:fs';
import path from 'node:path';

export function loadDictionaries(srcDir, languages) {
  const dicts = {};
  const dir = path.join(srcDir, 'i18n');
  for (const lang of languages) {
    const file = path.join(dir, `${lang.code}.json`);
    dicts[lang.code] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }
  return dicts;
}

export function makeT(dicts, missing = new Set()) {
  return function t(lang, key, vars = {}) {
    const own = dicts[lang] || {};
    let text = own[key];
    if (text === undefined) {
      missing.add(`${lang}:${key}`);
      text = (dicts.en || {})[key];
    }
    if (text === undefined) throw new Error(`i18n: no English text for "${key}"`);
    return text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined ? `{${name}}` : String(vars[name])));
  };
}
