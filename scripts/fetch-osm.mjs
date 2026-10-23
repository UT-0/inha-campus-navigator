/**
 * Downloads the raw OpenStreetMap data for the Inha University campus.
 *
 * Source: the main OSM API (api.openstreetmap.org, API 0.6). The Overpass API
 * was unreachable from the build environment, and the campus is small enough
 * for the API's "map" call (everything in a bounding box) to cover it.
 *
 *  1. Fetch the campus boundary (the amenity=university way "인하대학교") and
 *     every OSM feature listed in data-raw/official/buildings.json (some
 *     official buildings, such as the 비룡재 dormitory, lie outside the
 *     boundary drawn in OSM).
 *  2. Expand their combined bounding box by MARGIN_METERS so gates, nearby
 *     bus stops, the subway entrances and surrounding streets are included.
 *  3. Fetch every node, way and relation in that box.
 *
 * Output (committed, so results are traceable):
 *   data-raw/osm/boundary.json  the boundary way with its nodes
 *   data-raw/osm/map.json       everything inside the expanded box
 *   data-raw/osm/meta.json      fetch date, bounding box and request URLs
 *
 * Run: npm run data:fetch-osm
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const API = 'https://api.openstreetmap.org/api/0.6';
/** OSM way of the campus area (amenity=university, name=인하대학교). */
const CAMPUS_WAY_ID = 472447787;
const MARGIN_METERS = 150;
const OUT_DIR = new URL('../data-raw/osm/', import.meta.url);
const HEADERS = {
  'User-Agent': 'inha-campus-navigator/1.0 (student project; data snapshot script)',
};

async function getJson(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function main() {
  const boundaryUrl = `${API}/way/${CAMPUS_WAY_ID}/full.json`;
  console.log(`Fetching campus boundary: ${boundaryUrl}`);
  const boundary = await getJson(boundaryUrl);
  const nodes = boundary.elements.filter((e) => e.type === 'node');
  if (nodes.length === 0) throw new Error('Boundary way has no nodes');

  // Official buildings may extend beyond the OSM campus outline.
  const official = JSON.parse(
    await readFile(new URL('../data-raw/official/buildings.json', import.meta.url), 'utf8'),
  );
  const refs = [...official.buildings, ...official.osmOnly].flatMap((b) => b.osm);
  for (const ref of refs) {
    const feature = await getJson(`${API}/${ref}/full.json`);
    nodes.push(...feature.elements.filter((e) => e.type === 'node'));
  }

  const lats = nodes.map((n) => n.lat);
  const lons = nodes.map((n) => n.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  // Degrees per meter at this latitude.
  const dLat = MARGIN_METERS / 111_320;
  const dLon = MARGIN_METERS / (111_320 * Math.cos((midLat * Math.PI) / 180));
  const bbox = {
    minLon: +(Math.min(...lons) - dLon).toFixed(7),
    minLat: +(Math.min(...lats) - dLat).toFixed(7),
    maxLon: +(Math.max(...lons) + dLon).toFixed(7),
    maxLat: +(Math.max(...lats) + dLat).toFixed(7),
  };

  const mapUrl = `${API}/map.json?bbox=${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  console.log(`Fetching map data: ${mapUrl}`);
  const map = await getJson(mapUrl);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(new URL('boundary.json', OUT_DIR), JSON.stringify(boundary, null, 1));
  await writeFile(new URL('map.json', OUT_DIR), JSON.stringify(map));
  const meta = {
    fetched: new Date().toISOString(),
    source: 'OpenStreetMap API 0.6 (https://api.openstreetmap.org)',
    license: 'ODbL 1.0 — © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)',
    campusWay: `way/${CAMPUS_WAY_ID}`,
    marginMeters: MARGIN_METERS,
    bbox,
    requests: [
      boundaryUrl,
      `${API}/{feature}/full.json for ${refs.length} official buildings`,
      mapUrl,
    ],
    counts: {
      nodes: map.elements.filter((e) => e.type === 'node').length,
      ways: map.elements.filter((e) => e.type === 'way').length,
      relations: map.elements.filter((e) => e.type === 'relation').length,
    },
  };
  await writeFile(new URL('meta.json', OUT_DIR), `${JSON.stringify(meta, null, 2)}\n`);
  console.log('Saved', meta.counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
