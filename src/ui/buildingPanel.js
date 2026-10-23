/**
 * Building information panel.
 *
 * Shows everything known about the selected building: names in both
 * languages, number, category, a photo (or placeholder), description,
 * floors, opening hours, departments with their offices, a floor directory,
 * amenities (with what is not verified yet), the courses held there and the
 * sources of every fact. Buttons set the building as the route start or destination, or zoom
 * the map to it. An item found through search (course, room, department,
 * facility) is highlighted and scrolled into view.
 */
import { getState, setState, subscribe } from '../state.js';
import { getLanguage, localize, t } from '../i18n/index.js';
import { el } from '../utils/dom.js';
import { resolveAssetUrl } from '../map/renderMap.js';
import { createIcon } from './icons.js';
import { reportUrl } from '../config.js';

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
    routeView.hidden = Boolean(building) || getState().infoOpen;
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
        building.number
          ? el('span', {
              class: 'number-badge',
              'data-category': category,
              title: t('building.number', { number: building.number }),
              text: building.number,
            })
          : null,
        el(
          'span',
          { class: 'category-badge', 'data-category': category },
          t(`category.${category}`),
        ),
        building.categoryStatus && building.categoryStatus !== 'verified'
          ? statusTag(building.categoryStatus)
          : null,
      ),
      heading,
      otherName && otherName !== localize(building.name)
        ? el('p', { class: 'building-alt-name', lang: otherLang, text: otherName })
        : null,
    );

    const photo = photoBlock(building, category);

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

    const roomCard = roomCodeCard(building);
    const floors = floorsAbove(building);
    const hours = hoursText(building);
    const facts = el(
      'dl',
      { class: 'facts' },
      building.kind === 'area'
        ? null
        : fact(
            'building',
            t('building.floors'),
            floors ? t('building.floorsValue', { n: floors }) : t('status.unknown'),
            building.floors?.status,
          ),
      fact(
        'clock',
        t('building.hours'),
        hours || t('status.unknown'),
        hours ? building.openingHours?.status : 'unknown',
      ),
    );

    const sections = [];

    if (localize(building.description)) {
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
                {
                  class: `item item-rich${isHighlighted('department', i) ? ' is-highlighted' : ''}`,
                },
                createIcon('users', { size: 16 }),
                el(
                  'div',
                  { class: 'item-body' },
                  department.url
                    ? el('a', {
                        class: 'item-title',
                        href: department.url,
                        target: '_blank',
                        rel: 'noopener',
                        text: localize(department),
                      })
                    : el('span', { class: 'item-title', text: localize(department) }),
                  el('span', {
                    class: 'item-meta',
                    text: [department.floorLabel, localize(department.office), department.phone]
                      .filter(Boolean)
                      .join(' · '),
                  }),
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (building.floorDirectory?.length) {
      sections.push(
        section(
          t('building.directory'),
          el(
            'div',
            { class: 'floor-directory' },
            building.floorDirectory.map((floor, f) =>
              el(
                'div',
                { class: 'floor' },
                el('span', { class: 'floor-label', text: floor.floor ?? '?' }),
                el(
                  'ul',
                  { class: 'floor-items' },
                  floor.items.map((item, i) =>
                    el(
                      'li',
                      {
                        class: `floor-item${isHighlighted('directory', `${f}:${i}`) ? ' is-highlighted' : ''}`,
                      },
                      el('span', { class: 'item-title', text: localize(item) }),
                      el('span', {
                        class: 'item-meta',
                        text: [localize(item.room), item.phone].filter(Boolean).join(' · '),
                      }),
                      item.hours
                        ? el('span', { class: 'item-meta', text: localize(item.hours) })
                        : null,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (building.amenities) sections.push(amenitiesSection(building.amenities));

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

    if (buildingCourses.length) {
      sections.push(
        section(
          t('building.courses'),
          el(
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
          ),
        ),
      );
    }

    if (building.sources?.length) sections.push(sourcesSection(building));
    sections.push(footer(building));

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
        roomCard,
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

  /** A room found by its code ("2남 212호"): wing, floor and how to find it. */
  function roomCodeCard(building) {
    const { highlight } = getState();
    if (highlight?.type !== 'roomCode') return null;
    let room;
    try {
      room = JSON.parse(highlight.value);
    } catch {
      return null;
    }
    if (room.buildingId !== building.id) return null;
    const facts = [
      room.wing ? t(`room.wing.${room.wing}`) : null,
      room.floorLabel ? t('room.floor', { floor: room.floorLabel }) : null,
    ].filter(Boolean);
    return el(
      'div',
      { class: 'room-card is-highlighted', role: 'status' },
      createIcon('door', { size: 20 }),
      el(
        'div',
        { class: 'item-body' },
        el('span', { class: 'item-title', text: t('room.title', { room: room.room }) }),
        facts.length ? el('span', { class: 'item-meta', text: facts.join(' · ') }) : null,
        el('span', { class: 'item-meta', text: t('room.howTo') }),
      ),
    );
  }

  function fact(icon, label, value, status) {
    return el(
      'div',
      { class: 'fact' },
      el('dt', {}, createIcon(icon, { size: 16 }), label),
      status === 'unknown'
        ? el('dd', { class: 'is-unknown', text: t('status.unknown') })
        : el('dd', {}, value, status && status !== 'verified' ? statusTag(status) : null),
    );
  }

  function amenitiesSection(amenities) {
    const known = [];
    const unknown = [];
    for (const key of AMENITY_ORDER) {
      const amenity = amenities[key];
      if (!amenity) continue;
      const detail = amenityDetail(key, amenity);
      if (amenity.status === 'unknown' || detail === null) unknown.push(key);
      else known.push({ key, amenity, detail });
    }
    return section(
      t('building.amenities'),
      known.length
        ? el(
            'ul',
            { class: 'item-list' },
            known.map(({ key, amenity, detail }) =>
              el(
                'li',
                {
                  class: `item item-rich${isHighlighted('amenity', key) ? ' is-highlighted' : ''}`,
                },
                createIcon(AMENITY_ICONS[key], { size: 16 }),
                el(
                  'div',
                  { class: 'item-body' },
                  el(
                    'span',
                    { class: 'item-title' },
                    t(`amenity.${key}`),
                    amenity.status !== 'verified' ? statusTag(amenity.status) : null,
                  ),
                  ...detail.map((line) => el('span', { class: 'item-meta', text: line })),
                ),
              ),
            ),
          )
        : null,
      unknown.length
        ? el('p', {
            class: 'muted unverified',
            text: t('building.unverified', {
              list: unknown.map((key) => t(`amenity.${key}`)).join(', '),
            }),
          })
        : null,
    );
  }

  function sourcesSection(building) {
    const titles = new Map((campus.meta.sources ?? []).map((s) => [s.url, s.title]));
    const byUrl = new Map();
    for (const source of building.sources) {
      if (!byUrl.has(source.url)) byUrl.set(source.url, { ...source, fields: [] });
      byUrl.get(source.url).fields.push(source.field);
    }
    return el(
      'details',
      { class: 'building-sources' },
      el('summary', { text: t('building.sources', { n: byUrl.size }) }),
      el(
        'ul',
        {},
        [...byUrl.values()].map((source) =>
          el(
            'li',
            {},
            el('a', {
              href: source.url,
              target: '_blank',
              rel: 'noopener',
              text: titles.get(source.url) ?? source.url.replace(/^https?:\/\//, ''),
            }),
            el('span', {
              class: 'item-meta',
              text: t('building.sourceMeta', {
                fields: source.fields.join(', '),
                date: source.retrieved,
              }),
            }),
          ),
        ),
      ),
      building.osmNote ? el('p', { class: 'item-meta', text: building.osmNote }) : null,
    );
  }

  /** "Last verified" and the "Report a mistake" link. */
  function footer(building) {
    return el(
      'div',
      { class: 'building-footer' },
      el('span', {
        class: 'muted',
        text: building.lastVerified
          ? t('building.lastVerified', { date: building.lastVerified })
          : t('building.notVerifiedOnSite'),
      }),
      el(
        'a',
        {
          class: 'report-link',
          href: reportUrl(
            t('report.subjectBuilding', { name: building.name.en, id: building.id }),
            reportBody(building),
          ),
          target: '_blank',
          rel: 'noopener',
        },
        createIcon('flag', { size: 14 }),
        t('report.link'),
      ),
    );
  }

  /** Pre-filled report: a short template plus the current data for reference. */
  function reportBody(building) {
    const amenities = Object.entries(building.amenities ?? {})
      .map(([key, value]) => `${key}: ${value.status}`)
      .join(', ');
    const entrances = (building.entrances ?? []).map((id) => {
      const node = campus.nodes.find((n) => n.id === id);
      return `${id} (${node?.status ?? '?'})`;
    });
    return [
      `**Building:** ${building.name.en} / ${building.name.ko} (\`${building.id}\`${building.number ? `, no. ${building.number}` : ''})`,
      '',
      '**What is wrong?**',
      '',
      '',
      '**What should it be? (a source or photo helps)**',
      '',
      '',
      '---',
      'Current data, for reference:',
      `- Category: ${building.category} (${building.categoryStatus ?? '?'})`,
      `- Floors: ${building.floors?.above ?? '?'} (${building.floors?.status ?? '?'})`,
      `- Departments: ${(building.departments ?? []).map((d) => `${d.en} ${d.office?.ko ?? ''}`.trim()).join('; ') || 'none'}`,
      `- Amenities: ${amenities}`,
      `- Entrances: ${entrances.join(', ') || 'none'}`,
      `- Data updated: ${campus.meta.dataUpdated ?? '?'}`,
      `- Page: ${window.location.origin}${window.location.pathname}`,
    ].join('\n');
  }

  function section(title, ...content) {
    return el(
      'section',
      { class: 'building-section' },
      el('h3', { class: 'section-title', text: title }),
      ...content,
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

/** Amenities in display order, with their icons. */
const AMENITY_ORDER = [
  'wifi',
  'food',
  'atm',
  'studySpace',
  'printers',
  'restrooms',
  'elevator',
  'accessibleEntrance',
  'waterFountain',
  'vending',
  'lockers',
];
const AMENITY_ICONS = {
  wifi: 'wifi',
  food: 'restaurant',
  atm: 'atm',
  studySpace: 'lounge',
  printers: 'printer',
  restrooms: 'restroom',
  elevator: 'elevator',
  accessibleEntrance: 'door',
  waterFountain: 'water',
  vending: 'convenience_store',
  lockers: 'lockers',
};

/**
 * Detail lines for a known amenity, or null when nothing is known.
 * @param {string} key
 * @param {object} amenity
 * @returns {string[]|null}
 */
function amenityDetail(key, amenity) {
  if (key === 'wifi') {
    if (amenity.available === null) return null;
    if (!amenity.available) return [t('amenity.none')];
    return [[amenity.networks?.join(', '), localize(amenity.note)].filter(Boolean).join(' · ')];
  }
  if (key === 'food') {
    if (!amenity.places?.length) return null;
    return amenity.places.map((place) =>
      [
        localize(place),
        ...(place.hours ?? []).map((h) => `${localize(h)} ${h.time}`),
        place.status === 'osm' ? t('status.osm') : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  }
  if (key === 'restrooms') {
    if (!amenity.floors?.length) return null;
    return [amenity.floors.join(', ')];
  }
  if ('available' in amenity) {
    if (amenity.available === null) return null;
    return [amenity.available ? t('amenity.yes') : t('amenity.none')];
  }
  if (!amenity.locations?.length) return null;
  return amenity.locations.map((location) => localize(location));
}

/**
 * A small label for data that is not confirmed by an official source.
 * @param {'verified'|'osm'|'estimated'|'unknown'} status
 */
function statusTag(status) {
  return el('span', { class: 'status-tag', 'data-status': status, text: t(`status.${status}`) });
}

/**
 * The building photo with its credit line, or, when there is no photo yet, a
 * fallback card in the category color with the building number and name.
 */
function photoBlock(building, category) {
  const photo = building.photo;
  const src = typeof photo === 'string' ? photo : photo?.src;
  if (!src) {
    return el(
      'div',
      {
        class: 'building-photo is-placeholder',
        'data-category': category,
        role: 'img',
        'aria-label': `${localize(building.name)} — ${t('building.photo')}`,
      },
      el(
        'div',
        { class: 'placeholder-art', 'aria-hidden': 'true' },
        createIcon('building', { size: 40, strokeWidth: 1.4 }),
        building.number ? el('span', { class: 'placeholder-number', text: building.number }) : null,
      ),
      el(
        'div',
        { class: 'placeholder-text', 'aria-hidden': 'true' },
        el('span', { class: 'placeholder-name', text: localize(building.name) }),
        el('span', { class: 'placeholder-note', text: t('building.photo') }),
      ),
    );
  }
  const small = photo?.width && photo.width < 600;
  const credit = photo?.author
    ? el(
        'figcaption',
        { class: 'photo-credit' },
        `${t('building.photoBy')} `,
        photo.sourceUrl
          ? el('a', {
              href: photo.sourceUrl,
              target: '_blank',
              rel: 'noopener',
              text: photo.author,
            })
          : photo.author === 'own work'
            ? t('building.ownWork')
            : photo.author,
        photo.license ? ' · ' : null,
        photo.license
          ? photo.licenseUrl
            ? el('a', {
                href: photo.licenseUrl,
                target: '_blank',
                rel: 'noopener license',
                text: photo.license,
              })
            : photo.license
          : null,
      )
    : null;
  return el(
    'figure',
    { class: 'building-figure' },
    el('img', {
      class: `building-photo${small ? ' is-small' : ''}`,
      src: resolveAssetUrl(src),
      ...(photo?.thumb && !small
        ? {
            srcset: `${resolveAssetUrl(photo.thumb)} 400w, ${resolveAssetUrl(src)} 1200w`,
            sizes: '(max-width: 899.98px) 100vw, 340px',
          }
        : {}),
      alt: localize(building.name),
      loading: 'lazy',
      decoding: 'async',
      ...(photo?.width ? { width: photo.width, height: photo.height } : {}),
    }),
    credit,
  );
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
  return 'status' in hours ? localize(hours.text) : localize(hours);
}
