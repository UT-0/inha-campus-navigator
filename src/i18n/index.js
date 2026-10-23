/**
 * Internationalisation helpers.
 *
 * Every visible string lives in en.js / ko.js under a flat dotted key.
 * `t(key, params)` looks the key up in the current language (falling back
 * to English) and replaces `{name}` placeholders with values from `params`.
 * `localize(obj)` picks the right language from bilingual data objects such
 * as `{ en: "Central Library", ko: "중앙도서관" }` in campus.json.
 */
import en from './en.js';
import ko from './ko.js';

/** Supported languages, in display order. */
export const LANGUAGES = ['en', 'ko'];

const dictionaries = { en, ko };
const STORAGE_KEY = 'icn.lang';
const warned = new Set();

let current = 'en';

/**
 * Translates `key` for a specific language.
 * @param {'en'|'ko'} lang
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function translate(lang, key, params = {}) {
  let template = dictionaries[lang]?.[key] ?? dictionaries.en[key];
  if (template === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] Missing translation key "${key}"`);
    }
    return key;
  }
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined || params[name] === null ? match : String(params[name]),
  );
}

/**
 * Returns a translator function bound to one language. Useful for pure
 * modules (like directions.js) and tests.
 * @param {'en'|'ko'} lang
 * @returns {(key: string, params?: object) => string}
 */
export function createTranslator(lang) {
  return (key, params) => translate(lang, key, params);
}

/**
 * Translates `key` in the current UI language.
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(key, params) {
  return translate(current, key, params);
}

/**
 * Picks the value for the current (or given) language from a bilingual
 * object, falling back to English, then Korean, then an empty string.
 * Plain strings are returned unchanged.
 * @param {{en?:string, ko?:string}|string|null|undefined} value
 * @param {'en'|'ko'} [lang]
 * @returns {string}
 */
export function localize(value, lang = current) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[lang] ?? value.en ?? value.ko ?? '';
}

/** @returns {'en'|'ko'} The current UI language. */
export function getLanguage() {
  return current;
}

/**
 * Sets the current language, remembers it and updates <html lang>.
 * Note: modules re-render by subscribing to `lang` in the app state.
 * @param {'en'|'ko'} lang
 */
export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang)) return;
  current = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.title = translate(lang, 'app.title');
    applyStaticTranslations();
  }
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage may be unavailable (private mode); the choice just isn't remembered */
  }
}

/**
 * Chooses the starting language: the saved choice, otherwise Korean when the
 * browser prefers Korean, otherwise English.
 * @returns {'en'|'ko'}
 */
export function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  const preferred =
    typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  return preferred.some((l) => /^ko\b/i.test(l ?? '')) ? 'ko' : 'en';
}

/**
 * Translates static markup: elements with `data-i18n="key"` get their text
 * replaced, and `data-i18n-attr="attr:key;attr2:key2"` sets attributes.
 * @param {ParentNode} [root]
 */
export function applyStaticTranslations(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
