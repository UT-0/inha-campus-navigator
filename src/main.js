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

import { setState } from './state.js';
import { buildGraph, logProblems, validateCampus } from './routing/graph.js';
import {
  applyStaticTranslations,
  detectLanguage,
  getLanguage,
  setLanguage,
  t,
} from './i18n/index.js';
import { createMapController } from './map/mapController.js';
import { createIcon } from './ui/icons.js';
import { el } from './utils/dom.js';

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

  const graph = buildGraph(campus);
  setState({ campus, courses, lang: getLanguage() });

  const map = createMapController({
    campus,
    getPadding: mapPadding,
    onBuildingActivate: (id) => {
      setState({ selectedBuilding: id });
      map.flyToBuilding(id);
    },
  });

  showSampleBanner(campus);
  document.getElementById('route-panel').textContent =
    `${campus.buildings.length} buildings, ${graph.nodes.size} nodes loaded.`;
  document.getElementById('map-loading').classList.add('is-hidden');
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
