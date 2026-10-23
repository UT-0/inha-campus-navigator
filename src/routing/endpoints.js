/**
 * Route endpoints: anything a route can start or end at.
 *
 * - A building: its entrance nodes.
 * - A place (POI) inside a building: that building's entrances, named
 *   "<place> · <building>".
 * - An outdoor place (bus stop, café kiosk…): the nearest graph node, plus
 *   the straight-line meters from there to the place.
 *
 * With `accessible: true`, entrances mapped as `wheelchair=no` are left out
 * and entrances not known to be step-free get a small penalty, so a route
 * prefers entrances mapped as `wheelchair=yes`.
 *
 * Pure module (no DOM) so it can be unit tested.
 */

/** Words added to outdoor place names so "인하대정문" reads as a bus stop. */
const TYPE_WORDS = {
  bus_stop: { en: 'bus stop', ko: '버스 정류장' },
  parking: { en: 'parking', ko: '주차장' },
};

function withType(name, type) {
  const word = TYPE_WORDS[type];
  if (!name)
    return word
      ? { en: word.en[0].toUpperCase() + word.en.slice(1), ko: word.ko }
      : { en: type, ko: type };
  if (!word) return name;
  return { en: `${name.en} ${word.en}`, ko: `${name.ko} ${word.ko}` };
}

/** Extra cost (meters) of an entrance for the accessible option. */
export const ENTRANCE_PENALTY = { yes: 0, limited: 15, unknown: 40 };

/**
 * @typedef {Object} Endpoint
 * @property {string} id
 * @property {'building'|'place'} kind
 * @property {{en: string, ko: string}} name
 * @property {object|null} building  The building (for a building or an indoor place).
 * @property {object|null} place     The POI (for a place).
 * @property {string[]} nodes        Graph nodes the route can start or end at.
 */

/**
 * @param {object} campus
 * @param {import('./graph.js').Graph} graph
 */
export function createEndpoints(campus, graph) {
  const buildings = new Map(campus.buildings.map((b) => [b.id, b]));
  const pois = new Map((campus.pois ?? []).map((p) => [p.id, p]));
  const nodeList = [...graph.nodes.values()];
  const metersPerUnit = graph.metersPerUnit ?? 1;
  const nearestCache = new Map();

  /** The graph node closest to a point (straight line) and its distance in meters. */
  function nearestNode(x, y) {
    const key = `${x},${y}`;
    if (nearestCache.has(key)) return nearestCache.get(key);
    let best = null;
    for (const node of nodeList) {
      // Entrances belong to their building: don't snap an outdoor place to one.
      if (node.type === 'entrance') continue;
      const d = Math.hypot(node.x - x, node.y - y);
      if (!best || d < best.d) best = { id: node.id, d };
    }
    const result = best ? { id: best.id, meters: best.d * metersPerUnit } : null;
    nearestCache.set(key, result);
    return result;
  }

  /**
   * @param {string} id Building id or POI id.
   * @returns {Endpoint|null}
   */
  function get(id) {
    const building = buildings.get(id);
    if (building) {
      return {
        id,
        kind: 'building',
        name: building.name,
        building,
        place: null,
        nodes: building.entrances ?? [],
      };
    }
    const place = pois.get(id);
    if (!place) return null;
    const host = place.indoor ? buildings.get(place.buildingId) : null;
    const placeName = place.name ?? null;
    const name = host
      ? {
          en: [placeName?.en, host.name.en].filter(Boolean).join(' · '),
          ko: [placeName?.ko, host.name.ko].filter(Boolean).join(' · '),
        }
      : withType(placeName, place.type);
    const near = host ? null : nearestNode(place.x, place.y);
    return {
      id,
      kind: 'place',
      name,
      building: host,
      place,
      nodes: host ? (host.entrances ?? []) : near ? [near.id] : [],
      offMeters: near?.meters ?? 0,
    };
  }

  /**
   * Node → extra cost map for routing to or from an endpoint.
   * @param {Endpoint} endpoint
   * @param {{accessible?: boolean}} [options]
   * @returns {Map<string, number>}
   */
  function costs(endpoint, { accessible = false } = {}) {
    const map = new Map();
    for (const id of endpoint.nodes) {
      const node = graph.nodes.get(id);
      if (!node) continue;
      let cost = endpoint.offMeters ?? 0;
      if (accessible && node.type === 'entrance') {
        const value = node.wheelchair ?? 'unknown';
        if (value === 'no') continue;
        cost += ENTRANCE_PENALTY[value] ?? ENTRANCE_PENALTY.unknown;
      }
      map.set(id, cost);
    }
    return map;
  }

  return { get, costs, nearestNode };
}
