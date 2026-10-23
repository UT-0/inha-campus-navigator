/**
 * Global search box.
 *
 * One field that finds buildings (by either language, short name or number),
 * courses (code or name), room codes such as "2남 212호", departments,
 * facilities and places such as bus stops and gates. Results are grouped by type. Choosing a result opens
 * the right building with the matching item highlighted, or flies the map to
 * the place.
 */
import { subscribe } from '../state.js';
import { localize, t, translate } from '../i18n/index.js';
import { buildSearchIndex, roomCodeEntry, search } from '../utils/search.js';
import { buildPrefixTable } from '../utils/roomCode.js';
import { createCombobox } from './combobox.js';

/**
 * @param {Object} options
 * @param {HTMLElement} options.container
 * @param {object} options.campus
 * @param {object[]} options.courses
 * @param {(entry: import('../utils/search.js').SearchEntry) => void} options.onResult
 */
export function createSearchBar({ container, campus, courses, onResult }) {
  const index = buildSearchIndex(campus, courses, (key) => ({
    en: translate('en', key),
    ko: translate('ko', key),
  }));

  const prefixTable = buildPrefixTable(campus.buildings);

  /** Room codes ("2남 212호") first, then the normal search results. */
  function options(query) {
    const room = roomCodeEntry(query, campus, prefixTable);
    return [...(room ? [{ entry: room, score: 100 }] : []), ...search(index, query)].map(toOption);
  }

  function toOption({ entry }) {
    let sublabel = localize(entry.subtitle);
    if (entry.type === 'course') {
      sublabel = `${sublabel} · ${t('building.courseRoom', { room: entry.room })}`;
    }
    if (entry.type === 'building') sublabel = t(`category.${entry.category ?? 'other'}`);
    return {
      id: entry.id,
      label: localize(entry.title),
      sublabel,
      group: t(`search.group.${entry.type}`),
      number: entry.type === 'building' ? (entry.number ?? '') : undefined,
      category: entry.category,
      icon: entry.type === 'building' ? undefined : entry.icon,
      data: entry,
    };
  }

  let combo;

  function render() {
    const previous = combo?.input.value ?? '';
    combo = createCombobox({
      label: t('search.label'),
      hideLabel: true,
      placeholder: t('search.placeholder'),
      leadingIcon: 'search',
      keepTextOnSelect: false,
      clearLabel: t('search.clear'),
      className: 'combo-search',
      getOptions: options,
      emptyText: (query) => (query.trim() ? t('search.noResults', { query: query.trim() }) : ''),
      onSelect: (option) => {
        if (!option) return;
        combo.input.blur();
        onResult(option.data);
      },
    });
    combo.input.value = previous;
    container.replaceChildren(combo.element);
  }

  render();
  subscribe((state, changed) => {
    if (changed.includes('lang')) render();
  });

  return { focus: () => combo.focus() };
}
