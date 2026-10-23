/**
 * Campus Info panel: essential campus-wide facts, each from an official
 * source (campus.json → info), and the "About this map" page (purpose, data
 * freshness, what the status labels mean, sources, privacy): emergency numbers, Wi-Fi, the cafeteria,
 * library, health and student support, transport and the shuttle. Topics
 * without a source are listed as "Not yet verified" instead of being left out.
 * Office locations are links that open the building on the map.
 */
import { getState, setState, subscribe } from '../state.js';
import { localize, t } from '../i18n/index.js';
import { el } from '../utils/dom.js';
import { buildPrefixTable, parseRoomCode } from '../utils/roomCode.js';
import { createIcon } from './icons.js';
import { reportUrl } from '../config.js';

/**
 * @param {Object} options
 * @param {HTMLElement} options.container The info view element.
 * @param {HTMLElement} options.routeView The route view, hidden while the panel is open.
 * @param {object} options.campus
 * @param {(id: string, highlight?: object|null) => void} options.openBuilding
 */
export function createInfoPanel({ container, routeView, campus, openBuilding }) {
  const info = campus.info;
  const buildingsById = new Map(campus.buildings.map((b) => [b.id, b]));
  const prefixes = buildPrefixTable(campus.buildings);

  function close() {
    setState({ infoOpen: false });
    document.getElementById('sheet-content')?.focus({ preventScroll: true });
  }

  /** A location such as "학생회관 215호", linked to its building when known. */
  function place(text) {
    const parsed = parseRoomCode(text, prefixes);
    const building = parsed && buildingsById.get(parsed.buildingId);
    if (!building) return el('span', { text });
    return el(
      'button',
      {
        class: 'link-btn',
        type: 'button',
        title: t('info.showBuilding'),
        onClick: () => openBuilding(building.id),
      },
      createIcon('pin', { size: 14 }),
      `${localize(building.name)} · ${text}`,
    );
  }

  const phone = (number) =>
    number
      ? el('a', { class: 'phone', href: `tel:${number.split(/[~,]/)[0].trim()}`, text: number })
      : null;

  function row(label, ...value) {
    return el('div', { class: 'info-row' }, el('dt', { text: label }), el('dd', {}, ...value));
  }

  function section(icon, title, ...content) {
    return el(
      'section',
      { class: 'info-section' },
      el('h3', { class: 'section-title' }, createIcon(icon, { size: 16 }), title),
      ...content,
    );
  }

  function office(item) {
    return el(
      'li',
      { class: 'info-office' },
      el('span', { class: 'item-title', text: localize(item) }),
      place(item.location),
      item.phone ? el('span', { class: 'item-meta' }, phone(item.phone)) : null,
      item.hours ? el('span', { class: 'item-meta', text: localize(item.hours) }) : null,
    );
  }

  function render() {
    const open = getState().infoOpen && Boolean(info);
    container.hidden = !open;
    routeView.hidden = open || Boolean(getState().selectedBuilding);
    if (!open) {
      container.replaceChildren();
      return;
    }
    if (getState().infoPage === 'about') {
      renderAbout();
      return;
    }
    const lang = getState().lang;
    const cafeteriaBuilding = buildingsById.get(info.cafeteria.building);
    const buses = info.transport.buses;

    const heading = el('h2', {
      class: 'building-name',
      id: 'info-title',
      tabindex: '-1',
      text: t('info.title'),
    });

    const sections = [
      section(
        'warning',
        t('info.contacts'),
        el(
          'dl',
          { class: 'info-list' },
          row(t('info.emergency'), phone(info.contacts.emergency24h)),
          row(t('info.mainPhone'), phone(info.contacts.main)),
          row(t('info.address'), localize(info.contacts.address)),
        ),
      ),
      section(
        'wifi',
        t('info.wifi'),
        el(
          'dl',
          { class: 'info-list' },
          row(t('info.network'), el('code', { text: info.wifi.ssid })),
          row(t('info.coverage'), localize(info.wifi.coverage)),
          row(t('info.login'), localize(info.wifi.login)),
          row(
            t('info.help'),
            el(
              'span',
              { class: 'info-stack' },
              info.wifi.help.office,
              place(info.wifi.help.location),
              phone(info.wifi.help.phone),
            ),
          ),
          row(
            t('info.computerLabs'),
            el(
              'span',
              { class: 'info-stack' },
              localize(info.computerLabs.hours),
              el('a', {
                href: info.computerLabs.moreInfo,
                target: '_blank',
                rel: 'noopener',
                text: t('info.moreInfo'),
              }),
            ),
          ),
        ),
      ),
      section(
        'restaurant',
        t('info.food'),
        el(
          'p',
          {},
          cafeteriaBuilding
            ? el(
                'button',
                {
                  class: 'link-btn',
                  type: 'button',
                  onClick: () =>
                    openBuilding(cafeteriaBuilding.id, { type: 'amenity', value: 'food' }),
                },
                createIcon('pin', { size: 14 }),
                `${localize(info.cafeteria)} · ${localize(cafeteriaBuilding.name)}`,
              )
            : localize(info.cafeteria),
        ),
        el(
          'dl',
          { class: 'info-list' },
          info.cafeteria.hours.map((h) => row(localize(h), h.time)),
        ),
      ),
      section(
        'book',
        t('info.library'),
        el(
          'dl',
          { class: 'info-list' },
          row(t('building.hours'), el('span', { class: 'muted', text: t('status.unknown') })),
          row(
            t('info.website'),
            el('a', {
              href: info.library.homepage,
              target: '_blank',
              rel: 'noopener',
              text: info.library.homepage.replace(/^https?:\/\//, '').replace(/\/$/, ''),
            }),
          ),
        ),
      ),
      section(
        'health',
        t('info.health'),
        el('ul', { class: 'info-offices' }, [...info.health, ...info.support].map(office)),
      ),
      section(
        'bus_stop',
        t('info.transport'),
        el(
          'ul',
          { class: 'info-bullets' },
          info.transport.subway.map((line) => el('li', { text: localize(line) })),
        ),
        el(
          'dl',
          { class: 'info-list' },
          row(t('info.busStop'), buses.stop),
          ...['city', 'village', 'regional', 'express', 'otherRegion']
            .filter((type) => buses[type]?.length)
            .map((type) => row(t(`info.bus.${type}`), buses[type].join(', '))),
          ...info.transport.gates
            .filter((gate) => gate.note)
            .map((gate) => row(localize(gate), localize(gate.note))),
        ),
      ),
      section(
        'bus_stop',
        t('info.shuttle'),
        el(
          'dl',
          { class: 'info-list' },
          row(t('info.operates'), localize(info.shuttle.operates)),
          row(t('info.campusStop'), localize(info.shuttle.campusStop)),
          row(t('info.phone'), phone(info.shuttle.phone)),
        ),
      ),
      section(
        'info',
        t('info.unverifiedTitle'),
        el('p', {
          class: 'muted',
          text: t('info.unverified', {
            list: [t('info.lostAndFound'), t('info.security')].join(', '),
          }),
        }),
      ),
    ];

    container.replaceChildren(
      el(
        'article',
        { class: 'info-panel', 'aria-labelledby': 'info-title', lang },
        el(
          'button',
          { class: 'btn btn-ghost btn-sm building-back', type: 'button', onClick: close },
          createIcon('back', { size: 16 }),
          t('building.back'),
        ),
        heading,
        el('p', { class: 'muted info-intro', text: t('info.intro') }),
        ...sections,
        sourcesList(),
        el(
          'div',
          { class: 'building-footer' },
          el(
            'button',
            {
              class: 'link-btn',
              type: 'button',
              onClick: () => setState({ infoPage: 'about' }),
            },
            createIcon('info', { size: 14 }),
            t('about.open'),
          ),
          reportLink(t('report.subjectInfo'), t('report.bodyGeneral')),
        ),
      ),
    );
    heading.focus({ preventScroll: true });
    container.closest('.sheet-content')?.scrollTo({ top: 0 });
  }

  function reportLink(subject, body) {
    return el(
      'a',
      { class: 'report-link', href: reportUrl(subject, body), target: '_blank', rel: 'noopener' },
      createIcon('flag', { size: 14 }),
      t('report.link'),
    );
  }

  /** About this map: purpose, data freshness, what the labels mean, sources, privacy. */
  function renderAbout() {
    const meta = campus.meta;
    const official = (meta.sources ?? []).filter((s) => /inha\.ac\.kr/.test(s.url));
    const photos = campus.buildings.filter((b) => b.photo?.src && b.photo.kind === 'commons');
    const heading = el('h2', {
      class: 'building-name',
      id: 'info-title',
      tabindex: '-1',
      text: t('about.title'),
    });
    const statusRow = (status) =>
      el(
        'li',
        {},
        el('span', { class: 'status-tag', 'data-status': status, text: t(`status.${status}`) }),
        ' ',
        t(`about.status.${status}`),
      );
    container.replaceChildren(
      el(
        'article',
        { class: 'info-panel', 'aria-labelledby': 'info-title' },
        el(
          'button',
          {
            class: 'btn btn-ghost btn-sm building-back',
            type: 'button',
            onClick: () => setState({ infoPage: 'info' }),
          },
          createIcon('back', { size: 16 }),
          t('info.title'),
        ),
        heading,
        el('p', { class: 'info-intro', text: t('about.purpose') }),
        el('p', { class: 'muted', text: t('about.notOfficial') }),
        section(
          'history',
          t('about.freshness'),
          el(
            'dl',
            { class: 'info-list' },
            row(t('about.dataUpdated'), meta.dataUpdated ?? '—'),
            row(t('about.osmFetched'), meta.osmFetched ?? '—'),
            row(
              t('about.verifiedOnSite'),
              t('about.verifiedOnSiteValue', {
                n: campus.buildings.filter((b) => b.lastVerified).length,
                total: campus.buildings.length,
              }),
            ),
          ),
        ),
        section(
          'check',
          t('about.labels'),
          el('p', { class: 'muted', text: t('about.labelsIntro') }),
          el(
            'ul',
            { class: 'about-statuses' },
            ['verified', 'osm', 'estimated', 'unknown'].map(statusRow),
          ),
        ),
        section(
          'layers',
          t('about.sources'),
          el(
            'ul',
            { class: 'info-offices' },
            el(
              'li',
              { class: 'info-office' },
              el('a', {
                href: meta.attribution.url,
                target: '_blank',
                rel: 'noopener',
                text: meta.attribution.text,
              }),
              el('span', {
                class: 'item-meta',
                text: t('about.osm', { license: meta.attribution.license }),
              }),
            ),
            el(
              'li',
              { class: 'info-office' },
              el('a', {
                href: 'https://www.inha.ac.kr/',
                target: '_blank',
                rel: 'noopener',
                text: t('about.officialSite'),
              }),
              el('span', { class: 'item-meta', text: t('about.official', { n: official.length }) }),
            ),
            el(
              'li',
              { class: 'info-office' },
              el('a', {
                href: 'https://commons.wikimedia.org/wiki/Category:Inha_University',
                target: '_blank',
                rel: 'noopener',
                text: 'Wikimedia Commons',
              }),
              el('span', {
                class: 'item-meta',
                text: photos.length
                  ? photos
                      .map((b) => `${localize(b.name)}: ${b.photo.author}, ${b.photo.license}`)
                      .join(' · ')
                  : t('about.noPhotos'),
              }),
            ),
          ),
          el(
            'details',
            { class: 'building-sources' },
            el('summary', { text: t('about.allOfficial', { n: official.length }) }),
            el(
              'ul',
              {},
              official.map((source) =>
                el(
                  'li',
                  {},
                  el('a', {
                    href: source.url,
                    target: '_blank',
                    rel: 'noopener',
                    text: source.title,
                  }),
                  el('span', {
                    class: 'item-meta',
                    text: t('about.retrieved', { date: source.retrieved }),
                  }),
                ),
              ),
            ),
          ),
        ),
        section(
          'target',
          t('about.privacy'),
          el('p', { class: 'muted', text: t('about.privacyText') }),
        ),
        el(
          'div',
          { class: 'building-footer' },
          el('span', { class: 'muted', text: t('about.help') }),
          reportLink(t('report.subjectInfo'), t('report.bodyGeneral')),
        ),
      ),
    );
    heading.focus({ preventScroll: true });
    container.closest('.sheet-content')?.scrollTo({ top: 0 });
  }

  function sourcesList() {
    const titles = new Map((campus.meta.sources ?? []).map((s) => [s.url, s.title]));
    const urls = new Set(
      [
        info.contacts.source,
        ...info.wifi.sources.map((s) => s.url),
        info.computerLabs.source,
        info.cafeteria.source.url,
        ...[...info.health, ...info.support].map((o) => o.source.url),
        info.transport.source,
        info.shuttle.source,
      ].filter(Boolean),
    );
    return el(
      'details',
      { class: 'building-sources' },
      el('summary', { text: t('building.sources', { n: urls.size }) }),
      el(
        'ul',
        {},
        [...urls].map((url) =>
          el(
            'li',
            {},
            el('a', {
              href: url,
              target: '_blank',
              rel: 'noopener',
              text: titles.get(url) ?? url.replace(/^https?:\/\//, ''),
            }),
          ),
        ),
      ),
    );
  }

  subscribe((state, changed) => {
    if (changed.includes('selectedBuilding') && state.selectedBuilding && state.infoOpen) {
      setState({ infoOpen: false });
      return;
    }
    if (
      changed.includes('infoOpen') ||
      (state.infoOpen && (changed.includes('lang') || changed.includes('infoPage')))
    ) {
      render();
    }
  });

  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  return {
    open: (page = 'info') =>
      setState({ selectedBuilding: null, highlight: null, infoOpen: true, infoPage: page }),
    close,
  };
}
