/**
 * "All buildings" list: a collapsible list of buttons, one per building.
 * It is the keyboard and screen-reader friendly alternative to clicking
 * buildings on the map.
 */
import { setState, subscribe } from '../state.js';
import { localize, t } from '../i18n/index.js';
import { el } from '../utils/dom.js';
import { createIcon } from './icons.js';

/**
 * @param {Object} options
 * @param {HTMLElement} options.container
 * @param {object} options.campus
 * @param {(id: string) => void} options.onOpen Opens a building.
 */
export function createBuildingList({ container, campus, onOpen }) {
  let open = false;

  function render() {
    const sorted = [...campus.buildings].sort(
      (a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0),
    );
    const details = el(
      'details',
      { class: 'building-list', open },
      el(
        'summary',
        { class: 'building-list-summary' },
        createIcon('building', { size: 18 }),
        el('span', { text: t('list.title') }),
        el('span', { class: 'building-list-count', text: String(sorted.length) }),
        createIcon('chevron-down', { size: 16, className: 'building-list-chevron' }),
      ),
      el('p', { class: 'building-list-hint', text: t('list.hint') }),
      el(
        'ul',
        { class: 'building-list-items' },
        sorted.map((building) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                class: 'building-list-item',
                type: 'button',
                onClick: () => onOpen(building.id),
                onMouseenter: () => setState({ hoveredBuilding: building.id }),
                onMouseleave: () => setState({ hoveredBuilding: null }),
              },
              el('span', {
                class: 'number-badge',
                'data-category': building.category ?? 'other',
                'aria-hidden': 'true',
                text: building.number ?? '',
              }),
              el(
                'span',
                { class: 'combo-text' },
                el('span', { class: 'combo-label', text: localize(building.name) }),
                el('span', {
                  class: 'combo-sublabel',
                  text: t(`category.${building.category ?? 'other'}`),
                }),
              ),
              createIcon('chevron-right', { size: 16, className: 'building-list-arrow' }),
            ),
          ),
        ),
      ),
    );
    details.addEventListener('toggle', () => {
      open = details.open;
    });
    container.replaceChildren(details);
  }

  render();
  subscribe((state, changed) => {
    if (changed.includes('lang')) render();
  });
}
