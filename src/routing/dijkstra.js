/**
 * Shortest walking paths with Dijkstra's algorithm.
 *
 * Dijkstra explores the graph outwards from the start, always continuing
 * from the closest not-yet-finished node (taken from a min-heap). When a node
 * is taken from the heap its distance is final, because every other route to
 * it would have to pass through a node that is already farther away.
 *
 * `findBuildingRoute` adds the multi-entrance trick: a virtual SOURCE node
 * linked (distance 0) to every entrance of the start building and a virtual
 * TARGET node linked (distance 0) to every entrance of the destination. One
 * Dijkstra run from SOURCE to TARGET then automatically picks the best pair
 * of entrances. The virtual nodes are stripped from the returned path.
 *
 * Pure functions only — no DOM access — so everything here is unit tested.
 */
import { MinHeap } from './minHeap.js';

/** Ids of the virtual nodes used for multi-entrance routing. */
export const VIRTUAL_SOURCE = '__source__';
export const VIRTUAL_TARGET = '__target__';

/**
 * @typedef {Object} PathResult
 * @property {string[]} path  Node ids from start to target (inclusive).
 * @property {number} distance Total distance in meters.
 */

/**
 * Runs Dijkstra from `start` to `target`.
 * @param {(id: string) => Array<{to: string, distance: number}>} getNeighbors
 *        Returns the outgoing edges of a node.
 * @param {string} start
 * @param {string} target
 * @returns {PathResult|null} The shortest path, or null if target is unreachable.
 */
export function dijkstra(getNeighbors, start, target) {
  if (start === target) return { path: [start], distance: 0 };

  const dist = new Map([[start, 0]]); // best known distance to each node
  const previous = new Map(); // node -> node we came from on the best path
  const done = new Set(); // nodes whose distance is final
  const heap = new MinHeap();
  heap.push(start, 0);

  while (!heap.isEmpty()) {
    const { value: current, priority } = heap.pop();
    // The heap may contain outdated entries for a node (we never decrease
    // keys, we just push again). Skip anything already finalised.
    if (done.has(current)) continue;
    done.add(current);
    if (current === target) break;

    for (const { to, distance } of getNeighbors(current)) {
      if (done.has(to)) continue;
      const candidate = priority + distance;
      if (candidate < (dist.get(to) ?? Infinity)) {
        dist.set(to, candidate);
        previous.set(to, current);
        heap.push(to, candidate);
      }
    }
  }

  if (!done.has(target)) return null;

  // Walk the "previous" links backwards from the target to rebuild the path.
  const path = [target];
  while (path[0] !== start) path.unshift(previous.get(path[0]));
  return { path, distance: dist.get(target) };
}

/**
 * Shortest path between two nodes of a graph built by `buildGraph`.
 * @param {import('./graph.js').Graph} graph
 * @param {string} start
 * @param {string} target
 * @returns {PathResult|null}
 */
export function shortestPath(graph, start, target) {
  if (!graph.nodes.has(start) || !graph.nodes.has(target)) return null;
  return dijkstra((id) => graph.adjacency.get(id) ?? [], start, target);
}

/**
 * Shortest path between any entrance of one set and any entrance of another,
 * using a virtual source and a virtual target node.
 * @param {import('./graph.js').Graph} graph
 * @param {string[]} startEntrances Entrance node ids of the start building.
 * @param {string[]} targetEntrances Entrance node ids of the destination building.
 * @returns {PathResult|null} Path between real nodes only, or null if unreachable.
 */
export function findMultiEntranceRoute(graph, startEntrances, targetEntrances) {
  const starts = startEntrances.filter((id) => graph.nodes.has(id));
  const targets = new Set(targetEntrances.filter((id) => graph.nodes.has(id)));
  if (starts.length === 0 || targets.size === 0) return null;

  // Neighbour function that adds the virtual nodes on top of the real graph
  // without modifying it.
  const getNeighbors = (id) => {
    if (id === VIRTUAL_SOURCE) return starts.map((to) => ({ to, distance: 0 }));
    if (id === VIRTUAL_TARGET) return [];
    const real = graph.adjacency.get(id) ?? [];
    return targets.has(id) ? [...real, { to: VIRTUAL_TARGET, distance: 0 }] : real;
  };

  const result = dijkstra(getNeighbors, VIRTUAL_SOURCE, VIRTUAL_TARGET);
  if (!result) return null;
  return {
    path: result.path.filter((id) => id !== VIRTUAL_SOURCE && id !== VIRTUAL_TARGET),
    distance: result.distance,
  };
}

/**
 * Shortest walking route between two buildings, choosing the best entrance
 * at both ends.
 * @param {import('./graph.js').Graph} graph
 * @param {object} fromBuilding Building object from campus.json.
 * @param {object} toBuilding Building object from campus.json.
 * @returns {PathResult|null}
 */
export function findBuildingRoute(graph, fromBuilding, toBuilding) {
  return findMultiEntranceRoute(graph, fromBuilding.entrances ?? [], toBuilding.entrances ?? []);
}

/**
 * @typedef {Object} RouteOptions
 * @property {boolean} [avoidStairs] Skip edges marked `stairs: true`.
 */

/**
 * Neighbour function over the real graph with optional edge filtering.
 * @param {import('./graph.js').Graph} graph
 * @param {RouteOptions} options
 */
function realNeighbors(graph, { avoidStairs = false } = {}) {
  return (id) => {
    const list = graph.adjacency.get(id) ?? [];
    return avoidStairs ? list.filter((n) => !n.edge?.stairs) : list;
  };
}

/** Real walking length of a path (penalties for entrances are not included). */
function pathLength(graph, path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const link = (graph.adjacency.get(path[i - 1]) ?? []).find((n) => n.to === path[i]);
    total += link ? link.distance : 0;
  }
  return total;
}

/**
 * Shortest route from any start node to any target node, where each start
 * and target can carry an extra cost (e.g. a penalty for an entrance that
 * may not be step-free). Generalises `findMultiEntranceRoute`.
 * @param {import('./graph.js').Graph} graph
 * @param {Map<string, number>} starts  Node id → extra cost.
 * @param {Map<string, number>} targets Node id → extra cost.
 * @param {RouteOptions} [options]
 * @returns {(PathResult & {cost: number})|null} `distance` is the real
 *          walking length; `cost` includes the extra costs.
 */
export function routeBetween(graph, starts, targets, options = {}) {
  const real = realNeighbors(graph, options);
  const startList = [...starts].filter(([id]) => graph.nodes.has(id));
  const targetMap = new Map([...targets].filter(([id]) => graph.nodes.has(id)));
  if (startList.length === 0 || targetMap.size === 0) return null;

  const getNeighbors = (id) => {
    if (id === VIRTUAL_SOURCE) return startList.map(([to, cost]) => ({ to, distance: cost }));
    if (id === VIRTUAL_TARGET) return [];
    const list = real(id);
    return targetMap.has(id)
      ? [...list, { to: VIRTUAL_TARGET, distance: targetMap.get(id) }]
      : list;
  };
  const result = dijkstra(getNeighbors, VIRTUAL_SOURCE, VIRTUAL_TARGET);
  if (!result) return null;
  const path = result.path.filter((id) => id !== VIRTUAL_SOURCE && id !== VIRTUAL_TARGET);
  return { path, distance: pathLength(graph, path), cost: result.distance };
}

/**
 * The candidate closest by walking from any start node: one Dijkstra run
 * reaches every candidate through its own virtual node.
 * @param {import('./graph.js').Graph} graph
 * @param {Map<string, number>} starts Node id → extra cost.
 * @param {Array<{id: string, nodes: Map<string, number>}>} candidates
 *        Each candidate's reachable nodes with the extra cost to get from
 *        that node to the candidate (e.g. the last meters off the path).
 * @param {RouteOptions} [options]
 * @returns {{candidateId: string, path: string[], distance: number, cost: number}|null}
 */
export function findNearest(graph, starts, candidates, options = {}) {
  const real = realNeighbors(graph, options);
  const startList = [...starts].filter(([id]) => graph.nodes.has(id));
  const PREFIX = '__candidate__:';
  const exits = new Map(); // node id → [{to: virtual candidate, distance}]
  for (const candidate of candidates) {
    for (const [node, cost] of candidate.nodes) {
      if (!graph.nodes.has(node)) continue;
      if (!exits.has(node)) exits.set(node, []);
      exits.get(node).push({ to: PREFIX + candidate.id, distance: cost });
    }
  }
  if (startList.length === 0 || exits.size === 0) return null;

  const getNeighbors = (id) => {
    if (id === VIRTUAL_SOURCE) return startList.map(([to, cost]) => ({ to, distance: cost }));
    if (id.startsWith(PREFIX)) return [{ to: VIRTUAL_TARGET, distance: 0 }];
    if (id === VIRTUAL_TARGET) return [];
    return [...real(id), ...(exits.get(id) ?? [])];
  };
  const result = dijkstra(getNeighbors, VIRTUAL_SOURCE, VIRTUAL_TARGET);
  if (!result) return null;
  const candidateNode = result.path[result.path.length - 2];
  const path = result.path.filter(
    (id) => id !== VIRTUAL_SOURCE && id !== VIRTUAL_TARGET && !id.startsWith(PREFIX),
  );
  const extra = (exits.get(path[path.length - 1]) ?? []).find((e) => e.to === candidateNode);
  return {
    candidateId: candidateNode.slice(PREFIX.length),
    path,
    distance: pathLength(graph, path) + (extra?.distance ?? 0),
    cost: result.distance,
  };
}
