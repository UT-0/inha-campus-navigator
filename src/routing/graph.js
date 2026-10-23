/**
 * Builds the walking graph from campus.json and validates the data.
 *
 * The campus is modelled as a graph: nodes are points people walk between
 * (building entrances, path junctions, gates) and edges are the walkways
 * connecting them. Every edge is bidirectional, so it is added to the
 * adjacency list of both of its end nodes.
 *
 * This module is pure (no DOM access) so it can be unit tested.
 */
import { distance, outerRings } from '../utils/geometry.js';

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {'entrance'|'junction'|'gate'} type
 * @property {string} [building]
 * @property {{en:string, ko:string}} [name]
 */

/**
 * @typedef {Object} Neighbor
 * @property {string} to        Id of the neighbouring node.
 * @property {number} distance  Walking distance in meters.
 * @property {object} edge      The original edge object (stairs, covered, …).
 */

/**
 * @typedef {Object} Graph
 * @property {Map<string, GraphNode>} nodes
 * @property {Map<string, Neighbor[]>} adjacency
 * @property {number} metersPerUnit
 */

/**
 * Builds an adjacency-list graph. Edges that reference unknown nodes are
 * skipped (they are reported by `validateCampus`). If an edge's `distance`
 * is null, it is computed from the node coordinates × metersPerUnit.
 * @param {object} campus Parsed campus.json.
 * @returns {Graph}
 */
export function buildGraph(campus) {
  const metersPerUnit = campus.meta?.metersPerUnit ?? 1;
  const nodes = new Map();
  const adjacency = new Map();

  for (const node of campus.nodes ?? []) {
    nodes.set(node.id, node);
    adjacency.set(node.id, []);
  }

  for (const edge of campus.edges ?? []) {
    const a = nodes.get(edge.from);
    const b = nodes.get(edge.to);
    if (!a || !b || a === b) continue;
    const meters =
      typeof edge.distance === 'number' && edge.distance >= 0
        ? edge.distance
        : distance(a, b) * metersPerUnit;
    adjacency.get(a.id).push({ to: b.id, distance: meters, edge });
    adjacency.get(b.id).push({ to: a.id, distance: meters, edge });
  }

  return { nodes, adjacency, metersPerUnit };
}

/**
 * Splits the graph into connected components using breadth-first search.
 * @param {Graph} graph
 * @returns {string[][]} Components, largest first.
 */
export function connectedComponents(graph) {
  const seen = new Set();
  const components = [];
  for (const start of graph.nodes.keys()) {
    if (seen.has(start)) continue;
    const component = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const id = queue.shift();
      component.push(id);
      for (const { to } of graph.adjacency.get(id)) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length);
}

/**
 * @typedef {Object} ValidationProblem
 * @property {'error'|'warning'} level
 * @property {string} code     Machine-readable problem type.
 * @property {string} message  Human-readable description (English, for developers).
 * @property {string[]} ids    Ids of the items involved.
 */

/**
 * Checks campus data for problems that would break routing or rendering:
 * missing top-level arrays, duplicate ids, edges pointing to unknown nodes,
 * buildings without (valid) entrances, and disconnected parts of the graph.
 * @param {object} campus Parsed campus.json.
 * @returns {ValidationProblem[]}
 */
export function validateCampus(campus) {
  const problems = [];
  const add = (level, code, message, ids = []) => problems.push({ level, code, message, ids });

  if (!campus || typeof campus !== 'object') {
    add('error', 'invalid-root', 'campus.json must contain a JSON object.');
    return problems;
  }
  if (!Array.isArray(campus.meta?.viewBox) || campus.meta.viewBox.length !== 4) {
    add('error', 'missing-viewbox', 'meta.viewBox must be an array of four numbers.');
  }
  for (const key of ['buildings', 'nodes', 'edges']) {
    if (!Array.isArray(campus[key])) add('error', 'missing-array', `"${key}" must be an array.`);
  }
  if (problems.some((p) => p.level === 'error')) return problems;

  // Duplicate ids make lookups ambiguous.
  const checkDuplicates = (items, label) => {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.id))
        add('error', 'duplicate-id', `Duplicate ${label} id "${item.id}".`, [item.id]);
      seen.add(item.id);
    }
  };
  checkDuplicates(campus.buildings, 'building');
  checkDuplicates(campus.nodes, 'node');

  const nodeIds = new Set(campus.nodes.map((n) => n.id));
  const buildingIds = new Set(campus.buildings.map((b) => b.id));

  for (const node of campus.nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      add('error', 'bad-node', `Node "${node.id}" has invalid coordinates.`, [node.id]);
    }
    if (node.building && !buildingIds.has(node.building)) {
      add(
        'warning',
        'unknown-building',
        `Node "${node.id}" refers to unknown building "${node.building}".`,
        [node.id],
      );
    }
  }

  campus.edges.forEach((edge, index) => {
    const missing = [edge.from, edge.to].filter((id) => !nodeIds.has(id));
    if (missing.length > 0) {
      add(
        'warning',
        'unknown-node',
        `Edge #${index} (${edge.from} → ${edge.to}) points to unknown node(s): ${missing.join(', ')}.`,
        missing,
      );
    }
  });

  for (const building of campus.buildings) {
    if (outerRings(building).length === 0) {
      add(
        'error',
        'bad-polygon',
        `Building "${building.id}" needs a polygon with at least 3 points.`,
        [building.id],
      );
    }
    const entrances = building.entrances ?? [];
    const valid = entrances.filter((id) => nodeIds.has(id));
    if (entrances.length === 0) {
      add(
        'warning',
        'no-entrance',
        `Building "${building.id}" has no entrances, so it cannot be routed to.`,
        [building.id],
      );
    } else if (valid.length === 0) {
      add(
        'warning',
        'no-entrance',
        `None of the entrances of building "${building.id}" exist as nodes.`,
        [building.id],
      );
    } else if (valid.length < entrances.length) {
      const bad = entrances.filter((id) => !nodeIds.has(id));
      add(
        'warning',
        'unknown-entrance',
        `Building "${building.id}" lists unknown entrance(s): ${bad.join(', ')}.`,
        bad,
      );
    }
  }

  // Connectivity: every node should be reachable from every other node.
  const graph = buildGraph(campus);
  const components = connectedComponents(graph);
  for (const component of components.slice(1)) {
    const preview = component.slice(0, 8).join(', ') + (component.length > 8 ? ', …' : '');
    add(
      'warning',
      'disconnected',
      `${component.length} node(s) are not connected to the main walkway network: ${preview}.`,
      component,
    );
  }

  return problems;
}

/**
 * Logs validation problems to the console in a readable way.
 * @param {ValidationProblem[]} problems
 */
export function logProblems(problems) {
  for (const problem of problems) {
    const log = problem.level === 'error' ? console.error : console.warn;
    log(`[campus data] ${problem.message}`);
  }
}

/**
 * The edge used to walk from node `a` to its neighbour `b` (the shortest
 * one if several walkways connect the same two nodes, as Dijkstra would).
 * @param {Graph} graph
 * @param {string} a
 * @param {string} b
 * @returns {Neighbor|null}
 */
export function linkBetween(graph, a, b) {
  let best = null;
  for (const link of graph.adjacency.get(a) ?? []) {
    if (link.to === b && (!best || link.distance < best.distance)) best = link;
  }
  return best;
}

/**
 * The drawn shape of the walk from `a` to `b`: the edge's stored polyline in
 * walking order, or a straight line when the edge has no geometry.
 * @param {Graph} graph
 * @param {string} a
 * @param {string} b
 * @returns {Array<{x:number, y:number}>}
 */
export function walkGeometry(graph, a, b) {
  const link = linkBetween(graph, a, b);
  const from = graph.nodes.get(a);
  const to = graph.nodes.get(b);
  const geometry = link?.edge?.geometry;
  if (!Array.isArray(geometry) || geometry.length < 2) return [from, to].filter(Boolean);
  const points = geometry.map(([x, y]) => ({ x, y }));
  // Edges are stored in one direction: reverse if we walk it the other way.
  if (link.edge.from !== a) points.reverse();
  return points;
}

/**
 * Full geometry of a route (all edges joined, without repeated points).
 * @param {Graph} graph
 * @param {string[]} path Node ids.
 * @returns {Array<{x:number, y:number}>}
 */
export function pathGeometry(graph, path) {
  if (path.length === 1) return [graph.nodes.get(path[0])].filter(Boolean);
  const points = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const part = walkGeometry(graph, path[i], path[i + 1]);
    points.push(...(points.length ? part.slice(1) : part));
  }
  return points;
}
