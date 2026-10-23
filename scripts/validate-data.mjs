/**
 * Checks src/data/campus.json (run with `npm run validate`):
 *
 *  1. every building has an id, a number, both names, at least one polygon
 *     and one entrance, and a description in both languages;
 *  2. every entrance is on the walking graph;
 *  3. the graph is one connected network;
 *  4. a route exists between every pair of buildings (all pairs);
 *  5. no amenity sits outside the campus by mistake (transport stops just
 *     outside the gates are expected);
 *  6. every fact marked "verified" has a source;
 *  7. every photo file exists and has attribution.
 *
 * Errors make the command fail; warnings are printed for the record (e.g.
 * buildings that have no official number). Also used by the tests.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildGraph, connectedComponents, validateCampus } from '../src/routing/graph.js';
import { createRouter } from '../src/routing/router.js';
import { outerRings, pointInPolygon } from '../src/utils/geometry.js';

const ROOT = new URL('../', import.meta.url);

/**
 * @param {object} campus
 * @param {{publicDir?: URL}} [options]
 * @returns {{errors: string[], warnings: string[], stats: object}}
 */
export function validateData(campus, { publicDir = new URL('public/', ROOT) } = {}) {
  const errors = [];
  const warnings = [];
  const nodes = new Map(campus.nodes.map((n) => [n.id, n]));

  // 1. Buildings are complete.
  const ids = new Set();
  for (const b of campus.buildings) {
    const where = `building ${b.id ?? '(no id)'}`;
    if (!b.id) errors.push(`${where}: missing id`);
    if (ids.has(b.id)) errors.push(`${where}: duplicate id`);
    ids.add(b.id);
    if (!b.number) warnings.push(`${where}: no official building number (${b.name?.ko})`);
    if (!b.name?.ko || !b.name?.en) errors.push(`${where}: needs a Korean and an English name`);
    if (outerRings(b).length === 0) errors.push(`${where}: no polygon`);
    if (!(b.entrances ?? []).length) errors.push(`${where}: no entrance`);
    if (!b.description?.ko || !b.description?.en) {
      errors.push(`${where}: needs a description in both languages`);
    }
  }

  // 2. Entrances are on the graph, and 3. the graph is connected.
  for (const b of campus.buildings) {
    for (const id of b.entrances ?? []) {
      const node = nodes.get(id);
      if (!node) errors.push(`building ${b.id}: entrance ${id} does not exist`);
      else if (!campus.edges.some((e) => e.from === id || e.to === id)) {
        errors.push(`building ${b.id}: entrance ${id} is not connected to any path`);
      }
    }
  }
  const graph = buildGraph(campus);
  const components = connectedComponents(graph);
  if (components.length > 1) {
    const sizes = components.map((c) => c.length).sort((a, b) => b - a);
    errors.push(
      `walking graph has ${components.length} separate parts (sizes ${sizes.join(', ')})`,
    );
  }
  for (const problem of validateCampus(campus)) {
    (problem.level === 'error' ? errors : warnings).push(problem.message);
  }

  // 4. Every pair of buildings has a route.
  const router = createRouter(campus);
  let pairs = 0;
  for (const a of campus.buildings) {
    for (const b of campus.buildings) {
      if (a.id >= b.id) continue;
      pairs++;
      const { status } = router.findRoute(a.id, b.id);
      if (status !== 'ok' && status !== 'same')
        errors.push(`no route ${a.id} → ${b.id} (${status})`);
    }
  }

  // 5. Amenities are on campus.
  const campusRing = campus.meta.campusOutline;
  for (const poi of campus.pois ?? []) {
    if (poi.group === 'transport') continue;
    // Inside an Inha building counts as on campus (the dormitories lie
    // outside the OpenStreetMap campus outline).
    const host = poi.indoor && campus.buildings.some((b) => b.id === poi.buildingId);
    const inside = host || (campusRing ? pointInPolygon({ x: poi.x, y: poi.y }, campusRing) : true);
    if (!inside) errors.push(`place ${poi.id} (${poi.type}) is outside the campus`);
    if (poi.indoor && !campus.buildings.some((b) => b.id === poi.buildingId)) {
      errors.push(`place ${poi.id} is inside unknown building ${poi.buildingId}`);
    }
  }

  // 6. Verified facts have sources.
  for (const b of campus.buildings) {
    const fields = new Set((b.sources ?? []).map((s) => s.field));
    const has = (...names) => names.some((n) => fields.has(n));
    const need = (ok, what) => {
      if (!ok) errors.push(`building ${b.id}: ${what} is "verified" but has no source`);
    };
    if (b.nameStatus?.ko === 'verified') need(has('name.ko'), 'name.ko');
    if (b.nameStatus?.en === 'verified') need(has('name.en'), 'name.en');
    if (b.categoryStatus === 'verified') need(has('name.ko', 'departments'), 'category');
    if (b.floors?.status === 'verified') need(has('floors') || b.lastVerified, 'floors');
    if (b.openingHours?.status === 'verified') {
      need(has('openingHours') || b.lastVerified, 'opening hours');
    }
    if ((b.departments ?? []).some((d) => d.status === 'verified')) {
      need(has('departments'), 'departments');
    }
    if (b.floorDirectory.some((f) => f.items.some((i) => i.status === 'verified'))) {
      need(has('floorDirectory', 'departments') || b.lastVerified, 'floor directory');
    }
    for (const [key, amenity] of Object.entries(b.amenities ?? {})) {
      if (amenity.status !== 'verified') continue;
      const ok =
        has(`amenities.${key}`) ||
        (key === 'studySpace' && has('floorDirectory')) ||
        Boolean(b.lastVerified);
      need(ok, `amenities.${key}`);
    }
    if (b.descriptionStatus === 'verified') {
      need(has('departments', 'floorDirectory', 'amenities.atm'), 'description');
    }
  }
  for (const poi of campus.pois ?? []) {
    if (poi.status === 'verified' && !poi.source?.url) {
      errors.push(`place ${poi.id}: "verified" but has no source`);
    }
  }
  for (const [topic, value] of Object.entries(campus.info ?? {})) {
    const sourced =
      value?.status === 'unknown' ||
      value?.source ||
      value?.sources?.length ||
      (Array.isArray(value) && value.every((v) => v.source));
    if (!sourced) errors.push(`info.${topic}: no source`);
  }

  // 7. Photos exist and are credited.
  for (const b of campus.buildings) {
    const photo = b.photo;
    if (!photo?.src) continue;
    for (const file of [photo.src, photo.thumb].filter(Boolean)) {
      if (!existsSync(new URL(file, publicDir))) errors.push(`building ${b.id}: missing ${file}`);
    }
    if (!photo.author) errors.push(`building ${b.id}: photo has no author`);
    if (photo.kind !== 'own' && (!photo.license || !photo.sourceUrl)) {
      errors.push(`building ${b.id}: photo needs a license and a source page`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      buildings: campus.buildings.length,
      nodes: campus.nodes.length,
      edges: campus.edges.length,
      places: (campus.pois ?? []).length,
      routePairs: pairs,
      graphParts: components.length,
    },
  };
}

// Command line: `node scripts/validate-data.mjs`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const campus = JSON.parse(await readFile(new URL('src/data/campus.json', ROOT), 'utf8'));
  const { errors, warnings, stats } = validateData(campus);
  console.log(
    `Checked ${stats.buildings} buildings, ${stats.nodes} nodes, ${stats.edges} paths, ` +
      `${stats.places} places; ${stats.routePairs} building pairs routed; ` +
      `graph in ${stats.graphParts} part(s).`,
  );
  for (const w of warnings) console.log(`  warning: ${w}`);
  for (const e of errors) console.log(`  ERROR: ${e}`);
  console.log(errors.length ? `✗ ${errors.length} error(s)` : '✓ No errors');
  if (errors.length) process.exitCode = 1;
}
