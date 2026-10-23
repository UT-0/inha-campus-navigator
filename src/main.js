/**
 * App entry point.
 *
 * Loads and validates the campus data, then creates every module and wires
 * them together through the shared state (state.js) and a small set of
 * "actions" (find route, open building, share…). If the data cannot be
 * loaded or is invalid, a clear error screen is shown instead of a blank page.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/map.css';

import { getState, setState, subscribe } from './state.js';
import { logProblems, validateCampus } from './routing/graph.js';
import { createRouter } from './routing/router.js';
import { formatDistance } from './routing/directions.js';
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
import { createSettings } from './ui/settings.js';
import { createBottomSheet } from './ui/bottomSheet.js';
import { createIcon } from './ui/icons.js';
import { showToast } from './ui/toast.js';
import { el, readStorage, writeStorage } from './utils/dom.js';
import { buildRouteUrl, copyToClipboard, readRouteParams, writeRouteParams } from './utils/url.js';
import { DRAFT_KEY } from './editor/draft.js';

const RECENT_KEY = 'icn.recentRoutes';
const RECENT_LIMIT = 5;
const mobileQuery = window.matchMedia('(max-width: 899.98px)');

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
  let campus = campusModule.default;
  // "Preview in app" from the Map Editor: use its saved draft instead.
  if (readRouteParams().preview) {
    const draft = readStorage(DRAFT_KEY, null);
    if (draft && typeof draft === 'object') campus = draft;
  }
  return { campus, courses: coursesModule.default ?? [] };
}

/**
 * Validates the data and throws a readable error if it can't be used.
 * Warnings (e.g. a disconnected path) are only logged.
 * @param {object} campus
 * @param {unknown} courses
 */
function checkData(campus, courses) {
  const problems = validateCampus(campus);
  logProblems(problems);
  const errors = problems.filter((p) => p.level === 'error');
  if (errors.length > 0) throw new Error(errors.map((p) => p.message).join('\n'));
  if (!Array.isArray(courses)) throw new Error('courses.json must contain an array.');
}

async function start() {
  setLanguage(detectLanguage());
  applyStaticTranslations();

  const { campus, courses } = await loadData();
  checkData(campus, courses);

  // The map editor is a separate developer tool, loaded only with ?edit=1.
  if (readRouteParams().edit) {
    const { startEditor } = await import('./editor/mapEditor.js');
    startEditor(campus);
    return;
  }

  setState({ campus, courses, lang: getLanguage() });
  const router = createRouter(campus);
  const buildingsById = new Map(campus.buildings.map((b) => [b.id, b]));
  const nameOf = (id) => localize(buildingsById.get(id)?.name);

  createSettings(document.getElementById('settings'));

  // ---------- Bottom sheet (phones) ----------

  const sheet = createBottomSheet({
    sheet: document.getElementById('sheet'),
    handle: document.getElementById('sheet-handle'),
    content: document.getElementById('sheet-content'),
    mobileQuery,
    handleLabel: (snap) => t(snap === 'full' ? 'sheet.collapse' : 'sheet.expand'),
  });

  /**
   * Screen space covered by floating UI, so the camera centres routes and
   * buildings in the part of the map that is actually visible.
   */
  function mapPadding() {
    if (!mobileQuery.matches) return { top: 0, right: 64, bottom: 0, left: 0 };
    const mapTop = document.getElementById('map-area').getBoundingClientRect().top;
    const searchBottom = document.getElementById('search-area').getBoundingClientRect().bottom;
    return {
      top: Math.max(0, searchBottom - mapTop),
      right: 0,
      // Use the sheet's resting height, not its live position, which may be mid-animation.
      bottom: Math.min(sheet.visibleHeight(), window.innerHeight * 0.6),
      left: 0,
    };
  }

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
    sheet.snapTo('half');
    map.flyToBuilding(id);
  }

  /** Scrolls the panel so the route result is at the top. */
  function revealResult() {
    const content = document.getElementById('sheet-content');
    const result = document.getElementById('route-result');
    const offset = result.getBoundingClientRect().top - content.getBoundingClientRect().top;
    content.scrollTo({ top: content.scrollTop + offset - 8, behavior: 'smooth' });
  }

  // ---------- Recent routes ----------

  function getRecent() {
    const list = readStorage(RECENT_KEY, []);
    return Array.isArray(list) ? list.filter((r) => r && r.from && r.to) : [];
  }

  function rememberRoute(from, to) {
    const list = getRecent().filter((r) => !(r.from === from && r.to === to));
    list.unshift({ from, to });
    writeStorage(RECENT_KEY, list.slice(0, RECENT_LIMIT));
  }

  // ---------- Actions shared by the UI modules ----------

  const actions = {
    /** Computes the route for the current From/To selection and shows it. */
    findRoute() {
      const { from, to } = getState();
      if (!from || !to) return;
      const { status, route } = router.findRoute(from, to);
      setState({ selectedBuilding: null, highlight: null });

      if (status === 'ok') {
        setState({ route, routeStatus: 'ok', activeStep: null });
        sheet.snapTo('half');
        map.flyToPoints(routeExtent(route), { margin: 40, maxScale: 2.5 });
        writeRouteParams(from, to);
        rememberRoute(from, to);
        routePanel.renderRecent();
        revealResult();
        const directions = router.directionsFor(route, getState().lang, t);
        announce(
          t('result.announce', {
            from: nameOf(from),
            to: nameOf(to),
            distance: formatDistance(directions.totalMeters, t),
            minutes: directions.minutes,
            steps: directions.steps.length,
          }),
        );
      } else if (status === 'same') {
        setState({ route: null, routeStatus: 'same', activeStep: null });
        revealResult();
        writeRouteParams(null, null);
        announce(t('result.sameTitle'));
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
      else showToast(t('toast.fromSet', { name: nameOf(id) }));
    },
    /** "Go here" in the building panel. */
    goHere(id) {
      setState({ to: id, selectedBuilding: null, highlight: null });
      if (getState().from) actions.findRoute();
      else showToast(t('toast.toSet', { name: nameOf(id) }));
    },
    zoomTo(id) {
      map.flyToBuilding(id);
    },
  };

  // ---------- Panels ----------

  const routePanel = createRoutePanel({
    panelContainer: document.getElementById('route-panel'),
    resultContainer: document.getElementById('route-result'),
    campus,
    router,
    actions,
    getRecent,
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
      if (entry.buildingId) {
        openBuilding(entry.buildingId, entry.highlight);
      } else if (entry.point) {
        setState({ selectedBuilding: null, highlight: null });
        sheet.snapTo('peek');
        map.flyToPoints([entry.point], { margin: 120, maxScale: 2.5 });
        map.pulsePlace(entry.id.replace(/^place:/, ''));
      }
    },
  });

  // On phones, open the sheet fully while typing in it so suggestions are visible.
  document.getElementById('sheet-content').addEventListener('focusin', (event) => {
    if (event.target.matches('.combo-input')) sheet.snapTo('full');
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
      if (points) map.flyToPoints(points, { margin: 80, maxScale: points.length > 1 ? 3 : 2 });
    }
    if (changed.includes('lang')) showSampleBanner(campus);
  });

  showSampleBanner(campus);
  document.getElementById('map-loading').classList.add('is-hidden');

  // ---------- Shared links: ?from=…&to=… ----------

  const params = readRouteParams();
  if (params.from || params.to) {
    const from = buildingsById.has(params.from) ? params.from : null;
    const to = buildingsById.has(params.to) ? params.to : null;
    if ((params.from && !from) || (params.to && !to)) {
      showToast(t('toast.invalidLink'), { type: 'error' });
      writeRouteParams(null, null);
    }
    setState({ from, to });
    if (from && to) actions.findRoute();
  }
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

/** Shows the "sample data" banner while campus.json is flagged as placeholder. */
function showSampleBanner(campus) {
  const banner = document.getElementById('sample-banner');
  const preview = readRouteParams().preview;
  banner.hidden = campus._placeholder !== true && !preview;
  banner.replaceChildren(
    createIcon('info', { size: 14 }),
    el('span', { text: t(preview ? 'app.previewData' : 'app.sampleData') }),
  );
}

/**
 * Replaces the app with a friendly error card.
 * @param {unknown} error
 */
function showErrorScreen(error) {
  console.error('[app] Failed to start:', error);
  document.getElementById('app').hidden = true;
  const screen = document.getElementById('error-screen');
  screen.replaceChildren(
    el(
      'div',
      { class: 'error-card' },
      el(
        'div',
        { class: 'error-icon', 'aria-hidden': 'true' },
        createIcon('warning', { size: 28 }),
      ),
      el('h1', { text: t('error.title') }),
      el('p', { text: t('error.text') }),
      el('pre', { text: error instanceof Error ? error.message : String(error) }),
      el(
        'button',
        { class: 'btn btn-primary', type: 'button', onClick: () => location.reload() },
        t('error.reload'),
      ),
    ),
  );
  screen.hidden = false;
}

start().catch(showErrorScreen);
