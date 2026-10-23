/**
 * Map controller: wires the SVG drawing, pan/zoom, labels, widgets and the
 * route layer to the shared app state.
 *
 * It listens to state changes (selection, hover, From/To, route, language)
 * and updates the map, and it turns map interaction (hover, click, keyboard)
 * into state changes or callbacks.
 */
import { getState, setState, subscribe } from '../state.js';
import { localize, t } from '../i18n/index.js';
import { el, readStorage, writeStorage } from '../utils/dom.js';
import { boundsOf } from '../utils/geometry.js';
import { buildingBounds, renderMap, updateScaledElements } from './renderMap.js';
import { createPanZoom } from './panZoom.js';
import { createLabels } from './labels.js';
import {
  createCompass,
  createLegend,
  createMapControls,
  createPoiFilters,
  createScaleBar,
  createTooltip,
} from './widgets.js';

const FILTERS_KEY = 'icn.poiFilters';
const DEFAULT_FILTERS = ['food', 'transport'];
/** Zoom (relative to the whole-map view) where small places appear. */
const LOD_MID = 1.8;
const LOD_HIGH = 4;
/** Building-panel amenity to highlight when an amenity badge is clicked. */
const GROUP_AMENITY = { food: 'food', money: 'atm', study: 'studySpace' };

/**
 * @typedef {Object} MapController
 * @property {ReturnType<typeof createPanZoom>} panZoom
 * @property {(id: string) => void} flyToBuilding
 * @property {(points: Array<{x:number,y:number}>, options?: object) => void} flyToPoints
 * @property {() => void} refreshLayout Call after the visible map area changes.
 * @property {import('./renderMap.js').MapView} view
 */

/**
 * Creates the map.
 * @param {Object} options
 * @param {object} options.campus
 * @param {(id: string, highlight?: {type: string, value: string}|null) => void} options.onBuildingActivate
 *        Called when a building (or an amenity badge next to it) is clicked or activated.
 * @param {() => {top:number,right:number,bottom:number,left:number}} options.getPadding
 *        Screen areas covered by floating UI (search bar, bottom sheet…).
 * @returns {MapController}
 */
export function createMapController({ campus, onBuildingActivate, getPadding }) {
  const svg = /** @type {SVGSVGElement} */ (document.getElementById('map'));
  const mapArea = document.getElementById('map-area');
  const view = renderMap(svg, campus);
  const labels = createLabels(view.layers.labels, campus);
  const buildingsById = new Map(campus.buildings.map((b) => [b.id, b]));
  const tooltip = createTooltip(document.getElementById('tooltip'), mapArea);
  const scaleBar = createScaleBar(
    document.getElementById('scale-bar'),
    campus.meta.metersPerUnit ?? 1,
  );

  /** Extra per-frame updates registered by other layers (e.g. the route). */
  const cameraListeners = new Set();

  const panZoom = createPanZoom({
    svg,
    camera: view.camera,
    worldBounds: view.worldBounds,
    getPadding,
    onChange: onCameraChange,
  });

  const controls = createMapControls(document.getElementById('map-controls'), panZoom);
  const compass = createCompass(document.getElementById('compass'));
  const legend = createLegend(document.getElementById('legend'));

  // ---------- Amenity filters and level of detail ----------

  const poisById = new Map((campus.pois ?? []).map((p) => [p.id, p]));
  const groupCounts = {};
  for (const poi of campus.pois ?? []) groupCounts[poi.group] = (groupCounts[poi.group] ?? 0) + 1;
  const filters = createPoiFilters(document.getElementById('map-filters'), groupCounts, (groups) =>
    setState({ poiFilters: groups }),
  );
  setState({ poiFilters: readStorage(FILTERS_KEY, DEFAULT_FILTERS) });

  function applyFilters() {
    const active = getState().poiFilters ?? [];
    for (const name of [...svg.classList].filter((c) => c.startsWith('filter-'))) {
      svg.classList.remove(name);
    }
    for (const group of active) svg.classList.add(`filter-${group}`);
    filters.render(active);
  }

  /** Low zoom: buildings, gates and landmarks only; high zoom: everything. */
  function levelOfDetail(relativeZoom) {
    if (relativeZoom < LOD_MID) return 'low';
    return relativeZoom < LOD_HIGH ? 'mid' : 'high';
  }

  function emphasizedBuildings() {
    const { from, to, selectedBuilding, hoveredBuilding } = getState();
    return new Set([from, to, selectedBuilding, hoveredBuilding].filter(Boolean));
  }

  function onCameraChange({ k }) {
    const relativeZoom = panZoom ? panZoom.getRelativeZoom() : 1;
    labels.update({ scale: k, relativeZoom, emphasized: emphasizedBuildings() });
    updateScaledElements(view.scaledEls, k);
    scaleBar.update(k);
    svg.style.setProperty('--zoom', String(k));
    const lod = levelOfDetail(relativeZoom);
    if (svg.dataset.lod !== lod) svg.dataset.lod = lod;
    for (const listener of cameraListeners) listener(k);
  }

  function refreshLabels() {
    onCameraChange(panZoom.getTransform());
  }

  // ---------- Building interaction ----------

  function buildingFromEvent(event) {
    const group = event.target.closest?.('.building');
    return group ? buildingsById.get(group.dataset.id) : null;
  }

  function showTooltip(building, x, y) {
    tooltip.show(
      el(
        'span',
        { class: 'tooltip-content' },
        el('span', {
          class: 'tooltip-number',
          'data-category': building.category,
          text: building.number ?? '',
        }),
        el('span', { text: localize(building.name) }),
      ),
      x,
      y,
    );
  }

  svg.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const building = buildingFromEvent(event);
    if (building) setState({ hoveredBuilding: building.id });
    const poi = event.target.closest?.('.poi');
    if (poi) showPoiTooltip(poi, event.clientX, event.clientY);
  });

  /** Name and type of a place; for a building's amenity badge, all its places. */
  function showPoiTooltip(poi, x, y) {
    if (poi.classList.contains('poi-gate')) {
      const gate = campus.nodes.find((n) => n.id === poi.dataset.id);
      if (gate) tooltip.show(localize(gate.name) || t('facility.gate'), x, y);
      return;
    }
    const ids = poi.dataset.ids ? poi.dataset.ids.split(' ') : [poi.dataset.id];
    const items = ids.map((id) => poisById.get(id)).filter(Boolean);
    if (items.length === 0) return;
    const line = (item) => {
      const type = t(`facility.${item.type}`);
      const name = localize(item.name);
      const routes = item.routes?.length ? ` · ${item.routes.join(', ')}` : '';
      return name && name !== type ? `${name} (${type})${routes}` : `${type}${routes}`;
    };
    const building = poi.dataset.building ? buildingsById.get(poi.dataset.building) : null;
    tooltip.show(
      el(
        'span',
        { class: 'tooltip-content tooltip-list' },
        building ? el('strong', { text: localize(building.name) }) : null,
        ...items.slice(0, 6).map((item) => el('span', { text: line(item) })),
        items.length > 6 ? el('span', { text: t('filters.more', { n: items.length - 6 }) }) : null,
      ),
      x,
      y,
    );
  }

  svg.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || event.buttons) return;
    const building = buildingFromEvent(event);
    if (building) showTooltip(building, event.clientX, event.clientY);
    else if (!event.target.closest?.('.poi')) tooltip.hide();
  });

  svg.addEventListener('pointerout', (event) => {
    const leftBuilding = buildingFromEvent(event);
    const into = event.relatedTarget?.closest?.('.building');
    if (leftBuilding && !into) setState({ hoveredBuilding: null });
    if (!event.relatedTarget?.closest?.('.building, .poi')) tooltip.hide();
  });

  svg.addEventListener('pointerdown', () => tooltip.hide());

  svg.addEventListener('click', (event) => {
    const poi = event.target.closest?.('.poi-indoor, .poi-poi');
    if (poi?.dataset.building) {
      const amenity = GROUP_AMENITY[poi.dataset.group];
      onBuildingActivate(
        poi.dataset.building,
        amenity ? { type: 'amenity', value: amenity } : null,
      );
      return;
    }
    if (poi) {
      // Touch screens have no hover: show the name on tap.
      showPoiTooltip(poi, event.clientX, event.clientY);
      return;
    }
    const building = buildingFromEvent(event);
    if (building) onBuildingActivate(building.id);
  });

  svg.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const building = buildingFromEvent(event);
    if (!building) return;
    event.preventDefault();
    onBuildingActivate(building.id);
  });

  svg.addEventListener('focusin', (event) => {
    const building = buildingFromEvent(event);
    if (building) setState({ hoveredBuilding: building.id });
  });

  svg.addEventListener('focusout', (event) => {
    if (buildingFromEvent(event)) setState({ hoveredBuilding: null });
  });

  // ---------- Reacting to state ----------

  function applyBuildingClasses() {
    const { from, to, selectedBuilding, hoveredBuilding, route } = getState();
    for (const [id, group] of view.buildingEls) {
      group.classList.toggle('is-selected', id === selectedBuilding);
      group.classList.toggle('is-hovered', id === hoveredBuilding);
      group.classList.toggle('is-start', id === from && Boolean(route));
      group.classList.toggle('is-end', id === to && Boolean(route));
    }
    svg.classList.toggle('has-route', Boolean(route));
    refreshLabels();
  }

  function applyLanguage() {
    labels.setLanguage(getState().lang);
    svg.setAttribute('aria-label', t('a11y.map'));
    for (const [id, group] of view.buildingEls) {
      const building = buildingsById.get(id);
      group.setAttribute(
        'aria-label',
        t('a11y.buildingButton', {
          number: building.number ?? '',
          name: localize(building.name),
          category: t(`category.${building.category ?? 'other'}`),
        }),
      );
    }
    controls.render();
    compass.render();
    legend.render();
    filters.render(getState().poiFilters ?? []);
    scaleBar.update();
    refreshLabels();
  }

  subscribe((state, changed) => {
    if (changed.includes('lang')) applyLanguage();
    if (changed.includes('poiFilters')) {
      writeStorage(FILTERS_KEY, state.poiFilters);
      applyFilters();
    }
    if (
      ['selectedBuilding', 'hoveredBuilding', 'from', 'to', 'route'].some((k) =>
        changed.includes(k),
      )
    ) {
      applyBuildingClasses();
    }
  });

  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'group');
  svg.querySelector('title')?.remove();
  applyLanguage();
  applyFilters();
  applyBuildingClasses();

  // Fonts change text widths: re-measure labels once the web font is ready.
  document.fonts?.ready.then(() => {
    labels.setLanguage(getState().lang);
    refreshLabels();
  });

  return {
    view,
    panZoom,
    onCamera(listener) {
      cameraListeners.add(listener);
      return () => cameraListeners.delete(listener);
    },
    flyToBuilding(id) {
      const building = buildingsById.get(id);
      if (building) panZoom.flyTo(buildingBounds(building), { margin: 80, maxScale: 2.2 });
    },
    flyToPoints(points, options) {
      if (points.length > 0) panZoom.flyTo(boundsOf(points), options);
    },
    refreshLayout() {
      panZoom.refresh();
    },
    /** Briefly pulses a POI or gate icon so it is easy to spot. */
    pulsePlace(id) {
      const poi = svg.querySelector(`.poi[data-id="${CSS.escape(id)}"]`);
      if (!poi) return;
      poi.classList.remove('is-pulsing');
      // Restart the CSS animation.
      void poi.getBoundingClientRect();
      poi.classList.add('is-pulsing');
      setTimeout(() => poi.classList.remove('is-pulsing'), 2600);
    },
  };
}
