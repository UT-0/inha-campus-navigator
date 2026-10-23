/**
 * Draws the campus into the <svg> element.
 *
 * Everything lives inside one "camera" <g> whose transform is controlled by
 * panZoom.js. Layers are drawn bottom to top:
 *   background (reference image, ground, water, plazas, green areas)
 *   → walkable paths → buildings → POI and gate icons → labels
 *   → route line → route markers.
 *
 * Colors come from CSS custom properties (see map.css), so the map follows
 * the light/dark theme automatically.
 */
import { svgEl } from '../utils/dom.js';
import { boundsOf } from '../utils/geometry.js';
import { ICON_PATHS } from '../ui/icons.js';

/** Order in which area types are painted above the ground (later = on top). */
const AREA_ORDER = ['water', 'plaza', 'green'];

/**
 * @typedef {Object} MapView
 * @property {SVGSVGElement} svg
 * @property {SVGGElement} camera                 Group transformed by pan/zoom.
 * @property {Record<string, SVGGElement>} layers Named layer groups.
 * @property {Map<string, SVGGElement>} buildingEls Building groups by id.
 * @property {SVGGElement[]} scaledEls            Elements that keep a constant screen size.
 * @property {{minX:number,minY:number,maxX:number,maxY:number}} worldBounds
 */

/**
 * Renders the campus. Calling it again replaces the previous drawing.
 * @param {SVGSVGElement} svg
 * @param {object} campus Parsed campus.json.
 * @returns {MapView}
 */
export function renderMap(svg, campus) {
  const [vx, vy, vw, vh] = campus.meta.viewBox;
  const worldBounds = { minX: vx, minY: vy, maxX: vx + vw, maxY: vy + vh };

  svg.querySelector('.camera')?.remove();
  const camera = svgEl('g', { class: 'camera' });
  const layers = {};
  for (const name of ['background', 'paths', 'buildings', 'pois', 'labels', 'route', 'markers']) {
    layers[name] = svgEl('g', { class: `layer layer-${name}` });
    camera.append(layers[name]);
  }
  svg.append(camera);

  drawBackground(layers.background, campus, worldBounds);
  drawPaths(layers.paths, campus);
  const buildingEls = drawBuildings(layers.buildings, campus);
  const scaledEls = drawPois(layers.pois, campus);

  return { svg, camera, layers, buildingEls, scaledEls, worldBounds };
}

/**
 * Background: the ground, then the optional reference image (so it is not
 * hidden by the ground), then water, plazas and green areas.
 */
function drawBackground(layer, campus, world) {
  const areas = (campus.areas ?? []).filter(
    (a) => Array.isArray(a.polygon) && a.polygon.length >= 3,
  );
  const ground = areas.filter((a) => a.type === 'ground');
  const others = areas
    .filter((a) => a.type !== 'ground')
    .sort((a, b) => AREA_ORDER.indexOf(a.type) - AREA_ORDER.indexOf(b.type));

  // If the data has no explicit ground, draw one covering the whole map.
  if (ground.length === 0) {
    layer.append(
      svgEl('rect', {
        class: 'area area-ground',
        x: world.minX,
        y: world.minY,
        width: world.maxX - world.minX,
        height: world.maxY - world.minY,
      }),
    );
  }
  for (const area of ground) layer.append(areaShape(area));

  const image = campus.meta.backgroundImage;
  if (image) {
    layer.append(
      svgEl('image', {
        class: 'map-reference',
        href: resolveAssetUrl(image),
        x: world.minX,
        y: world.minY,
        width: world.maxX - world.minX,
        height: world.maxY - world.minY,
        preserveAspectRatio: 'none',
      }),
    );
  }

  for (const area of others) layer.append(areaShape(area));
}

function areaShape(area) {
  return svgEl('polygon', {
    class: `area area-${area.type ?? 'green'}`,
    points: pointsAttr(area.polygon),
    'data-id': area.id,
  });
}

/**
 * Walkways: a wider "casing" line under a lighter fill line gives soft,
 * rounded paths. Stairs get a step pattern overlay; covered walkways a tint.
 */
function drawPaths(layer, campus) {
  const nodes = new Map(campus.nodes.map((n) => [n.id, n]));
  const casing = svgEl('g', { class: 'paths-casing' });
  const fill = svgEl('g', { class: 'paths-fill' });
  const extras = svgEl('g', { class: 'paths-extras' });
  for (const edge of campus.edges) {
    const a = nodes.get(edge.from);
    const b = nodes.get(edge.to);
    if (!a || !b) continue;
    const coords = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    casing.append(svgEl('line', { ...coords, class: 'path-casing' }));
    fill.append(
      svgEl('line', { ...coords, class: `path-fill${edge.covered ? ' is-covered' : ''}` }),
    );
    if (edge.stairs) extras.append(svgEl('line', { ...coords, class: 'path-stairs' }));
  }
  layer.append(casing, fill, extras);
}

/** Buildings: a focusable group per building with its polygon. */
function drawBuildings(layer, campus) {
  const buildingEls = new Map();
  for (const building of campus.buildings) {
    if (!Array.isArray(building.polygon) || building.polygon.length < 3) continue;
    const group = svgEl(
      'g',
      {
        class: 'building',
        'data-id': building.id,
        'data-category': building.category ?? 'other',
        role: 'button',
        tabindex: '0',
      },
      svgEl('polygon', { class: 'building-shape', points: pointsAttr(building.polygon) }),
    );
    layer.append(group);
    buildingEls.set(building.id, group);
  }
  return buildingEls;
}

/**
 * POIs and gates: round icon badges that keep a constant on-screen size
 * (the camera's zoom is cancelled by a counter-scale, see `updateScaledElements`).
 */
function drawPois(layer, campus) {
  const scaled = [];
  const items = [
    ...(campus.pois ?? []).map((p) => ({ ...p, kind: 'poi' })),
    ...campus.nodes
      .filter((n) => n.type === 'gate')
      .map((n) => ({ ...n, type: 'gate', kind: 'gate' })),
  ];
  for (const item of items) {
    const group = svgEl(
      'g',
      {
        class: `poi poi-${item.kind}`,
        'data-type': item.type,
        'data-id': item.id,
        'data-x': item.x,
        'data-y': item.y,
      },
      svgEl('circle', { class: 'poi-bg', r: 11 }),
      svgEl('g', {
        class: 'poi-icon',
        transform: 'translate(-7 -7) scale(0.5833)',
        html: ICON_PATHS[item.type] ?? ICON_PATHS.info,
      }),
    );
    layer.append(group);
    scaled.push(group);
  }
  return scaled;
}

/**
 * How large markers are drawn at a given zoom: full size normally, shrinking
 * to 60% when zoomed far out (e.g. the whole campus on a phone) to avoid clutter.
 * @param {number} scale Camera zoom (screen px per map unit).
 * @returns {number}
 */
export function markerSize(scale) {
  return Math.min(1, Math.max(0.6, scale / 0.5));
}

/**
 * Applies a counter-scale so the given elements keep the same pixel size at
 * every zoom level. Each element stores its world anchor in data-x / data-y.
 * @param {SVGGElement[]} elements
 * @param {number} scale Current camera zoom (screen px per map unit).
 */
export function updateScaledElements(elements, scale) {
  const inverse = markerSize(scale) / scale;
  for (const element of elements) {
    element.setAttribute(
      'transform',
      `translate(${element.dataset.x} ${element.dataset.y}) scale(${inverse})`,
    );
  }
}

/**
 * Bounding box of one building's polygon.
 * @param {object} building
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function buildingBounds(building) {
  return boundsOf(building.polygon);
}

/** Converts [[x, y], ...] into an SVG points attribute. */
function pointsAttr(polygon) {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * Resolves a path from campus.json (e.g. "campus-map-reference.png", a file
 * in /public) against Vite's base URL, so it also works on GitHub Pages.
 * @param {string} path
 * @returns {string}
 */
export function resolveAssetUrl(path) {
  if (/^(data:|blob:|https?:)/.test(path)) return path;
  const base = import.meta.env.BASE_URL;
  if (path.startsWith(base)) return path;
  return `${base}${path.replace(/^\//, '')}`;
}
