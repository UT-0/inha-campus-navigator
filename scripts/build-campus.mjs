/**
 * Builds src/data/campus.json from the raw source snapshots:
 *
 *   data-raw/osm/*.json            OpenStreetMap geometry (scripts/fetch-osm.mjs)
 *   data-raw/official/*.json       facts from the official Inha website, curated by hand
 *   data-raw/official-sources.json URL + retrieval date of every official page used
 *
 * Steps:
 *  1. Project latitude/longitude to meters around the campus centre.
 *  2. Map layers: surrounding land use, campus ground, green areas, water,
 *     sports fields, parking, roads and footpaths (lightly simplified).
 *  3. Campus buildings: the official list, matched to OSM footprints.
 *     Every other building in the area is kept as non-interactive context.
 *
 * Nothing is invented here: names, numbers and categories come from the
 * official list, shapes from OSM, and every field carries a status
 * (verified / osm / estimated / unknown) and its sources.
 *
 * Run: npm run data:build
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createProjection } from '../src/utils/projection.js';
import {
  indexOsm,
  joinRings,
  labelPoint,
  ringArea,
  round,
  simplify,
  simplifyRing,
} from './lib/geo.mjs';
import { buildWalkGraph } from './lib/walk-graph.mjs';
import {
  applyOfficialDetails,
  infoFromDetails,
  writeDescriptions,
} from './lib/official-details.mjs';
import { buildAmenities } from './lib/amenities.mjs';

const ROOT = new URL('../', import.meta.url);
const SIMPLIFY_METERS = 0.5;
const readJson = async (path) => JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const osmMeta = await readJson('data-raw/osm/meta.json');
const osm = indexOsm(await readJson('data-raw/osm/map.json'));
const official = await readJson('data-raw/official/buildings.json');
const sources = (await readJson('data-raw/official-sources.json')).sources;
const sourceById = new Map(sources.map((s) => [s.id, s]));
const CAMPUS_WAY = Number(osmMeta.campusWay.split('/')[1]);
/** Inha Technical College (인하공업전문대학), a separate school: excluded. */
const TECH_COLLEGE_WAY = 568420965;

// ---------------------------------------------------------------------------
// 1. Projection centred on the campus boundary
// ---------------------------------------------------------------------------

const boundaryNodes = osm.ways.get(CAMPUS_WAY).nodes.map((id) => osm.nodes.get(id));
const lats = boundaryNodes.map((n) => n.lat);
const lons = boundaryNodes.map((n) => n.lon);
const center = {
  lat0: +((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(7),
  lon0: +((Math.min(...lons) + Math.max(...lons)) / 2).toFixed(7),
};
const projection = createProjection(center);
const toXY = (node) => {
  const p = projection.project(node.lat, node.lon);
  return [p.x, p.y];
};

const { bbox } = osmMeta;
const corner1 = projection.project(bbox.maxLat, bbox.minLon);
const corner2 = projection.project(bbox.minLat, bbox.maxLon);
const viewBox = [
  Math.floor(corner1.x),
  Math.floor(corner1.y),
  Math.ceil(corner2.x - corner1.x),
  Math.ceil(corner2.y - corner1.y),
];

// ---------------------------------------------------------------------------
// Geometry helpers on OSM references ("way/123", "relation/456")
// ---------------------------------------------------------------------------

function wayPoints(way) {
  return way.nodes
    .map((id) => osm.nodes.get(id))
    .filter(Boolean)
    .map(toXY);
}

/** Closed ring without the repeated last point. */
function ringFromIds(ids) {
  const points = ids
    .map((id) => osm.nodes.get(id))
    .filter(Boolean)
    .map(toXY);
  if (points.length > 1 && ids[0] === ids[ids.length - 1]) points.pop();
  return points;
}

/**
 * Outer rings and holes of a way or multipolygon relation.
 * @param {string} ref e.g. "way/123"
 */
function featureRings(ref) {
  const [type, idText] = ref.split('/');
  const id = Number(idText);
  if (type === 'way') {
    const way = osm.ways.get(id);
    if (!way) throw new Error(`Missing OSM ${ref}`);
    return { outers: [ringFromIds(way.nodes)], holes: [] };
  }
  const relation = osm.relations.get(id);
  if (!relation) throw new Error(`Missing OSM ${ref}`);
  const byRole = (role) =>
    joinRings(
      relation.members
        .filter((m) => m.type === 'way' && (m.role || 'outer') === role)
        .map((m) => osm.ways.get(m.ref)?.nodes)
        .filter(Boolean),
    ).map(ringFromIds);
  return { outers: byRole('outer'), holes: byRole('inner') };
}

const cleanRing = (ring) => simplifyRing(ring, SIMPLIFY_METERS).map(round);

function osmTagsOf(ref) {
  const [type, id] = ref.split('/');
  return (type === 'way' ? osm.ways : osm.relations).get(Number(id))?.tags ?? {};
}

// ---------------------------------------------------------------------------
// 2. Map layers
// ---------------------------------------------------------------------------

/** Land-use and leisure areas drawn under the buildings. */
function classifyArea(tags) {
  if (tags.amenity === 'university' && tags.name === '인하대학교') return 'campus';
  if (tags.amenity === 'university' || tags.amenity === 'college' || tags.amenity === 'school')
    return 'other-campus';
  if (tags.natural === 'water') return 'water';
  if (tags.leisure === 'pitch' || tags.leisure === 'track') return 'pitch';
  if (tags.amenity === 'parking') return 'parking';
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'wood';
  if (
    tags.leisure === 'park' ||
    tags.leisure === 'garden' ||
    tags.landuse === 'grass' ||
    tags.leisure === 'playground'
  )
    return 'green';
  if (tags.place === 'square' || (tags.highway === 'pedestrian' && tags.area === 'yes'))
    return 'plaza';
  if (
    tags.landuse === 'residential' ||
    tags.landuse === 'construction' ||
    tags.landuse === 'commercial'
  )
    return 'urban';
  return null;
}

const usedAsBuilding = new Set(official.buildings.flatMap((b) => b.osm));

const areas = [];
for (const way of osm.ways.values()) {
  const tags = way.tags ?? {};
  if (tags.building || way.nodes[0] !== way.nodes[way.nodes.length - 1]) continue;
  const type = classifyArea(tags);
  if (!type) continue;
  const ring = cleanRing(ringFromIds(way.nodes));
  if (ring.length < 3) continue;
  const area = { id: `a-${way.id}`, type, polygons: [ring], osmId: `way/${way.id}` };
  if (tags.name || tags['name:en'])
    area.name = { ko: tags.name ?? tags['name:en'], en: tags['name:en'] ?? tags.name };
  if (usedAsBuilding.has(`way/${way.id}`)) area.building = true;
  areas.push(area);
}

/** Road and path classes drawn on the map (widths are in map.css / renderMap). */
const ROAD_KIND = {
  motorway: 'major',
  trunk: 'major',
  trunk_link: 'major',
  primary: 'major',
  primary_link: 'major',
  secondary: 'major',
  secondary_link: 'major',
  tertiary: 'medium',
  tertiary_link: 'medium',
  residential: 'minor',
  unclassified: 'minor',
  living_street: 'minor',
  service: 'service',
  pedestrian: 'pedestrian',
  footway: 'footway',
  path: 'footway',
  cycleway: 'footway',
  steps: 'steps',
};

const roads = [];
for (const way of osm.ways.values()) {
  const tags = way.tags ?? {};
  const kind = ROAD_KIND[tags.highway];
  if (!kind || tags.area === 'yes') continue;
  const points = simplify(wayPoints(way), SIMPLIFY_METERS).map(round);
  if (points.length < 2) continue;
  const road = { id: `r-${way.id}`, kind, points };
  if (tags.name) road.name = { ko: tags.name, en: tags['name:en'] ?? tags.name };
  if (tags.tunnel === 'yes' || tags.layer < 0) road.tunnel = true;
  roads.push(road);
}

// ---------------------------------------------------------------------------
// 3. Campus buildings
// ---------------------------------------------------------------------------

/** Categories that follow directly from the official name. */
const CATEGORY_FROM_NAME = new Set([
  'b-7',
  'b-library',
  'b-nabille',
  'b-law',
  'b-hawaii',
  'b-field',
  'b-basketball',
  'b-tennis',
  'b-parking',
  'b-woongbi',
  'b-biryong',
  'b-rotc',
]);

const sourceRef = (id, field) => {
  const s = sourceById.get(id);
  return { field, url: s.url, retrieved: s.retrieved };
};

function emptyAmenities() {
  const unknownList = () => ({ locations: [], status: 'unknown' });
  return {
    wifi: { available: null, networks: [], status: 'unknown' },
    restrooms: { floors: [], accessible: null, status: 'unknown' },
    printers: unknownList(),
    elevator: { available: null, status: 'unknown' },
    accessibleEntrance: { available: null, status: 'unknown' },
    waterFountain: unknownList(),
    vending: unknownList(),
    atm: unknownList(),
    studySpace: unknownList(),
    lockers: unknownList(),
    food: { places: [], status: 'unknown' },
  };
}

function shapeOf(osmRefs) {
  const polygons = [];
  const holes = [];
  for (const ref of osmRefs) {
    const rings = featureRings(ref);
    polygons.push(...rings.outers.map(cleanRing));
    holes.push(...rings.holes.map(cleanRing));
  }
  // Label inside the largest part.
  const largest = [...polygons].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  return { polygons, holes, labelPosition: round(labelPoint(largest, holes)) };
}

/** Floors from OSM building:levels (only when every part agrees). */
function floorsFromOsm(osmRefs) {
  const levels = osmRefs.map((ref) => osmTagsOf(ref)['building:levels']).filter(Boolean);
  if (levels.length === 0) return { above: null, below: null, status: 'unknown' };
  const max = Math.max(...levels.map(Number));
  return { above: max, below: null, status: 'osm', note: 'From OpenStreetMap building:levels' };
}

const buildings = [];
for (const entry of official.buildings) {
  const shape = shapeOf(entry.osm);
  const nameEnStatus = entry.en ? 'verified' : 'osm';
  buildings.push({
    id: entry.id,
    number: entry.number,
    name: { ko: entry.ko, en: entry.en ?? entry.enFromOsm },
    nameStatus: { ko: 'verified', en: nameEnStatus },
    aliases: entry.aliases ?? [],
    roomPrefixes: entry.roomPrefixes ?? [],
    category: entry.category,
    categoryStatus: CATEGORY_FROM_NAME.has(entry.id) ? 'verified' : 'estimated',
    kind: entry.kind ?? 'building',
    polygons: shape.polygons,
    ...(shape.holes.length ? { holes: shape.holes } : {}),
    labelPosition: shape.labelPosition,
    entrances: [],
    osmIds: entry.osm,
    osmMatch: entry.osmMatch,
    ...(entry.osmNote ? { osmNote: entry.osmNote } : {}),
    floors:
      entry.kind === 'area'
        ? { above: null, below: null, status: 'unknown' }
        : floorsFromOsm(entry.osm),
    description: { ko: '', en: '' },
    descriptionStatus: 'unknown',
    floorDirectory: [],
    departments: [],
    amenities: emptyAmenities(),
    openingHours: { text: null, status: 'unknown' },
    photo: { src: null, author: null, license: null, sourceUrl: null },
    sources: [
      sourceRef('inha-buildings-kr', 'name.ko'),
      sourceRef('inha-campusmap-kr', 'number'),
      ...(entry.en ? [sourceRef('inha-buildings-en', 'name.en')] : []),
      {
        field: 'polygons',
        url: `https://www.openstreetmap.org/${entry.osm[0]}`,
        retrieved: osmMeta.fetched.slice(0, 10),
      },
    ],
    lastVerified: null,
  });
}

for (const entry of official.osmOnly) {
  const shape = shapeOf(entry.osm);
  buildings.push({
    id: entry.id,
    number: null,
    name: { ko: entry.ko, en: entry.en ?? entry.ko },
    nameStatus: { ko: 'osm', en: entry.en ? 'osm' : 'unknown' },
    aliases: [],
    roomPrefixes: entry.roomPrefixes ?? [],
    category: entry.category,
    categoryStatus: 'estimated',
    kind: 'building',
    polygons: shape.polygons,
    labelPosition: shape.labelPosition,
    entrances: [],
    osmIds: entry.osm,
    osmMatch: 'name',
    osmNote: entry.note,
    floors: floorsFromOsm(entry.osm),
    description: { ko: '', en: '' },
    descriptionStatus: 'unknown',
    floorDirectory: [],
    departments: [],
    amenities: emptyAmenities(),
    openingHours: { text: null, status: 'unknown' },
    photo: { src: null, author: null, license: null, sourceUrl: null },
    sources: [
      {
        field: 'name',
        url: `https://www.openstreetmap.org/${entry.osm[0]}`,
        retrieved: osmMeta.fetched.slice(0, 10),
      },
    ],
    lastVerified: null,
  });
}

const buildingOsmRefs = new Set(
  [...official.buildings, ...official.osmOnly].flatMap((b) =>
    b.osm.flatMap((ref) => {
      // Also mark the member ways of relations as used.
      const [type, id] = ref.split('/');
      if (type !== 'relation') return [ref];
      return [ref, ...osm.relations.get(Number(id)).members.map((m) => `way/${m.ref}`)];
    }),
  ),
);

/** Every other building in the area: drawn for context, not interactive. */
const context = [];
const campusRing = ringFromIds(osm.ways.get(CAMPUS_WAY).nodes);
for (const way of osm.ways.values()) {
  if (!way.tags?.building || buildingOsmRefs.has(`way/${way.id}`)) continue;
  if (way.nodes[0] !== way.nodes[way.nodes.length - 1]) continue;
  const ring = cleanRing(ringFromIds(way.nodes));
  context.push({ id: `c-${way.id}`, polygons: [ring], osmId: `way/${way.id}` });
}
for (const relation of osm.relations.values()) {
  if (!relation.tags?.building || buildingOsmRefs.has(`relation/${relation.id}`)) continue;
  const rings = featureRings(`relation/${relation.id}`);
  context.push({
    id: `c-r${relation.id}`,
    polygons: rings.outers.map(cleanRing),
    osmId: `relation/${relation.id}`,
  });
}

// ---------------------------------------------------------------------------
// 4. Walking graph (paths, entrances, gates)
// ---------------------------------------------------------------------------

/** OSM way ids of a building's outlines (relation members included). */
function outlineWays(osmRefs) {
  const ids = new Set();
  for (const ref of osmRefs) {
    const [type, id] = ref.split('/');
    if (type === 'way') ids.add(Number(id));
    else
      for (const m of osm.relations.get(Number(id)).members) if (m.type === 'way') ids.add(m.ref);
  }
  return ids;
}

const walk = buildWalkGraph({
  osm,
  toXY,
  buildings: buildings.map((b) => ({
    id: b.id,
    polygons: b.polygons,
    osmWays: outlineWays(b.osmIds),
  })),
  gates: official.gates.map((g) => ({
    id: g.id,
    osmNode: Number(g.osm.split('/')[1]),
    name: { ko: g.ko, en: g.en },
  })),
  campusRing,
});
for (const b of buildings) b.entrances = walk.entrances[b.id] ?? [];

// ---------------------------------------------------------------------------
// 5. Official details (departments, offices, amenities, descriptions)
// ---------------------------------------------------------------------------

const details = JSON.parse(await readFile(new URL('data-raw/official/details.json', ROOT), 'utf8'));
const { unresolved } = applyOfficialDetails({ buildings, details, nodes: walk.nodes, areas });

// ---------------------------------------------------------------------------
// 6. Amenities (OSM points + official facilities), then descriptions
// ---------------------------------------------------------------------------

const amenities = buildAmenities({
  osm,
  toXY,
  buildings,
  campusRing,
  excludeRing: ringFromIds(osm.ways.get(TECH_COLLEGE_WAY).nodes),
  viewBox,
  details,
  osmRetrieved: osmMeta.fetched.slice(0, 10),
});
writeDescriptions({ buildings, nodes: walk.nodes, areas });

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const campus = {
  meta: {
    campusName: { ko: '인하대학교 용현캠퍼스', en: 'Inha University Yonghyeon Campus' },
    address: {
      ko: '22212 인천광역시 미추홀구 인하로 100',
      en: '100 Inha-ro, Michuhol-gu, Incheon 22212',
    },
    viewBox,
    metersPerUnit: 1,
    walkingSpeedMetersPerMin: 75,
    projection: center,
    campusOutline: campusRing.map(round),
    backgroundImage: null,
    dataUpdated: today,
    osmFetched: osmMeta.fetched.slice(0, 10),
    attribution: {
      text: '© OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
      license: 'ODbL 1.0',
    },
    sources: sources.map(({ id, url, title, retrieved }) => ({ id, url, title, retrieved })),
  },
  buildings,
  nodes: walk.nodes,
  edges: walk.edges,
  pois: amenities.pois,
  info: infoFromDetails(details),
  areas,
  roads,
  context,
};

await writeFile(new URL('src/data/campus.json', ROOT), `${JSON.stringify(campus)}\n`);
await writeFile(new URL('src/data/courses.json', ROOT), '[]\n');
// Details for VERIFY.md and DATA-REPORT.md (estimated links, dropped paths…).
await writeFile(
  new URL('data-raw/build-report.json', ROOT),
  `${JSON.stringify({ built: today, graph: walk.report, unresolved, amenities: amenities.report }, null, 2)}\n`,
);
console.log(
  `campus.json: ${buildings.length} buildings, ${areas.length} areas, ${roads.length} roads, ${context.length} context buildings, ${walk.nodes.length} nodes, ${walk.edges.length} edges; viewBox ${viewBox.join(' ')}`,
);
