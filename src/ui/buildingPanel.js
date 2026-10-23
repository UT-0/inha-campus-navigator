/**
 * Building information panel.
 *
 * Shows everything known about the selected building: names in both
 * languages, number, category, a photo (or placeholder), description,
 * floors, opening hours, departments, facilities, rooms and the courses held
 * there. Buttons set the building as the route start or destination, or zoom
 * the map to it. An item found through search (course, room, department,
 * facility) is highlighted and scrolled into view.
 */
import { getState, setState, subscribe } from '../state.js';
import { getLanguage, localize, t } from '../i18n/index.js';
import { el } from '../utils/dom.js';
import { resolveAssetUrl } from '../map/renderMap.js';
import { createIcon } from './icons.js';

/**
 * @param {Object} options
 * @param {HTMLElement} options.container   The building view element.
 * @param {HTMLElement} options.routeView   The route view, hidden while a building is open.
 * @param {object} options.campus
 * @param {object[]} options.courses
 * @param {{ startHere: (id: string) => void, goHere: (id: string) => void, zoomTo: (id: string) => void }} options.actions
 */
export function createBuildingPanel({ container, routeView, campus, courses, actions }) {
  const buildings = new Map(campus.buildings.map((b) => [b.id, b]));
  let renderedId = null;

  function close() {
    const hadFocus = container.contains(document.activeElement);
    setState({ selectedBuilding: null, highlight: null });
    // Don't leave keyboard focus on a removed element.
    if (hadFocus) document.getElementById('sheet-content')?.focus({ preventScroll: true });
  }

  function isHighlighted(type, value) {
    const { highlight } = getState();
    return highlight?.type === type && highlight.value === String(value);
  }

  function render(focusHeading) {
    const { selectedBuilding } = getState();
    const building = buildings.get(selectedBuilding);
    container.hidden = !building;
    routeView.hidden = Boolean(building);
    renderedId = building?.id ?? null;
    if (!building) {
      container.replaceChildren();
      return;
    }

    const lang = getLanguage();
    const otherLang = lang === 'en' ? 'ko' : 'en';
    const category = building.category ?? 'other';
    const otherName = building.name?.[otherLang];
    const buildingCourses = courses.filter((c) => c.building === building.id);

    const heading = el('h2', {
      class: 'building-name',
      id: 'building-name',
      tabindex: '-1',
      text: localize(building.name),
    });

    const header = el(
      'header',
      { class: 'building-header' },
      el(
        'div',
        { class: 'building-badges' },
        el('span', {
          class: 'number-badge',
          'data-category': category,
          title: t('building.number', { number: building.number ?? '' }),
          text: building.number ?? '',
        }),
        el(
          'span',
          { class: 'category-badge', 'data-category': category },
          t(`category.${category}`),
        ),
      ),
      heading,
      otherName && otherName !== localize(building.name)
        ? el('p', { class: 'building-alt-name', lang: otherLang, text: otherName })
        : null,
    );

    const photo = building.photo
      ? el('img', {
          class: 'building-photo',
          src: resolveAssetUrl(building.photo),
          alt: localize(building.name),
        })
      : el(
          'div',
          {
            class: 'building-photo is-placeholder',
            'data-category': category,
            role: 'img',
            'aria-label': t('building.photo'),
          },
          createIcon('building', { size: 32, strokeWidth: 1.6 }),
          el('span', { text: t('building.photo') }),
        );

    const buttons = el(
      'div',
      { class: 'building-actions' },
      el(
        'button',
        {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: () => actions.startHere(building.id),
        },
        el('span', { class: 'route-dot is-start', 'aria-hidden': 'true', text: 'A' }),
        t('building.startHere'),
      ),
      el(
        'button',
        { class: 'btn btn-primary', type: 'button', onClick: () => actions.goHere(building.id) },
        el('span', { class: 'route-dot is-end', 'aria-hidden': 'true', text: 'B' }),
        t('building.goHere'),
      ),
      el(
        'button',
        {
          class: 'icon-btn building-zoom',
          type: 'button',
          'aria-label': t('building.zoom'),
          title: t('building.zoom'),
          onClick: () => actions.zoomTo(building.id),
        },
        createIcon('target'),
      ),
    );

    const facts = el(
      'dl',
      { class: 'facts' },
      floorsAbove(building)
        ? fact(
            'building',
            t('building.floors'),
            t('building.floorsValue', { n: floorsAbove(building) }),
          )
        : null,
      hoursText(building) ? fact('clock', t('building.hours'), hoursText(building)) : null,
    );

    const sections = [];

    if (building.description) {
      sections.push(
        section(
          t('building.about'),
          el('p', { class: 'building-description', text: localize(building.description) }),
        ),
      );
    }

    if (building.departments?.length) {
      sections.push(
        section(
          t('building.departments'),
          el(
            'ul',
            { class: 'item-list' },
            building.departments.map((department, i) =>
              el(
                'li',
                { class: `item${isHighlighted('department', i) ? ' is-highlighted' : ''}` },
                createIcon('users', { size: 16 }),
                localize(department),
              ),
            ),
          ),
        ),
      );
    }

    if (building.facilities?.length) {
      sections.push(
        section(
          t('building.facilities'),
          el(
            'ul',
            { class: 'chip-list' },
            building.facilities.map((facility) =>
              el(
                'li',
                {
                  class: `chip facility-chip${isHighlighted('facility', facility) ? ' is-highlighted' : ''}`,
                },
                createIcon(facility, { size: 16 }),
                t(`facility.${facility}`),
              ),
            ),
          ),
        ),
      );
    }

    if (building.rooms?.length) {
      sections.push(
        section(
          t('building.rooms'),
          el(
            'ul',
            { class: 'chip-list' },
            building.rooms.map((room) =>
              el(
                'li',
                { class: `chip room-chip${isHighlighted('room', room) ? ' is-highlighted' : ''}` },
                room,
              ),
            ),
          ),
        ),
      );
    }

    sections.push(
      section(
        t('building.courses'),
        buildingCourses.length
          ? el(
              'ul',
              { class: 'course-list' },
              buildingCourses.map((course) =>
                el(
                  'li',
                  {
                    class: `course${isHighlighted('course', course.code) || isHighlighted('room', course.room) ? ' is-highlighted' : ''}`,
                  },
                  el('span', { class: 'course-code', text: course.code }),
                  el('span', { class: 'course-name', text: localize(course.name) }),
                  el('span', {
                    class: 'course-room',
                    text: t('building.courseRoom', { room: course.room }),
                  }),
                ),
              ),
            )
          : el('p', { class: 'muted', text: t('building.noCourses') }),
      ),
    );

    container.replaceChildren(
      el(
        'article',
        { class: 'building-panel', 'aria-labelledby': 'building-name' },
        el(
          'button',
          { class: 'btn btn-ghost btn-sm building-back', type: 'button', onClick: close },
          createIcon('back', { size: 16 }),
          t('building.back'),
        ),
        photo,
        header,
        buttons,
        facts.childElementCount ? facts : null,
        ...sections,
      ),
    );

    if (focusHeading) heading.focus({ preventScroll: true });
    container.closest('.sheet-content')?.scrollTo({ top: 0 });
    // Bring the highlighted search result into view.
    requestAnimationFrame(() => {
      container
        .querySelector('.is-highlighted')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  function fact(icon, label, value) {
    return el(
      'div',
      { class: 'fact' },
      el('dt', {}, createIcon(icon, { size: 16 }), label),
      el('dd', { text: value }),
    );
  }

  function section(title, content) {
    return el(
      'section',
      { class: 'building-section' },
      el('h3', { class: 'section-title', text: title }),
      content,
    );
  }

  subscribe((state, changed) => {
    if (changed.includes('selectedBuilding')) {
      render(Boolean(state.selectedBuilding) && state.selectedBuilding !== renderedId);
    } else if (renderedId && (changed.includes('lang') || changed.includes('highlight'))) {
      render(false);
    }
  });

  // Escape closes the panel.
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  return { close };
}

/** Floors above ground, from the current ({above, …}) or older (number) schema. */
function floorsAbove(building) {
  const floors = building.floors;
  return typeof floors === 'object' && floors !== null ? floors.above : floors;
}

/** Opening hours text, from the current ({text, status}) or older ({en, ko}) schema. */
function hoursText(building) {
  const hours = building.openingHours;
  if (!hours) return '';
  return 'text' in hours ? localize(hours.text) : localize(hours);
}
