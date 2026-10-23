/**
 * Header settings: the EN / 한국어 language switch and the light/dark theme
 * toggle. Both choices are remembered in localStorage. Until the user picks
 * a theme, the app follows the operating system setting (and updates live
 * when it changes).
 */
import { getState, setState, subscribe } from '../state.js';
import { LANGUAGES, setLanguage, t } from '../i18n/index.js';
import { el } from '../utils/dom.js';
import { createIcon } from './icons.js';

const THEME_KEY = 'icn.theme';
/** Button text (`label`, `short` on narrow screens) and accessible name. */
const LANGUAGE_NAMES = {
  en: { label: 'EN', short: 'EN', long: 'English' },
  ko: { label: '한국어', short: '한', long: '한국어' },
};

/** @returns {'light'|'dark'|null} The theme the user chose, if any. */
function savedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

/** @returns {'light'|'dark'} */
function effectiveTheme() {
  return savedTheme() ?? (systemDark.matches ? 'dark' : 'light');
}

/**
 * Applies a theme to <html> and the browser UI color.
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0a1120' : '#0b2a5b');
}

/**
 * Creates the settings controls in the header.
 * @param {HTMLElement} container
 * @param {{onInfo?: () => void}} [options] `onInfo` adds a button that opens the Info panel.
 */
export function createSettings(container, { onInfo } = {}) {
  function render() {
    const { lang, theme } = getState();

    const languageSwitch = el(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': t('settings.language') },
      LANGUAGES.map((code) =>
        el(
          'button',
          {
            type: 'button',
            lang: code,
            'aria-pressed': String(code === lang),
            'aria-label': LANGUAGE_NAMES[code].long,
            title: LANGUAGE_NAMES[code].long,
            onClick: () => {
              if (code === getState().lang) return;
              setLanguage(code);
              setState({ lang: code });
            },
          },
          el('span', {
            class: 'lang-label',
            'aria-hidden': 'true',
            text: LANGUAGE_NAMES[code].label,
          }),
          el('span', {
            class: 'lang-short',
            'aria-hidden': 'true',
            text: LANGUAGE_NAMES[code].short,
          }),
        ),
      ),
    );

    const themeLabel = theme === 'dark' ? t('settings.toLight') : t('settings.toDark');
    const themeButton = el(
      'button',
      {
        class: 'icon-btn theme-toggle',
        type: 'button',
        'aria-label': themeLabel,
        title: themeLabel,
        onClick: () => {
          const next = getState().theme === 'dark' ? 'light' : 'dark';
          try {
            localStorage.setItem(THEME_KEY, next);
          } catch {
            /* not remembered, but still applied */
          }
          setState({ theme: next });
        },
      },
      createIcon(theme === 'dark' ? 'sun' : 'moon'),
    );

    const infoButton = onInfo
      ? el(
          'button',
          {
            class: 'icon-btn info-toggle',
            type: 'button',
            'aria-label': t('info.open'),
            title: t('info.open'),
            onClick: onInfo,
          },
          createIcon('info'),
        )
      : null;

    container.replaceChildren(...[languageSwitch, infoButton, themeButton].filter(Boolean));
  }

  // Follow the OS setting until the user makes a choice.
  systemDark.addEventListener('change', () => {
    if (!savedTheme()) setState({ theme: effectiveTheme() });
  });

  subscribe((state, changed) => {
    if (changed.includes('theme')) applyTheme(state.theme);
    if (changed.includes('theme') || changed.includes('lang')) render();
  });

  setState({ theme: effectiveTheme() });
  applyTheme(getState().theme);
  render();
}
