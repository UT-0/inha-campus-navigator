/**
 * App entry point.
 *
 * Loads and validates the campus data, then wires the modules together.
 * If the data cannot be loaded or is invalid, a clear error screen is shown
 * instead of a blank page.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/map.css';

import { getState, setState, subscribe } from './state.js';
import { logProblems, validateCampus } from './routing/graph.js';
import { createRouter } from './routing/router.js';
import {
  applyStaticTranslations,
  detectLanguage,
  getLanguage,
  localize,
  setLanguage,
  t,
} from './i18n/index.js';
import { createMapController } from './map/mapController.js';
import { createRouteLayer } from './map/routeLayer.js';
import { createRoutePanel } from './ui/routePanel.js';
import { createBuildingPanel } from './ui/buildingPanel.js';
import { createBuildingList } from './ui/buildingList.js';
import { createSearchBar } from './ui/searchBar.js';
import { createIcon } from './ui/icons.js';
import { showToast } from './ui/toast.js';
import { el } from './utils/dom.js';
import { formatDistance } from './routing/directions.js';
import { buildRouteUrl, copyToClipboard, writeRouteParams } from './utils/url.js';

/**
 * Loads campus.json and courses.json. Dynamic imports let us catch a missing
 * or malformed file and show the error screen.
 * @returns {Promise<{campus: object, courses: object[]}>}
 */
async function loadData() {
  const [campusModule, coursesModule] = await Promise.all([
    import('./data/campus.json'),
    import('./data/courses.json'),
  ]);
  return { campus: campusModule.default, courses: coursesModule.default ?? [] };
}

/**
 * Replaces the app with a friendly error card.
 * @param {unknown} error
 */
function showErrorScreen(error) {
  console.error('[app] Failed to start:', error);
  document.getElementById('app').hidden = true;
  const screen = document.getElementById('error-screen');
  const card = document.createElement('div');
  card.className = 'error-card';
  const title = document.createElement('h1');
  title.textContent = t('error.title');
  const text = document.createElement('p');
  text.textContent = t('error.text');
  const details = document.createElement('pre');
  details.textContent = error instanceof Error ? error.message : String(error);
  const reload = document.createElement('button');
  reload.className = 'btn btn-primary';
  reload.textContent = t('error.reload');
  reload.addEventListener('click', () => location.reload());
  card.append(title, text, details, reload);
  screen.replaceChildren(card);
  screen.hidden = false;
}

async function start() {
  setLanguage(detectLanguage());
  applyStaticTranslations();

  const { campus, courses } = await loadData();
  const problems = validateCampus(campus);
  logProblems(problems);
  const errors = problems.filter((p) => p.level === 'error');
  if (errors.length > 0) throw new Error(errors.map((p) => p.message).join('\n'));

  setState({ campus, courses, lang: getLanguage() });
  const router = createRouter(campus);
  const buildingsById = new Map(campus.buildings.map((b) => [b.id, b]));

  // ---------- Map ----------

  const map = createMapController({
    campus,
    getPadding: mapPadding,
    onBuildingActivate: (id) => openBuilding(id),
  });
  const routeLayer = createRouteLayer({
    routeLayer: map.view.layers.route,
    markerLayer: map.view.layers.markers,
  });
  map.onCamera((k) => routeLayer.setScale(k));
  routeLayer.setScale(map.panZoom.getTransform().k);

  /** Route nodes plus the outlines of both end buildings, for framing the camera. */
  function routeExtent(route) {
    const outline = (id) => (buildingsById.get(id)?.polygon ?? []).map(([x, y]) => ({ x, y }));
    return [...router.pointsOf(route.path), ...outline(route.fromId), ...outline(route.toId)];
  }

  /**
   * Opens a building's panel and flies the map to it.
   * @param {string} id
   * @param {{type: string, value: string}|null} [highlight] Item to highlight.
   */
  function openBuilding(id, highlight = null) {
    if (!buildingsById.has(id)) return;
    setState({ selectedBuilding: id, highlight });
    map.flyToBuilding(id);
  }

  // ---------- Actions shared by the UI modules ----------

  const actions = {
    /** Computes the route for the current From/To selection and shows it. */
    findRoute() {
      const { from, to } = getState();
      if (!from || !to) return;
      const { status, route } = router.findRoute(from, to);
      if (status === 'ok') {
        setState({ route, routeStatus: 'ok', activeStep: null });
        map.flyToPoints(routeExtent(route), { margin: 56, maxScale: 2.5 });
        writeRouteParams(from, to);
        const directions = router.directionsFor(route, getState().lang, t);
        announce(
          t('result.announce', {
            from: localizeName(buildingsById.get(from)),
            to: localizeName(buildingsById.get(to)),
            distance: formatDistance(directions.totalMeters, t),
            minutes: directions.minutes,
            steps: directions.steps.length,
          }),
        );
      } else if (status === 'same') {
        setState({ route: null, routeStatus: 'same', activeStep: null });
        writeRouteParams(null, null);
        map.flyToBuilding(from);
      } else {
        setState({ route: null, routeStatus: 'none', activeStep: null });
        writeRouteParams(null, null);
        showToast(t('toast.noRoute'), { type: 'error' });
      }
    },
    clearRoute() {
      setState({ route: null, routeStatus: 'idle', activeStep: null });
      writeRouteParams(null, null);
      map.panZoom.reset();
    },
    swap() {
      const { from, to, route } = getState();
      setState({ from: to, to: from });
      if (route && from && to) actions.findRoute();
    },
    async shareRoute() {
      const { route } = getState();
      if (!route) return;
      const ok = await copyToClipboard(buildRouteUrl(route.fromId, route.toId));
      showToast(t(ok ? 'toast.linkCopied' : 'toast.copyFailed'), {
        type: ok ? 'success' : 'error',
      });
    },
    openRecent(from, to) {
      setState({ from, to });
      actions.findRoute();
    },
    /** "Start here" in the building panel. */
    startHere(id) {
      setState({ from: id, selectedBuilding: null, highlight: null });
      if (getState().to) actions.findRoute();
      else showToast(t('toast.fromSet', { name: localizeName(buildingsById.get(id)) }));
    },
    /** "Go here" in the building panel. */
    goHere(id) {
      setState({ to: id, selectedBuilding: null, highlight: null });
      if (getState().from) actions.findRoute();
      else showToast(t('toast.toSet', { name: localizeName(buildingsById.get(id)) }));
    },
    zoomTo(id) {
      map.flyToBuilding(id);
    },
  };

  // ---------- Panels ----------

  createRoutePanel({
    panelContainer: document.getElementById('route-panel'),
    resultContainer: document.getElementById('route-result'),
    campus,
    router,
    actions,
    getRecent: () => [],
  });
  createBuildingPanel({
    container: document.getElementById('building-view'),
    routeView: document.getElementById('route-view'),
    campus,
    courses,
    actions,
  });
  createBuildingList({
    container: document.getElementById('building-list'),
    campus,
    onOpen: (id) => openBuilding(id),
  });
  createSearchBar({
    container: document.getElementById('search-area'),
    campus,
    courses,
    onResult: (entry) => {
      if (entry.buildingId) openBuilding(entry.buildingId, entry.highlight);
      else if (entry.point) {
        setState({ selectedBuilding: null, highlight: null });
        map.flyToPoints([entry.point], { margin: 120, maxScale: 2.5 });
        map.pulsePlace(entry.id.replace(/^place:/, ''));
      }
    },
  });

  // ---------- Reactions to state changes ----------

  subscribe((state, changed) => {
    // Changing From/To makes a shown route (or status message) out of date.
    if ((changed.includes('from') || changed.includes('to')) && state.routeStatus !== 'idle') {
      const current = state.route;
      if (!current || current.fromId !== state.from || current.toId !== state.to) {
        setState({ route: null, routeStatus: 'idle', activeStep: null });
        writeRouteParams(null, null);
      }
    }
    if (changed.includes('route')) {
      if (state.route) routeLayer.draw(router.pointsOf(state.route.path));
      else routeLayer.clear();
    }
    if (changed.includes('activeStep') || changed.includes('route')) {
      const step =
        state.route && state.activeStep !== null
          ? router.directionsFor(state.route, state.lang, t).steps[state.activeStep]
          : null;
      const points = step ? router.pointsOf(step.nodeIds) : null;
      routeLayer.highlight(points);
      if (points) map.flyToPoints(points, { margin: 80, maxScale: 3 });
    }
  });

  showSampleBanner(campus);
  document.getElementById('map-loading').classList.add('is-hidden');
}

/** Localized building name. */
function localizeName(building) {
  return building ? localize(building.name) : '';
}

/**
 * Announces a message to screen readers through the aria-live region.
 * @param {string} message
 */
function announce(message) {
  const region = document.getElementById('announcer');
  region.textContent = '';
  // A short delay makes screen readers notice the change even for repeated text.
  setTimeout(() => {
    region.textContent = message;
  }, 50);
}

const mobileQuery = window.matchMedia('(max-width: 899.98px)');

/**
 * Screen space covered by floating UI, so the camera centres routes and
 * buildings in the part of the map that is actually visible.
 * @returns {{top:number,right:number,bottom:number,left:number}}
 */
function mapPadding() {
  if (!mobileQuery.matches) return { top: 0, right: 64, bottom: 0, left: 0 };
  const mapRect = document.getElementById('map-area').getBoundingClientRect();
  const searchBottom = document.getElementById('search-area').getBoundingClientRect().bottom;
  // Use the sheet's resting height, not its live position, which may be mid-animation.
  const peek = parseFloat(
    getComputedStyle(document.getElementById('app')).getPropertyValue('--sheet-peek'),
  );
  return {
    top: Math.max(0, searchBottom - mapRect.top),
    right: 0,
    bottom: Number.isFinite(peek) ? peek : 0,
    left: 0,
  };
}

/** Shows the "sample data" banner while campus.json is flagged as placeholder. */
function showSampleBanner(campus) {
  const banner = document.getElementById('sample-banner');
  banner.hidden = campus._placeholder !== true;
  banner.replaceChildren(
    createIcon('info', { size: 14 }),
    el('span', { text: t('app.sampleData') }),
  );
}

start().catch(showErrorScreen);
