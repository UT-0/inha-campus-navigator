/**
 * Route service: the one place the UI asks for routes and directions.
 *
 * It builds the graph once, answers "route from building A to building B"
 * with a clear status (ok / same / none / invalid), and caches directions per
 * route and language so re-rendering is cheap. Pure module (no DOM).
 */
import { buildGraph, connectedComponents, pathGeometry } from './graph.js';
import { findBuildingRoute } from './dijkstra.js';
import { buildDirections } from './directions.js';

/**
 * @typedef {Object} RouteOutcome
 * @property {'ok'|'same'|'none'|'invalid'} status
 * @property {import('../state.js').RouteResult|null} route
 */

/**
 * Creates the router for a campus.
 * @param {object} campus Parsed campus.json.
 */
export function createRouter(campus) {
  const graph = buildGraph(campus);
  const buildings = new Map(campus.buildings.map((b) => [b.id, b]));
  let cache = { route: null, lang: null, directions: null };

  /**
   * Finds the shortest route between two buildings.
   * @param {string} fromId
   * @param {string} toId
   * @returns {RouteOutcome}
   */
  function findRoute(fromId, toId) {
    const from = buildings.get(fromId);
    const to = buildings.get(toId);
    if (!from || !to) return { status: 'invalid', route: null };
    if (fromId === toId) return { status: 'same', route: null };

    const result = findBuildingRoute(graph, from, to);
    if (!result) {
      warnDisconnected(from, to);
      return { status: 'none', route: null };
    }
    return { status: 'ok', route: { fromId, toId, path: result.path, distance: result.distance } };
  }

  /** Explains in the console which parts of the walkway network are cut off. */
  function warnDisconnected(from, to) {
    const components = connectedComponents(graph);
    const describe = (building) => {
      const entrances = (building.entrances ?? []).filter((id) => graph.nodes.has(id));
      if (entrances.length === 0) return `${building.id} has no valid entrance nodes`;
      const component = components.find((c) => c.includes(entrances[0])) ?? [];
      const preview = component.slice(0, 6).join(', ') + (component.length > 6 ? ', …' : '');
      return `${building.id} (entrances ${entrances.join(', ')}) is in a group of ${component.length} node(s): ${preview}`;
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
      fromBuilding: buildings.get(route.fromId),
      toBuilding: buildings.get(route.toId),
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

  return { graph, findRoute, directionsFor, pointsOf, geometryOf };
}
