/**
 * Route panel: the From / To building pickers, the swap button, "Use my
 * location", the step-free option, the "Find route" button with a hint while
 * selections are missing, "nearest …" chips, recent route chips, and the
 * result area below it (welcome message, the route result card with numbered
 * directions, or a friendly status message).
 */
import { getState, setState, subscribe } from '../state.js';
import { localize, t } from '../i18n/index.js';
import { el, richText, plainText } from '../utils/dom.js';
import { bestScore } from '../utils/search.js';
import { formatDistance } from '../routing/directions.js';
import { NEAREST_KINDS } from '../routing/router.js';
import { createCombobox } from './combobox.js';
import { createIcon } from './icons.js';
import { CATEGORIES } from '../map/widgets.js';

/**
 * @typedef {Object} RouteActions
 * @property {() => void} findRoute
 * @property {() => void} clearRoute
 * @property {() => void} swap
 * @property {() => void} shareRoute
 * @property {(from: string, to: string) => void} openRecent
 * @property {(kind: string) => void} findNearest
 * @property {() => void} locate
 */

/**
 * Creates the route panel.
 * @param {Object} options
 * @param {HTMLElement} options.panelContainer
 * @param {HTMLElement} options.resultContainer
 * @param {object} options.campus
 * @param {ReturnType<import('../routing/router.js').createRouter>} options.router
 * @param {RouteActions} options.actions
 * @param {() => Array<{from: string, to: string}>} options.getRecent
 */
export function createRoutePanel({
  panelContainer,
  resultContainer,
  campus,
  router,
  actions,
  getRecent,
}) {
  const buildings = new Map(campus.buildings.map((b) => [b.id, b]));
  let fromCombo;
  let toCombo;
  let findButton;
  let hint;
  let recentEl;
  let nearestEl;

  // ---------- Building options for the pickers ----------

  /** Picker option for a building, or for a place picked via "nearest". */
  function optionFor(id) {
    if (buildings.has(id)) return toOption(buildings.get(id));
    const endpoint = router.endpoints.get(id);
    if (!endpoint) return null;
    return {
      id,
      label: localize(endpoint.name),
      sublabel: t(`facility.${endpoint.place.type}`),
      number: '',
      category: endpoint.building?.category ?? 'other',
    };
  }

  function toOption(building) {
    return {
      id: building.id,
      label: localize(building.name),
      sublabel: t(`category.${building.category ?? 'other'}`),
      number: building.number ?? '',
      category: building.category,
    };
  }

  /** Scores a building for the picker: a number means the building number. */
  function scoreBuilding(building, query) {
    const q = query.trim();
    if (/^\d+$/.test(q)) {
      if (building.number === q) return 100;
      return String(building.number ?? '').startsWith(q) ? 70 : 0;
    }
    const n = building.name ?? {};
    const s = building.shortName ?? {};
    const names = bestScore(q, [n.en, n.ko, s.en, s.ko, ...(building.aliases ?? [])]);
    // Typing a department ("컴퓨터공학") finds the building its office is in.
    const departments = bestScore(
      q,
      (building.departments ?? []).flatMap((d) => [d.ko, d.en]),
    );
    return Math.max(names, departments - 5);
  }

  function buildingOptions(query) {
    if (!query.trim()) {
      // Grouped by category, numbered buildings first within each group.
      return [...campus.buildings]
        .sort(
          (a, b) =>
            CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || byNumber(a, b),
        )
        .map((b) => ({ ...toOption(b), group: t(`category.${b.category ?? 'other'}`) }));
    }
    return campus.buildings
      .map((building) => ({ building, score: scoreBuilding(building, query) }))
      .filter((x) => x.score >= 40)
      .sort((a, b) => b.score - a.score || byNumber(a.building, b.building))
      .map((x) => {
        const option = toOption(x.building);
        // Found through a department: say which office is there.
        const department = (x.building.departments ?? []).find(
          (d) => bestScore(query, [d.ko, d.en]) >= 40,
        );
        if (department && bestScore(query, [x.building.name.en, x.building.name.ko]) < 40) {
          option.sublabel = [localize(department), department.floorLabel]
            .filter(Boolean)
            .join(' · ');
        }
        return option;
      });
  }

  // ---------- Rendering ----------

  function render() {
    fromCombo = createCombobox({
      label: t('route.from'),
      placeholder: t('route.fromPlaceholder'),
      getOptions: buildingOptions,
      emptyText: () => t('route.noOptions'),
      clearLabel: t('route.clearField'),
      className: 'combo-route combo-from',
      onSelect: (option) => setState({ from: option?.id ?? null }),
    });
    toCombo = createCombobox({
      label: t('route.to'),
      placeholder: t('route.toPlaceholder'),
      getOptions: buildingOptions,
      emptyText: () => t('route.noOptions'),
      clearLabel: t('route.clearField'),
      className: 'combo-route combo-to',
      onSelect: (option) => setState({ to: option?.id ?? null }),
    });

    const swapButton = el(
      'button',
      {
        class: 'icon-btn route-swap',
        type: 'button',
        'aria-label': t('route.swap'),
        title: t('route.swap'),
        onClick: actions.swap,
      },
      createIcon('swap'),
    );

    hint = el('p', { class: 'route-hint', id: 'route-hint' });
    findButton = el(
      'button',
      {
        class: 'btn btn-primary btn-block route-find',
        type: 'button',
        'aria-describedby': 'route-hint',
        onClick: actions.findRoute,
      },
      createIcon('walk'),
      t('route.find'),
    );
    recentEl = el('div', { class: 'recent-routes' });

    const locateButton = el(
      'button',
      { class: 'btn btn-ghost btn-sm route-locate', type: 'button', onClick: actions.locate },
      createIcon('target', { size: 16 }),
      t('route.useLocation'),
    );
    const accessibleToggle = el(
      'label',
      { class: 'switch' },
      el('input', {
        type: 'checkbox',
        role: 'switch',
        checked: getState().accessible ? '' : null,
        onChange: (event) => {
          setState({ accessible: event.target.checked });
          if (getState().route) actions.findRoute();
        },
      }),
      el('span', { class: 'switch-track', 'aria-hidden': 'true' }),
      el(
        'span',
        { class: 'switch-label' },
        t('route.accessible'),
        el('span', { class: 'switch-hint', text: t('route.accessibleHint') }),
      ),
    );
    nearestEl = el('div', { class: 'nearest' });

    panelContainer.replaceChildren(
      el(
        'section',
        { class: 'card route-card', 'aria-labelledby': 'route-title' },
        el('h2', { class: 'card-title', id: 'route-title', text: t('route.title') }),
        el(
          'div',
          { class: 'route-fields' },
          el(
            'div',
            { class: 'route-dots', 'aria-hidden': 'true' },
            el('span', { class: 'route-dot is-start', text: 'A' }),
            el('span', { class: 'route-dot-line' }),
            el('span', { class: 'route-dot is-end', text: 'B' }),
          ),
          el('div', { class: 'route-inputs' }, fromCombo.element, toCombo.element),
          swapButton,
        ),
        el('div', { class: 'route-options' }, locateButton, accessibleToggle),
        hint,
        findButton,
        nearestEl,
        recentEl,
      ),
    );
    syncSelections();
    renderRecent();
    renderNearest();
  }

  /** "Nearest …" chips: walking distance from the start building. */
  function renderNearest() {
    const { from } = getState();
    const counts = Object.fromEntries(
      Object.entries(NEAREST_KINDS).map(([kind, rule]) => [
        kind,
        (campus.pois ?? []).filter(rule.poi).length,
      ]),
    );
    nearestEl.replaceChildren(
      el(
        'h3',
        { class: 'recent-title' },
        createIcon('compass', { size: 14 }),
        from ? t('nearest.title') : t('nearest.titleNoStart'),
      ),
      el(
        'ul',
        { class: 'chip-list' },
        NEAREST_CHIPS.map(([kind, icon]) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                class: 'chip nearest-chip',
                type: 'button',
                disabled: !from ? '' : null,
                'aria-disabled': counts[kind] === 0 ? 'true' : null,
                title: counts[kind] === 0 ? t('filters.none') : null,
                onClick: () => actions.findNearest(kind),
              },
              createIcon(icon, { size: 14 }),
              t(`nearest.${kind}`),
            ),
          ),
        ),
      ),
    );
  }

  /** Mirrors From/To state into the pickers, the hint and the button. */
  function syncSelections() {
    const { from, to } = getState();
    fromCombo.setSelected(from ? optionFor(from) : null);
    toCombo.setSelected(to ? optionFor(to) : null);
    const missing = !from
      ? !to
        ? 'route.hintBoth'
        : 'route.hintFrom'
      : !to
        ? 'route.hintTo'
        : null;
    findButton.disabled = Boolean(missing);
    hint.textContent = missing ? t(missing) : '';
    hint.hidden = !missing;
    renderNearest();
  }

  /** Recent routes as quick chips. */
  function renderRecent() {
    const recent = getRecent().filter((r) => buildings.has(r.from) && buildings.has(r.to));
    // (Routes to places found with "nearest" are not kept as recent routes.)
    recentEl.hidden = recent.length === 0;
    if (recent.length === 0) {
      recentEl.replaceChildren();
      return;
    }
    const shortName = (id) =>
      localize(buildings.get(id).shortName) || localize(buildings.get(id).name);
    recentEl.replaceChildren(
      el('h3', { class: 'recent-title' }, createIcon('history', { size: 14 }), t('route.recent')),
      el(
        'ul',
        { class: 'chip-list' },
        recent.map((r) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                class: 'chip',
                type: 'button',
                title: `${localize(buildings.get(r.from).name)} → ${localize(buildings.get(r.to).name)}`,
                onClick: () => actions.openRecent(r.from, r.to),
              },
              t('route.recentItem', { from: shortName(r.from), to: shortName(r.to) }),
            ),
          ),
        ),
      ),
    );
  }

  // ---------- Result area ----------

  function renderResult() {
    const { route, routeStatus, routeTarget, activeStep, lang } = getState();
    const nameOf = (id) => localize(router.endpoints.get(id)?.name);

    if (routeStatus === 'same') {
      resultContainer.replaceChildren(
        statusCard('pin', 'is-success', t('result.sameTitle'), t('result.sameText')),
      );
      return;
    }
    if (routeStatus === 'inside') {
      const target = router.endpoints.get(routeTarget);
      resultContainer.replaceChildren(
        statusCard(
          'pin',
          'is-success',
          t('result.insideTitle'),
          t('result.insideText', {
            place: localize(target?.place?.name) || t(`facility.${target?.place?.type ?? 'info'}`),
            building: localize(target?.building?.name),
          }),
        ),
      );
      return;
    }
    if (routeStatus === 'noAccessible') {
      resultContainer.replaceChildren(
        statusCard(
          'warning',
          'is-error',
          t('result.noAccessibleTitle'),
          t('result.noAccessibleText'),
        ),
      );
      return;
    }
    if (routeStatus === 'noCandidates') {
      resultContainer.replaceChildren(
        statusCard(
          'info',
          'is-error',
          t('result.noCandidatesTitle'),
          t('result.noCandidatesText', {
            kind: t(`nearest.${routeTarget}`),
          }),
        ),
      );
      return;
    }
    if (routeStatus === 'none') {
      resultContainer.replaceChildren(
        statusCard('warning', 'is-error', t('result.noneTitle'), t('result.noneText')),
      );
      return;
    }
    if (!route) {
      resultContainer.replaceChildren(welcomeCard());
      return;
    }

    const directions = router.directionsFor(route, lang, t);
    const tags = [];
    if (route.accessible) tags.push(tagChip('check', t('result.stepFree')));
    if (directions.hasStairs) tags.push(tagChip('stairs', t('result.stairs')));
    if (directions.hasCovered) tags.push(tagChip('umbrella', t('result.covered')));

    const steps = el(
      'ol',
      { class: 'steps' },
      directions.steps.map((step, index) =>
        el(
          'li',
          {},
          el(
            'button',
            {
              class: `step${activeStep === index ? ' is-active' : ''}`,
              type: 'button',
              'aria-pressed': String(activeStep === index),
              'aria-label': `${t('result.stepLabel', { n: index + 1 })}: ${plainText(step.text)}`,
              onClick: () => setState({ activeStep: activeStep === index ? null : index }),
            },
            el(
              'span',
              { class: `step-icon step-icon-${step.icon}`, 'aria-hidden': 'true' },
              createIcon(step.icon, { size: 18 }),
            ),
            el('span', { class: 'step-text', html: richText(step.text) }),
            step.distanceMeters > 0
              ? el('span', { class: 'step-distance', text: formatDistance(step.distanceMeters, t) })
              : null,
          ),
        ),
      ),
    );

    resultContainer.replaceChildren(
      el(
        'section',
        { class: 'card result-card', 'aria-labelledby': 'result-title' },
        el('h2', { class: 'sr-only', id: 'result-title', text: t('result.title') }),
        el(
          'div',
          { class: 'result-summary' },
          el(
            'div',
            { class: 'result-time' },
            createIcon('walk', { size: 22 }),
            el('span', {
              class: 'result-minutes',
              text: t('result.minutes', { n: directions.minutes }),
            }),
          ),
          el('span', { class: 'result-distance', text: formatDistance(directions.totalMeters, t) }),
        ),
        el(
          'ul',
          { class: 'result-endpoints' },
          el(
            'li',
            {},
            el('span', { class: 'route-dot is-start', 'aria-hidden': 'true', text: 'A' }),
            el('span', { class: 'sr-only', text: `${t('route.from')}: ` }),
            nameOf(route.fromId),
          ),
          el(
            'li',
            {},
            el('span', { class: 'route-dot is-end', 'aria-hidden': 'true', text: 'B' }),
            el('span', { class: 'sr-only', text: `${t('route.to')}: ` }),
            nameOf(route.toId),
          ),
        ),
        tags.length ? el('div', { class: 'tag-list' }, tags) : null,
        el('h3', { class: 'section-title', text: t('result.directions') }),
        steps,
        el(
          'div',
          { class: 'result-actions' },
          el(
            'button',
            { class: 'btn btn-secondary', type: 'button', onClick: actions.clearRoute },
            createIcon('close', { size: 16 }),
            t('result.clear'),
          ),
          el(
            'button',
            { class: 'btn btn-secondary', type: 'button', onClick: actions.shareRoute },
            createIcon('link', { size: 16 }),
            t('result.share'),
          ),
        ),
      ),
    );
  }

  function statusCard(icon, tone, title, text) {
    return el(
      'section',
      { class: `card status-card ${tone}`, role: 'status' },
      el('span', { class: 'status-icon', 'aria-hidden': 'true' }, createIcon(icon, { size: 22 })),
      el(
        'div',
        {},
        el('h2', { class: 'status-title', text: title }),
        el('p', { class: 'status-text', text }),
      ),
    );
  }

  function welcomeCard() {
    return el(
      'section',
      { class: 'welcome' },
      el(
        'div',
        { class: 'welcome-art', 'aria-hidden': 'true' },
        createIcon('layersMap', { size: 28 }),
      ),
      el('h2', { class: 'welcome-title', text: t('welcome.title') }),
      el('p', { class: 'welcome-text', text: t('welcome.text') }),
    );
  }

  function tagChip(icon, text) {
    return el('span', { class: 'tag' }, createIcon(icon, { size: 14 }), text);
  }

  // ---------- State subscription ----------

  subscribe((state, changed) => {
    if (changed.includes('lang')) {
      render();
      renderResult();
      return;
    }
    if (changed.includes('from') || changed.includes('to')) syncSelections();
    if (['route', 'routeStatus', 'activeStep'].some((k) => changed.includes(k))) renderResult();
    if (changed.includes('accessible')) {
      const input = panelContainer.querySelector('.switch input');
      if (input) input.checked = state.accessible;
    }
  });

  render();
  renderResult();

  return {
    renderRecent,
    focusFrom: () => fromCombo.focus(),
  };
}

/** Quick "nearest" chips, in display order, with their icons. */
const NEAREST_CHIPS = [
  ['restroom', 'restroom'],
  ['printer', 'printer'],
  ['food', 'restaurant'],
  ['cafe', 'cafe'],
  ['convenience_store', 'convenience_store'],
  ['cafeteria', 'restaurant'],
  ['atm', 'atm'],
  ['bus_stop', 'bus_stop'],
];

function byNumber(a, b) {
  // Buildings without a number go last.
  return (parseInt(a.number, 10) || 999) - (parseInt(b.number, 10) || 999);
}
