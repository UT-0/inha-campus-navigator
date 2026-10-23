/**
 * Route service: the one place the UI asks for routes and directions.
 *
 * It builds the graph once, answers "route from A to B" (buildings or
 * places) and "nearest café / printer / bus stop from A" with a clear status,
 * optionally avoiding stairs and entrances that are not step-free, and
 * caches directions per route and language so re-rendering is cheap.
 * Pure module (no DOM).
 */
import { buildGraph, connectedComponents, pathGeometry } from './graph.js';
import { findNearest, routeBetween } from './dijkstra.js';
import { buildDirections } from './directions.js';
import { createEndpoints } from './endpoints.js';

/**
 * @typedef {Object} RouteOutcome
 * @property {'ok'|'same'|'inside'|'none'|'noAccessible'|'noCandidates'|'invalid'} status
 *           `inside`: the place is inside the start building;
 *           `noAccessible`: a route exists, but only with stairs or
 *           entrances that are not step-free; `noCandidates`: nothing of
 *           that kind is mapped.
 * @property {import('../state.js').RouteResult|null} route
 * @property {string} [targetId] For nearest searches: the place found.
 */

/**
 * What "nearest …" can look for, as a test on map places (POIs).
 * Buildings whose amenities list known locations count too.
 */
export const NEAREST_KINDS = {
  restroom: { poi: (p) => p.type === 'restroom', amenity: 'restrooms' },
  printer: { poi: (p) => p.group === 'printing', amenity: 'printers' },
  food: { poi: (p) => p.group === 'food' && p.type !== 'water' },
  cafe: { poi: (p) => p.type === 'cafe' },
  convenience_store: { poi: (p) => p.type === 'convenience_store' },
  cafeteria: { poi: (p) => p.type === 'restaurant' && p.status === 'verified' },
  atm: { poi: (p) => p.type === 'atm' || p.type === 'bank', amenity: 'atm' },
  bus_stop: { poi: (p) => p.type === 'bus_stop' },
};

/**
 * Creates the router for a campus.
 * @param {object} campus Parsed campus.json.
 */
export function createRouter(campus) {
  const graph = buildGraph(campus);
  const endpoints = createEndpoints(campus, graph);
  let cache = { route: null, lang: null, directions: null };

  /**
   * Finds the shortest route between two buildings.
   * @param {string} fromId
   * @param {string} toId
   * @returns {RouteOutcome}
   */
  function findRoute(fromId, toId, { accessible = false } = {}) {
    const from = endpoints.get(fromId);
    const to = endpoints.get(toId);
    if (!from || !to) return { status: 'invalid', route: null };
    if (fromId === toId) return { status: 'same', route: null };
    if (from.building && from.building === to.building) {
      return { status: to.kind === 'place' ? 'inside' : 'same', route: null, targetId: toId };
    }

    const result = routeBetween(
      graph,
      endpoints.costs(from, { accessible }),
      endpoints.costs(to, { accessible }),
      { avoidStairs: accessible },
    );
    if (!result) {
      if (accessible && findRoute(fromId, toId).status === 'ok') {
        return { status: 'noAccessible', route: null };
      }
      warnDisconnected(from, to);
      return { status: 'none', route: null };
    }
    return { status: 'ok', route: makeRoute(from, to, result, accessible) };
  }

  function makeRoute(from, to, result, accessible) {
    return {
      fromId: from.id,
      toId: to.id,
      path: result.path,
      distance: result.distance + (from.offMeters ?? 0) + (to.offMeters ?? 0),
      accessible,
    };
  }

  /**
   * Nearest place of a kind by walking distance from a building.
   * @param {string} fromId
   * @param {keyof typeof NEAREST_KINDS} kind
   * @param {{accessible?: boolean}} [options]
   * @returns {RouteOutcome}
   */
  function findNearestOf(fromId, kind, { accessible = false } = {}) {
    const from = endpoints.get(fromId);
    const rule = NEAREST_KINDS[kind];
    if (!from || !rule) return { status: 'invalid', route: null };
    const ids = [
      ...(campus.pois ?? []).filter(rule.poi).map((p) => p.id),
      ...(rule.amenity
        ? campus.buildings
            .filter((b) => {
              const a = b.amenities?.[rule.amenity];
              return a && a.status !== 'unknown' && (a.locations ?? a.floors ?? []).length > 0;
            })
            .map((b) => b.id)
        : []),
    ];
    if (ids.length === 0) return { status: 'noCandidates', route: null };

    // Something of that kind in the start building itself wins.
    const inside = ids.find((id) => {
      const e = endpoints.get(id);
      return e.building && e.building === from.building;
    });
    if (inside) return { status: 'inside', route: null, targetId: inside };

    const candidates = ids.map((id) => {
      const endpoint = endpoints.get(id);
      return { id, nodes: endpoints.costs(endpoint, { accessible }) };
    });
    const result = findNearest(graph, endpoints.costs(from, { accessible }), candidates, {
      avoidStairs: accessible,
    });
    if (!result) {
      if (accessible && findNearestOf(fromId, kind).status === 'ok') {
        return { status: 'noAccessible', route: null };
      }
      return { status: 'none', route: null };
    }
    const to = endpoints.get(result.candidateId);
    return {
      status: 'ok',
      targetId: to.id,
      route: makeRoute(
        from,
        to,
        { path: result.path, distance: result.distance - (to.offMeters ?? 0) },
        accessible,
      ),
    };
  }

  /** Explains in the console which parts of the walkway network are cut off. */
  function warnDisconnected(from, to) {
    const components = connectedComponents(graph);
    const describe = (endpoint) => {
      const entrances = endpoint.nodes.filter((id) => graph.nodes.has(id));
      if (entrances.length === 0) return `${endpoint.id} has no valid entrance nodes`;
      const component = components.find((c) => c.includes(entrances[0])) ?? [];
      const preview = component.slice(0, 6).join(', ') + (component.length > 6 ? ', …' : '');
      return `${endpoint.id} (entrances ${entrances.join(', ')}) is in a group of ${component.length} node(s): ${preview}`;
    };
    console.warn(
      `[routing] No path between "${from.id}" and "${to.id}". ${describe(from)}; ${describe(to)}.`,
    );
  }

  /**
   * Directions for a route in a language (cached for the last request).
   * @param {import('../state.js').RouteResult} route
   * @param {'en'|'ko'} lang
   * @param {(key: string, params?: object) => string} t
   * @returns {import('./directions.js').Directions}
   */
  function directionsFor(route, lang, t) {
    if (cache.route === route && cache.lang === lang) return cache.directions;
    const directions = buildDirections({
      path: route.path,
      graph,
      campus,
      from: endpoints.get(route.fromId),
      to: endpoints.get(route.toId),
      t,
      lang,
    });
    cache = { route, lang, directions };
    return directions;
  }

  /**
   * Coordinates of a list of node ids.
   * @param {string[]} nodeIds
   * @returns {Array<{x:number, y:number}>}
   */
  function pointsOf(nodeIds) {
    return nodeIds.map((id) => graph.nodes.get(id)).filter(Boolean);
  }

  /**
   * Geometry of a route along the real walkways.
   * @param {string[]} path Node ids.
   * @returns {Array<{x:number, y:number}>}
   */
  function geometryOf(path) {
    return pathGeometry(graph, path);
  }

  /**
   * Geometry of a whole route, including the last meters off the path to an
   * outdoor place (e.g. across the pavement to a bus stop).
   * @param {import('../state.js').RouteResult} route
   * @returns {Array<{x:number, y:number}>}
   */
  function routeGeometry(route) {
    const points = pathGeometry(graph, route.path);
    const outdoor = (id) => {
      const endpoint = endpoints.get(id);
      return endpoint?.place && !endpoint.building
        ? { x: endpoint.place.x, y: endpoint.place.y }
        : null;
    };
    const start = outdoor(route.fromId);
    const end = outdoor(route.toId);
    return [...(start ? [start] : []), ...points, ...(end ? [end] : [])];
  }

  return {
    graph,
    endpoints,
    findRoute,
    findNearest: findNearestOf,
    directionsFor,
    pointsOf,
    geometryOf,
    routeGeometry,
  };
}
