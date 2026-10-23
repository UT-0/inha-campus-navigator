/**
 * Building, gate and area labels, and their visibility by zoom level.
 *
 * Labels keep a constant on-screen size (they are counter-scaled against the
 * camera zoom). Rules:
 *  - the building number badge is always visible;
 *  - the full name is shown when it fits inside the building at the current
 *    zoom, otherwise the short name if that fits, otherwise nothing;
 *  - hovered, selected and route start/end buildings always show their full
 *    name (with a halo so it stays readable over anything);
 *  - gate and area names appear once the map is zoomed in far enough;
 *  - names never overlap: a simple collision pass keeps the more important
 *    label (emphasized, then bigger buildings, then gates, then areas);
 *  - buildings without an official number get a small dot instead of an
 *    empty badge.
 */
import { svgEl } from '../utils/dom.js';
import { boundsOf, outerRings, polygonCentroid } from '../utils/geometry.js';
import { markerSize } from './renderMap.js';

const NAME_FONT_SIZE = 12;
const AREA_FONT_SIZE = 11;
const BADGE_RADIUS = 10;
/** Gap (px) between the badge and the name. */
const NAME_OFFSET = BADGE_RADIUS + 13;
/** Badge of a building without an official number. */
const DOT_RADIUS = 5;
/** Extra space (px) kept around labels in the collision test. */
const LABEL_GAP = 3;

let measureContext = null;

/**
 * Measures text width in pixels with a canvas, using the app's font.
 * @param {string} text
 * @param {number} fontSize
 * @param {number} [weight=600]
 * @returns {number}
 */
function measureText(text, fontSize, weight = 600) {
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  measureContext.font = `${weight} ${fontSize}px ${family}`;
  return measureContext.measureText(text).width;
}

/**
 * Creates all labels inside `layer`.
 * @param {SVGGElement} layer
 * @param {object} campus
 * @returns {{ update: (view: LabelView) => void, setLanguage: (lang: 'en'|'ko') => void, elements: SVGGElement[] }}
 */
export function createLabels(layer, campus) {
  layer.replaceChildren();
  const buildingLabels = [];
  const otherLabels = [];

  for (const building of campus.buildings) {
    const rings = outerRings(building);
    if (rings.length === 0) continue;
    // Name room is judged on the part that holds the label (the largest one).
    const bounds = boundsOf(largestRing(rings));
    const [x, y] = building.labelPosition ?? centroidPair(largestRing(rings));
    const numbered = Boolean(building.number);
    const nameOffset = numbered ? NAME_OFFSET : DOT_RADIUS + 12;
    const name = svgEl('text', { class: 'label-name', y: nameOffset });
    const group = svgEl(
      'g',
      {
        class: `label label-building${numbered ? '' : ' is-unnumbered'}`,
        'data-id': building.id,
        'data-x': x,
        'data-y': y,
      },
      svgEl('circle', {
        class: 'label-badge',
        r: numbered ? BADGE_RADIUS : DOT_RADIUS,
        'data-category': building.category,
      }),
      numbered
        ? svgEl('text', { class: 'label-number', dy: '0.35em', text: building.number })
        : null,
      name,
    );
    layer.append(group);
    buildingLabels.push({
      building,
      group,
      name,
      nameOffset,
      area: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY),
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      texts: null,
    });
  }

  for (const node of campus.nodes.filter((n) => n.type === 'gate' && n.name)) {
    const text = svgEl('text', { class: 'label-gate', y: 26 });
    const group = svgEl(
      'g',
      { class: 'label label-gate-group', 'data-x': node.x, 'data-y': node.y },
      text,
    );
    layer.append(group);
    otherLabels.push({ item: node, group, text, minZoom: 1.6 });
  }

  for (const area of (campus.areas ?? []).filter(
    (a) => a.name && outerRings(a).length && !a.building,
  )) {
    const ring = largestRing(outerRings(area));
    const center = polygonCentroid(ring);
    const bounds = boundsOf(ring);
    const text = svgEl('text', { class: `label-area label-area-${area.type}`, dy: '0.35em' });
    const group = svgEl(
      'g',
      { class: 'label label-area-group', 'data-x': center.x, 'data-y': center.y },
      text,
    );
    layer.append(group);
    otherLabels.push({
      item: area,
      group,
      text,
      areaWidth: bounds.maxX - bounds.minX,
      minZoom: 1.3,
    });
  }

  let lang = 'en';

  function setLanguage(next) {
    lang = next;
    for (const label of buildingLabels) {
      const full = pick(label.building.name, lang);
      const short = pick(label.building.shortName, lang) || full;
      label.texts = {
        full,
        short,
        fullWidth: measureText(full, NAME_FONT_SIZE),
        shortWidth: measureText(short, NAME_FONT_SIZE),
      };
    }
    for (const label of otherLabels) {
      label.text.textContent = pick(label.item.name, lang);
      label.textWidth = measureText(label.text.textContent, AREA_FONT_SIZE, 500);
    }
  }

  /**
   * @typedef {Object} LabelView
   * @property {number} scale         Camera zoom (screen px per map unit).
   * @property {number} relativeZoom  Zoom relative to the whole-campus view.
   * @property {Set<string>} emphasized Building ids that always show their name.
   */

  /** Repositions labels and decides which names are visible. */
  function update({ scale, relativeZoom, emphasized }) {
    const inverse = 1 / scale;
    const badgeScale = Math.max(0.8, markerSize(scale)) * inverse;
    for (const label of buildingLabels) {
      const { group, name, texts } = label;
      group.setAttribute(
        'transform',
        `translate(${group.dataset.x} ${group.dataset.y}) scale(${badgeScale})`,
      );
      if (!texts) continue;
      const screenW = label.width * scale - 8;
      const screenH = label.height * scale;
      const roomForName = screenH >= label.nameOffset * 2 + 6;
      let text = '';
      let width = 0;
      if (emphasized.has(label.building.id) || (roomForName && texts.fullWidth <= screenW)) {
        text = texts.full;
        width = texts.fullWidth;
      } else if (roomForName && texts.shortWidth <= screenW) {
        text = texts.short;
        width = texts.shortWidth;
      }
      label.wanted = { text, width };
      group.classList.toggle('is-emphasized', emphasized.has(label.building.id));
    }
    for (const label of otherLabels) {
      const { group } = label;
      group.setAttribute(
        'transform',
        `translate(${group.dataset.x} ${group.dataset.y}) scale(${inverse})`,
      );
      const fits = label.areaWidth ? label.textWidth <= label.areaWidth * scale - 10 : true;
      label.wanted = relativeZoom >= label.minZoom && fits;
    }
    resolveCollisions(scale, badgeScale * scale, emphasized);
  }

  /**
   * Hides names that would overlap a more important label. Boxes are in
   * screen pixels relative to the map origin (world × scale), so the camera
   * position doesn't matter. Badges always stay; only names are dropped.
   */
  function resolveCollisions(scale, badgePx, emphasized) {
    const placed = [];
    const overlaps = (box, owner) =>
      placed.some(
        (b) =>
          b.owner !== owner &&
          box.x1 < b.x2 + LABEL_GAP &&
          box.x2 + LABEL_GAP > b.x1 &&
          box.y1 < b.y2 + LABEL_GAP &&
          box.y2 + LABEL_GAP > b.y1,
      );
    const anchor = (label) => [
      Number(label.group.dataset.x) * scale,
      Number(label.group.dataset.y) * scale,
    ];

    // Every badge is an obstacle.
    for (const label of buildingLabels) {
      const [x, y] = anchor(label);
      const r = (label.building.number ? BADGE_RADIUS : DOT_RADIUS) * badgePx;
      placed.push({ x1: x - r, x2: x + r, y1: y - r, y2: y + r, owner: label.building.id });
    }

    const ordered = [...buildingLabels].sort(
      (a, b) =>
        Number(emphasized.has(b.building.id)) - Number(emphasized.has(a.building.id)) ||
        b.area - a.area,
    );
    for (const label of ordered) {
      let { text, width } = label.wanted ?? { text: '' };
      if (text) {
        const [x, y] = anchor(label);
        const top = y + (label.nameOffset - NAME_FONT_SIZE) * badgePx;
        const box = {
          x1: x - (width / 2) * badgePx,
          x2: x + (width / 2) * badgePx,
          y1: top,
          y2: top + (NAME_FONT_SIZE + 4) * badgePx,
        };
        if (!emphasized.has(label.building.id) && overlaps(box, label.building.id)) text = '';
        else placed.push(box);
      }
      if (label.name.textContent !== text) label.name.textContent = text;
    }

    for (const label of otherLabels) {
      let visible = label.wanted;
      if (visible) {
        const [x, y] = anchor(label);
        const offsetY = label.text.getAttribute('y') ? Number(label.text.getAttribute('y')) : 0;
        const half = label.textWidth / 2;
        const box = {
          x1: x - half,
          x2: x + half,
          y1: y + offsetY - AREA_FONT_SIZE,
          y2: y + offsetY + AREA_FONT_SIZE / 2,
        };
        if (overlaps(box)) visible = false;
        else placed.push(box);
      }
      label.group.classList.toggle('is-hidden', !visible);
    }
  }

  return { update, setLanguage, elements: buildingLabels.map((l) => l.group) };
}

function pick(value, lang) {
  if (!value) return '';
  return typeof value === 'string' ? value : (value[lang] ?? value.en ?? '');
}

function centroidPair(polygon) {
  const c = polygonCentroid(polygon);
  return [c.x, c.y];
}

function largestRing(rings) {
  const size = (ring) => {
    const b = boundsOf(ring);
    return (b.maxX - b.minX) * (b.maxY - b.minY);
  };
  return rings.reduce((best, ring) => (size(ring) > size(best) ? ring : best), rings[0]);
}
