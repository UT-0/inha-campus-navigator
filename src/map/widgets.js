/**
 * Widgets floating over the map: zoom/reset buttons, the north indicator,
 * the scale bar, the collapsible legend and the hover tooltip.
 */
import { el, svgEl } from '../utils/dom.js';
import { createIcon, ICON_PATHS } from '../ui/icons.js';
import { t } from '../i18n/index.js';
import { formatDistance } from '../routing/directions.js';

export const CATEGORIES = ['academic', 'library', 'dormitory', 'admin', 'sports', 'food', 'other'];
const LEGEND_POI_TYPES = [
  'bus_stop',
  'parking',
  'cafe',
  'restaurant',
  'convenience_store',
  'atm',
  'restroom',
  'printer',
  'gate',
];
/** "Nice" scale bar lengths in meters. */
const NICE_DISTANCES = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/**
 * Zoom in / zoom out / reset buttons.
 * @param {HTMLElement} container
 * @param {{zoomBy: (f:number)=>void, reset: ()=>void}} panZoom
 * @returns {{ render: () => void }}
 */
export function createMapControls(container, panZoom) {
  function render() {
    const button = (icon, label, onClick) =>
      el(
        'button',
        { class: 'map-btn', type: 'button', 'aria-label': label, title: label, onClick },
        createIcon(icon),
      );
    container.replaceChildren(
      el(
        'div',
        { class: 'map-btn-group' },
        button('plus', t('map.zoomIn'), () => panZoom.zoomBy(1.6)),
        button('minus', t('map.zoomOut'), () => panZoom.zoomBy(1 / 1.6)),
      ),
      el(
        'div',
        { class: 'map-btn-group' },
        button('reset', t('map.reset'), () => panZoom.reset()),
      ),
    );
  }
  render();
  return { render };
}

/**
 * Static north indicator (the map is drawn with north up).
 * @param {HTMLElement} container
 * @returns {{ render: () => void }}
 */
export function createCompass(container) {
  function render() {
    const svg = svgEl(
      'svg',
      { viewBox: '0 0 40 40', width: 40, height: 40, 'aria-hidden': 'true' },
      svgEl('circle', { class: 'compass-ring', cx: 20, cy: 20, r: 18 }),
      svgEl('path', { class: 'compass-north', d: 'M20 7l5 13h-10z' }),
      svgEl('path', { class: 'compass-south', d: 'M20 33l-5-13h10z' }),
    );
    container.replaceChildren(
      svg,
      el('span', { class: 'compass-letter', 'aria-hidden': 'true', text: 'N' }),
    );
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', t('map.north'));
    container.title = t('map.north');
  }
  render();
  return { render };
}

/**
 * Scale bar that adapts its length to the zoom level.
 * @param {HTMLElement} container
 * @param {number} metersPerUnit
 * @returns {{ update: (scale: number) => void }}
 */
export function createScaleBar(container, metersPerUnit) {
  const bar = el('div', { class: 'scale-bar' });
  const label = el('span', { class: 'scale-label' });
  container.replaceChildren(label, bar);
  let lastScale = 1;

  function update(scale = lastScale) {
    lastScale = scale;
    const metersPerPixel = metersPerUnit / scale;
    const maxMeters = metersPerPixel * 110;
    const meters = [...NICE_DISTANCES].reverse().find((d) => d <= maxMeters) ?? NICE_DISTANCES[0];
    const text = formatDistance(meters, t);
    bar.style.width = `${Math.round(meters / metersPerPixel)}px`;
    label.textContent = text;
    container.setAttribute('aria-label', t('map.scale', { distance: text }));
  }
  container.setAttribute('role', 'img');
  return { update };
}

/**
 * Collapsible legend explaining category colors, POI icons and route markers.
 * @param {HTMLElement} container
 * @returns {{ render: () => void }}
 */
export function createLegend(container) {
  let open = false;

  function render() {
    const panelId = 'legend-panel';
    const toggle = el(
      'button',
      {
        class: 'legend-toggle',
        type: 'button',
        'aria-expanded': String(open),
        'aria-controls': panelId,
        onClick: () => {
          open = !open;
          render();
        },
      },
      createIcon('layers', { size: 18 }),
      el('span', { text: t('map.legend') }),
      createIcon('chevron-down', { size: 16, className: 'legend-chevron' }),
    );

    const categories = el(
      'ul',
      { class: 'legend-list' },
      CATEGORIES.map((category) =>
        el(
          'li',
          {},
          el('span', { class: 'legend-swatch', 'data-category': category, 'aria-hidden': 'true' }),
          t(`category.${category}`),
        ),
      ),
    );

    const places = el(
      'ul',
      { class: 'legend-list legend-list-places' },
      LEGEND_POI_TYPES.map((type) =>
        el(
          'li',
          {},
          el(
            'span',
            { class: 'legend-poi', 'data-type': type, 'aria-hidden': 'true' },
            svgEl('svg', {
              viewBox: '0 0 24 24',
              width: 12,
              height: 12,
              html: ICON_PATHS[type],
            }),
          ),
          t(`facility.${type}`),
        ),
      ),
    );

    const route = el(
      'ul',
      { class: 'legend-list' },
      el(
        'li',
        {},
        el('span', { class: 'legend-route', 'aria-hidden': 'true' }),
        t('map.legendRoute'),
      ),
      el(
        'li',
        {},
        el('span', { class: 'legend-marker is-start', 'aria-hidden': 'true', text: 'A' }),
        t('map.start'),
      ),
      el(
        'li',
        {},
        el('span', { class: 'legend-marker is-end', 'aria-hidden': 'true', text: 'B' }),
        t('map.destination'),
      ),
    );

    const panel = el(
      'div',
      { class: 'legend-panel', id: panelId, hidden: !open },
      el('h3', { class: 'legend-heading', text: t('map.legendBuildings') }),
      categories,
      el('h3', { class: 'legend-heading', text: t('map.legendPlaces') }),
      places,
      el('h3', { class: 'legend-heading', text: t('map.legendRoute') }),
      route,
    );

    container.classList.toggle('is-open', open);
    container.replaceChildren(panel, toggle);
  }

  render();
  return { render };
}

/**
 * Small tooltip that follows the pointer over buildings and POIs.
 * @param {HTMLElement} tooltip
 * @param {HTMLElement} mapArea Positioning parent.
 * @returns {{ show: (content: Node|string, clientX: number, clientY: number) => void, hide: () => void }}
 */
export function createTooltip(tooltip, mapArea) {
  return {
    show(content, clientX, clientY) {
      if (typeof content === 'string') tooltip.textContent = content;
      else tooltip.replaceChildren(content);
      tooltip.hidden = false;
      const area = mapArea.getBoundingClientRect();
      const box = tooltip.getBoundingClientRect();
      let x = clientX - area.left + 14;
      let y = clientY - area.top + 16;
      if (x + box.width > area.width - 8) x = clientX - area.left - box.width - 14;
      if (y + box.height > area.height - 8) y = clientY - area.top - box.height - 12;
      tooltip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
    },
    hide() {
      tooltip.hidden = true;
    },
  };
}
