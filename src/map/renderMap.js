/**
 * Draws the campus into the <svg> element.
 *
 * Everything lives inside one "camera" <g> whose transform is controlled by
 * panZoom.js. Layers are drawn bottom to top:
 *   background (surrounding land use, campus ground, reference image, green
 *   areas, water, sports fields, parking)
 *   → roads and footpaths → buildings (context buildings first)
 *   → POI and gate icons → labels → route line → route markers.
 *
 * Coordinates are meters (meta.metersPerUnit = 1). Colors come from CSS
 * custom properties (see map.css), so the map follows the light/dark theme.
 */
import { svgEl } from '../utils/dom.js';
import { outerRings, shapeBounds } from '../utils/geometry.js';
import { ICON_PATHS } from '../ui/icons.js';

/** Order in which area types are painted (later = on top). */
const AREA_ORDER = [
  'urban',
  'other-campus',
  'campus',
  'ground',
  'wood',
  'green',
  'water',
  'pitch',
  'parking',
  'plaza',
];

/** Road classes, drawn bottom to top, with their width in meters. */
export const ROAD_WIDTHS = {
  footway: 2.2,
  steps: 2.2,
  pedestrian: 4,
  service: 4.5,
  minor: 6,
  medium: 9,
  major: 13,
};

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
 * @param {SVGSVGElement|SVGGElement} svg
 * @param {object} campus Parsed campus.json.
 * @returns {MapView}
 */
export function renderMap(svg, campus) {
  const [vx, vy, vw, vh] = campus.meta.viewBox;
  const worldBounds = { minX: vx, minY: vy, maxX: vx + vw, maxY: vy + vh };

  svg.querySelector('.camera')?.remove();
  const camera = svgEl('g', { class: 'camera' });
  const layers = {};
  for (const name of [
    'background',
    'roads',
    'paths',
    'context',
    'buildings',
    'pois',
    'labels',
    'route',
    'markers',
    'location',
  ]) {
    layers[name] = svgEl('g', { class: `layer layer-${name}` });
    camera.append(layers[name]);
  }
  svg.append(camera);

  drawBackground(layers.background, campus, worldBounds);
  drawRoads(layers.roads, campus);
  drawPaths(layers.paths, campus);
  drawContext(layers.context, campus);
  const buildingEls = drawBuildings(layers.buildings, campus);
  const scaledEls = drawPois(layers.pois, campus);

  return { svg, camera, layers, buildingEls, scaledEls, worldBounds };
}

/** SVG path data for a set of rings (holes cut out with the even-odd rule). */
export function ringsPath(rings) {
  return rings
    .filter((ring) => ring.length >= 3)
    .map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join('L')}Z`)
    .join('');
}

/**
 * Background: land use around the campus, the campus ground, the optional
 * reference image, then green areas, water, sports fields and parking.
 */
function drawBackground(layer, campus, world) {
  const areas = (campus.areas ?? [])
    .filter((a) => outerRings(a).length > 0 && !a.building)
    .sort((a, b) => AREA_ORDER.indexOf(a.type) - AREA_ORDER.indexOf(b.type));
  const groundTypes = new Set(['urban', 'other-campus', 'campus', 'ground']);

  // Older data has no campus outline: treat the whole map as ground.
  if (!areas.some((a) => a.type === 'campus' || a.type === 'ground')) {
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
  for (const area of areas.filter((a) => groundTypes.has(a.type))) layer.append(areaShape(area));

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

  for (const area of areas.filter((a) => !groundTypes.has(a.type))) layer.append(areaShape(area));
}

function areaShape(area) {
  return svgEl('path', {
    class: `area area-${area.type ?? 'green'}`,
    d: ringsPath([...outerRings(area), ...(area.holes ?? [])]),
    'fill-rule': 'evenodd',
    'data-id': area.id,
  });
}

/**
 * Roads and footpaths from the map data: a wider casing under a lighter
 * fill. Widths are real meters, so roads scale naturally with the map.
 */
function drawRoads(layer, campus) {
  const roads = campus.roads ?? [];
  if (roads.length === 0) return;
  const kinds = Object.keys(ROAD_WIDTHS);
  const sorted = [...roads].sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  const casing = svgEl('g', { class: 'roads-casing' });
  const fill = svgEl('g', { class: 'roads-fill' });
  for (const road of sorted) {
    const width = ROAD_WIDTHS[road.kind] ?? 3;
    const points = road.points.map(([x, y]) => `${x},${y}`).join(' ');
    casing.append(
      svgEl('polyline', {
        class: `road-casing road-${road.kind}`,
        points,
        'stroke-width': width + 1.6,
      }),
    );
    fill.append(
      svgEl('polyline', {
        class: `road-fill road-${road.kind}${road.tunnel ? ' is-tunnel' : ''}`,
        points,
        'stroke-width': width,
        'data-id': road.id,
      }),
    );
  }
  layer.append(casing, fill);
}

/**
 * Walkway edges of the routing graph. With real map data the roads layer
 * already shows every path, so only estimated links (gaps we bridged, or
 * entrance connections) and stairs are drawn here; older data without a
 * roads layer draws every edge.
 */
function drawPaths(layer, campus) {
  const nodes = new Map(campus.nodes.map((n) => [n.id, n]));
  const hasRoads = (campus.roads ?? []).length > 0;
  const casing = svgEl('g', { class: 'paths-casing' });
  const fill = svgEl('g', { class: 'paths-fill' });
  const extras = svgEl('g', { class: 'paths-extras' });
  for (const edge of campus.edges) {
    const points = edgePoints(edge, nodes);
    if (points.length < 2) continue;
    const attr = { points: points.map(([x, y]) => `${x},${y}`).join(' ') };
    if (edge.stairs) extras.append(svgEl('polyline', { ...attr, class: 'path-stairs' }));
    if (hasRoads) {
      if (edge.status === 'estimated') {
        extras.append(svgEl('polyline', { ...attr, class: 'path-estimated' }));
      }
      continue;
    }
    casing.append(svgEl('polyline', { ...attr, class: 'path-casing' }));
    fill.append(
      svgEl('polyline', { ...attr, class: `path-fill${edge.covered ? ' is-covered' : ''}` }),
    );
  }
  layer.append(casing, fill, extras);
}

/**
 * Full geometry of an edge: its stored polyline, or a straight line.
 * @param {object} edge
 * @param {Map<string, {x:number,y:number}>} nodes
 * @returns {number[][]}
 */
export function edgePoints(edge, nodes) {
  if (Array.isArray(edge.geometry) && edge.geometry.length >= 2) return edge.geometry;
  const a = nodes.get(edge.from);
  const b = nodes.get(edge.to);
  return a && b
    ? [
        [a.x, a.y],
        [b.x, b.y],
      ]
    : [];
}

/** Buildings that are not part of the app (neighbourhood, other schools). */
function drawContext(layer, campus) {
  const parts = (campus.context ?? []).map((item) => ringsPath(outerRings(item))).join('');
  if (parts) layer.append(svgEl('path', { class: 'context-building', d: parts }));
}

/** Buildings: a focusable group per building with its shape. */
function drawBuildings(layer, campus) {
  const buildingEls = new Map();
  for (const building of campus.buildings) {
    const rings = outerRings(building);
    if (rings.length === 0) continue;
    const group = svgEl(
      'g',
      {
        class: `building${building.kind === 'area' ? ' is-area' : ''}`,
        'data-id': building.id,
        'data-category': building.category ?? 'other',
        role: 'button',
        tabindex: '0',
      },
      svgEl('path', {
        class: 'building-shape',
        d: ringsPath([...rings, ...(building.holes ?? [])]),
        'fill-rule': 'evenodd',
      }),
    );
    layer.append(group);
    buildingEls.set(building.id, group);
  }
  return buildingEls;
}

/**
 * POIs and gates: round icon badges that keep a constant on-screen size
 * (the camera's zoom is cancelled by a counter-scale, see `updateScaledElements`).
 *
 * Outdoor POIs are drawn at their real location. Amenities inside a building
 * are not drawn at exact points: each building gets one badge per group
 * (food, money…) in a row to the right of its number badge.
 */
function drawPois(layer, campus) {
  const scaled = [];
  const badge = (attrs, icon, offsetX = 0, offsetY = 0) => {
    const group = svgEl(
      'g',
      attrs,
      svgEl(
        'g',
        { class: 'poi-body', transform: `translate(${offsetX} ${offsetY})` },
        svgEl('circle', { class: 'poi-bg', r: 11 }),
        svgEl('g', {
          class: 'poi-icon',
          transform: 'translate(-7 -7) scale(0.5833)',
          html: ICON_PATHS[icon] ?? ICON_PATHS.info,
        }),
      ),
    );
    layer.append(group);
    scaled.push(group);
  };

  const pois = (campus.pois ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  for (const poi of pois.filter((p) => !p.indoor)) {
    badge(
      {
        class: 'poi poi-poi',
        'data-type': poi.type,
        'data-group': poi.group ?? '',
        'data-id': poi.id,
        'data-x': poi.x,
        'data-y': poi.y,
        ...(poi.landmark ? { 'data-landmark': '' } : {}),
        ...(poi.minZoom ? { 'data-min-zoom': poi.minZoom } : {}),
      },
      poi.icon ?? poi.type,
    );
  }

  // Indoor amenities: one badge per building and group, in a centred row.
  const buildingsById = new Map(campus.buildings.map((b) => [b.id, b]));
  const byBuilding = new Map();
  for (const poi of pois.filter((p) => p.indoor && buildingsById.has(p.buildingId))) {
    if (!byBuilding.has(poi.buildingId)) byBuilding.set(poi.buildingId, new Map());
    const groups = byBuilding.get(poi.buildingId);
    if (!groups.has(poi.group)) groups.set(poi.group, []);
    groups.get(poi.group).push(poi);
  }
  for (const [buildingId, groups] of byBuilding) {
    const [x, y] = buildingsById.get(buildingId).labelPosition;
    const list = [...groups.entries()];
    list.forEach(([group, items], i) => {
      badge(
        {
          class: 'poi poi-indoor',
          'data-type': items[0].type,
          'data-group': group,
          'data-building': buildingId,
          'data-ids': items.map((p) => p.id).join(' '),
          'data-x': x,
          'data-y': y,
        },
        GROUP_ICONS[group] ?? items[0].type,
        // In a row to the right of the number badge, clear of the name below it.
        24 + i * 24,
        0,
      );
    });
  }

  for (const gate of campus.nodes.filter((n) => n.type === 'gate')) {
    badge(
      {
        class: 'poi poi-gate',
        'data-type': 'gate',
        'data-id': gate.id,
        'data-x': gate.x,
        'data-y': gate.y,
      },
      'gate',
    );
  }
  return scaled;
}

/** Icon of an indoor amenity badge, by group. */
const GROUP_ICONS = {
  food: 'restaurant',
  restroom: 'restroom',
  printing: 'printer',
  money: 'atm',
  transport: 'bus_stop',
  health: 'health',
  study: 'lounge',
  services: 'info',
};

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
 * Bounding box of one building's shape.
 * @param {object} building
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function buildingBounds(building) {
  return shapeBounds(building);
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
