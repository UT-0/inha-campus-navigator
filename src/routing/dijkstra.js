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
