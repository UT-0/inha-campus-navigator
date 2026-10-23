/**
 * Writes two reports from src/data/campus.json and data-raw/build-report.json
 * (run with `npm run reports` after `npm run data:build`):
 *
 *  - VERIFY.md: a printable checklist for checking the data on campus,
 *    ordered as a walking route — estimated entrances, unknown amenities
 *    per building, matches to confirm, missing photos — followed by path
 *    and source issues that need a look.
 *  - DATA-REPORT.md: counts, how much of the data is verified / from OSM /
 *    estimated / unknown, and every source used.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { walkingOrder } from './lib/walking-order.mjs';
import { shapeCentroid } from '../src/utils/geometry.js';

const ROOT = new URL('../', import.meta.url);
const campus = JSON.parse(await readFile(new URL('src/data/campus.json', ROOT), 'utf8'));
const report = JSON.parse(await readFile(new URL('data-raw/build-report.json', ROOT), 'utf8'));
const nodes = new Map(campus.nodes.map((n) => [n.id, n]));
const byId = new Map(campus.buildings.map((b) => [b.id, b]));

const name = (b) =>
  `${b.number ? `${b.number}. ` : ''}${b.name.ko}${b.name.en !== b.name.ko ? ` (${b.name.en})` : ''}`;
const SIDES = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
];
/** Which side of the building a point is on ("east side"). */
function side(building, point) {
  const c = shapeCentroid(building);
  const bearing = (Math.atan2(point.x - c.x, -(point.y - c.y)) * 180) / Math.PI;
  return SIDES[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

const AMENITY_LABELS = {
  wifi: 'Wi-Fi works inside',
  restrooms: 'Restrooms: which floors? accessible?',
  printers: 'Printers / copy machines: where?',
  elevator: 'Elevator?',
  accessibleEntrance: 'Step-free entrance? which one?',
  waterFountain: 'Water fountains: where?',
  vending: 'Vending machines: where?',
  studySpace: 'Study spaces / lounges: where?',
  lockers: 'Lockers?',
};

// ---------------------------------------------------------------------------
// VERIFY.md
// ---------------------------------------------------------------------------

const route = walkingOrder(
  campus,
  campus.buildings.map((b) => b.id),
);
const verify = [
  '# On-campus verification checklist',
  '',
  `Generated ${campus.meta.dataUpdated} from the data. Buildings are in walking order from the main gate;`,
  'tick what you checked and fix the data with the Map Editor (`?edit=1`) or in',
  '`data-raw/official/`. Set a building’s “Last verified” date in the editor when done.',
  '',
  'Legend: ☐ to check · (est.) = estimated by the build script · (OSM) = from OpenStreetMap only',
  '',
];
route.forEach(({ id, walk }, index) => {
  const b = byId.get(id);
  const lines = [];
  const entrances = (b.entrances ?? []).map((e) => nodes.get(e)).filter(Boolean);
  for (const e of entrances.filter((n) => n.status === 'estimated')) {
    lines.push(
      `☐ Entrance (est.) on the **${side(b, e)}** side — is there a door here? Where are the real entrances?`,
    );
  }
  for (const e of entrances.filter((n) => n.status === 'osm' && !n.wheelchair)) {
    lines.push(
      `☐ Entrance (OSM) ${e.label ? `“${e.label}” ` : ''}on the ${side(b, e)} side: step-free?`,
    );
  }
  if (b.osmMatch === 'estimated') lines.push(`☐ Is this the right building? ${b.osmNote}`);
  if (b.kind !== 'area') {
    if (b.floors?.status !== 'verified') {
      lines.push(
        `☐ Floors: ${b.floors?.above ? `${b.floors.above} above ground (OSM)` : 'unknown'} — basement?`,
      );
    }
    if (b.openingHours?.status === 'unknown') lines.push('☐ Opening hours (sign at the entrance)');
    for (const [key, label] of Object.entries(AMENITY_LABELS)) {
      if (b.amenities?.[key]?.status === 'unknown') lines.push(`☐ ${label}`);
    }
  }
  if (!b.photo?.src) lines.push('☐ Take a photo (see PHOTOS-TODO.md)');
  else if (b.photo.width < 600) lines.push('☐ Take a better photo (current one is very small)');
  verify.push(
    `## ${index + 1}. ${name(b)} — \`${b.id}\``,
    '',
    index === 0
      ? '_Start here._'
      : `_${walk === null ? 'Not connected' : `${walk} m`} from the previous stop._`,
    '',
    ...(lines.length ? lines.map((l) => `- ${l}`) : ['- Nothing to check.']),
    '',
  );
});

const graph = report.graph;
verify.push('## Paths and links to check', '');
for (const e of graph.estimatedEntrances ?? []) {
  const b = byId.get(e.building);
  verify.push(
    `- ☐ ${b ? name(b) : e.building}: estimated entrance joined to the nearest path ${e.metersToPath} m away — is there a walkway?`,
  );
}
for (const s of graph.snappedEntrances ?? []) {
  verify.push(
    `- ☐ Entrance “${s.label}” was ${s.meters} m from the nearest mapped path — check the walkway to it.`,
  );
}
for (const d of graph.droppedComponents ?? []) {
  verify.push(
    `- ☐ ${d.nodes} path nodes ${d.insideCampus ? 'on' : 'outside'} campus are not connected (gap ${d.gapMeters} m; OSM ways ${d.osmWays.join(', ')}) — missing link or a separate area?`,
  );
}
for (const b of graph.bridges ?? []) {
  verify.push(`- ☐ Short gap (${b.meters} m) bridged automatically between ${b.from} and ${b.to}.`);
}
if (!campus.edges.some((e) => e.stairs)) {
  verify.push('- ☐ No stairs are mapped in OpenStreetMap: note any stairs on the main walkways.');
}
verify.push('', '## Sources to double-check', '');
for (const b of campus.buildings.filter((x) => x.osmNote && x.osmMatch !== 'estimated')) {
  verify.push(`- ☐ ${name(b)}: ${b.osmNote}`);
}
for (const u of report.unresolved ?? []) {
  verify.push(
    `- ☐ ${u.what}: office “${u.location}” is not on the campus map${u.note ? ` — ${u.note}` : ''}.`,
  );
}
verify.push(
  '- ☐ Lost and found and the campus security office: no official page found — where are they?',
  '- ☐ Library opening hours: not readable from lib.inha.ac.kr — check the sign.',
  '- ☐ Shuttle bus stop “behind the library”: exact place?',
  '',
);

await writeFile(new URL('VERIFY.md', ROOT), verify.join('\n'));

// ---------------------------------------------------------------------------
// DATA-REPORT.md
// ---------------------------------------------------------------------------

const STATUSES = ['verified', 'osm', 'estimated', 'unknown'];
const tally = Object.fromEntries(STATUSES.map((s) => [s, 0]));
const count = (status) => {
  tally[STATUSES.includes(status) ? status : 'unknown']++;
};
for (const b of campus.buildings) {
  count(b.nameStatus?.ko);
  count(b.nameStatus?.en);
  count(b.categoryStatus);
  count(b.descriptionStatus === 'verified' ? 'verified' : b.descriptionStatus);
  if (b.kind !== 'area') {
    count(b.floors?.status);
    count(b.openingHours?.status);
    for (const amenity of Object.values(b.amenities ?? {})) count(amenity.status);
  }
  count(b.osmMatch === 'estimated' ? 'estimated' : 'osm'); // outline
  for (const id of b.entrances ?? []) count(nodes.get(id)?.status);
}
const total = Object.values(tally).reduce((a, b) => a + b, 0);
const pct = (n) => `${((n / total) * 100).toFixed(0)}%`;

const pathMeters = campus.edges.reduce((sum, e) => sum + (e.distance ?? 0), 0);
const entrances = campus.nodes.filter((n) => n.type === 'entrance');
const departments = campus.buildings.reduce((n, b) => n + b.departments.length, 0);
const groups = {};
for (const p of campus.pois) {
  groups[p.group] ??= { osm: 0, verified: 0 };
  groups[p.group][p.status === 'verified' ? 'verified' : 'osm']++;
}
const photos = campus.buildings.filter((b) => b.photo?.src);
const officialSources = campus.meta.sources ?? [];

const dataReport = [
  '# Data report',
  '',
  `Data built ${campus.meta.dataUpdated}; OpenStreetMap snapshot ${campus.meta.osmFetched}.`,
  'Regenerate with `npm run data:build && npm run reports`.',
  '',
  '## Counts',
  '',
  '| | |',
  '|---|---|',
  `| Buildings and outdoor facilities | ${campus.buildings.length} (${campus.buildings.filter((b) => b.number).length} with an official number, ${campus.buildings.filter((b) => b.kind === 'area').length} outdoor) |`,
  `| Walking paths (whole map area) | ${campus.edges.length} links, ${(pathMeters / 1000).toFixed(1)} km |`,
  `| Path nodes | ${campus.nodes.length} |`,
  `| Entrances | ${entrances.length} (${entrances.filter((n) => n.status === 'osm').length} from OSM, ${entrances.filter((n) => n.status === 'estimated').length} estimated) |`,
  `| Step-free entrances mapped | ${entrances.filter((n) => n.wheelchair === 'yes' || n.wheelchair === 'limited').length} |`,
  `| Road crossings / stairs mapped | ${campus.edges.filter((e) => e.crossing).length} / ${campus.edges.filter((e) => e.stairs).length} |`,
  `| Departments with an office on the map | ${departments} (${(report.unresolved ?? []).length} not placed) |`,
  `| Floor-directory entries | ${campus.buildings.reduce((n, b) => n + b.floorDirectory.reduce((m, f) => m + f.items.length, 0), 0)} |`,
  `| Places (amenities, stops) | ${campus.pois.length} |`,
  `| Photos | ${photos.length} of ${campus.buildings.length} buildings |`,
  `| Official pages used | ${officialSources.length} |`,
  '',
  '### Places by map filter',
  '',
  '| Group | From OSM | Official |',
  '|---|---|---|',
  ...Object.entries(groups).map(([g, n]) => `| ${g} | ${n.osm} | ${n.verified} |`),
  '',
  '## How much is verified',
  '',
  `Across ${total} building facts (names, category, description, floors, opening hours, eleven amenities, outline, entrances):`,
  '',
  '| Status | Facts | Share |',
  '|---|---|---|',
  ...STATUSES.map((s) => `| ${s} | ${tally[s]} | ${pct(tally[s])} |`),
  '',
  '“verified” = official Inha page (or checked on campus); “osm” = OpenStreetMap only;',
  '“estimated” = derived by the build script; “unknown” = not found yet (see VERIFY.md).',
  '',
  '## Sources',
  '',
  `- OpenStreetMap: ${campus.meta.attribution.text}, ${campus.meta.attribution.license} — ${campus.meta.attribution.url} (snapshot in \`data-raw/osm/\`)`,
  `- Wikimedia Commons (photos): ${photos.map((b) => `${b.name.en} — ${b.photo.author}, ${b.photo.license}, ${b.photo.sourceUrl}`).join('; ') || 'none'}`,
  '- Official Inha University pages (with the date each was read):',
  '',
  ...officialSources.map((s) => `  - [${s.title}](${s.url}) — ${s.retrieved}`),
  '',
];
await writeFile(new URL('DATA-REPORT.md', ROOT), dataReport.join('\n'));

console.log(
  `VERIFY.md (${route.length} stops) and DATA-REPORT.md written; verified ${pct(tally.verified)}, osm ${pct(tally.osm)}, estimated ${pct(tally.estimated)}, unknown ${pct(tally.unknown)}.`,
);
