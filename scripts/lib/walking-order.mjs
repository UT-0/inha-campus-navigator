/**
 * Orders buildings into an efficient walk for on-campus checks: start at the
 * building nearest the main gate, visit the closest remaining building by
 * real walking distance (greedy nearest neighbour on the routing graph),
 * then shorten the walk with 2-opt. Good enough for a printable checklist.
 */
import { createRouter } from '../../src/routing/router.js';

/**
 * @param {object} campus Parsed campus.json.
 * @param {string[]} ids  Buildings to visit.
 * @param {string} [startGateId='g-main']
 * @returns {Array<{id: string, walk: number}>} Visiting order with the
 *          walking distance (m) from the previous stop (0 for the first).
 */
export function walkingOrder(campus, ids, startGateId = 'g-main') {
  if (ids.length === 0) return [];
  const router = createRouter(campus);
  const byId = new Map(campus.buildings.map((b) => [b.id, b]));
  const gate = campus.nodes.find((n) => n.gateId === startGateId) ?? campus.nodes[0];
  const remaining = new Set(ids);

  const [lx, ly] = [gate.x, gate.y];
  let current = [...remaining].sort((a, b) => {
    const [ax, ay] = byId.get(a).labelPosition;
    const [bx, by] = byId.get(b).labelPosition;
    return Math.hypot(ax - lx, ay - ly) - Math.hypot(bx - lx, by - ly);
  })[0];
  const order = [{ id: current, walk: 0 }];
  remaining.delete(current);

  // Walking distances between every pair (unreachable pairs count as far).
  const list = [current, ...remaining];
  const FAR = 1e6;
  const dist = list.map((a) =>
    list.map((b) => (a === b ? 0 : (router.findRoute(a, b).route?.distance ?? FAR))),
  );

  // Greedy nearest neighbour from the first stop…
  let tour = [0];
  const left = new Set(list.keys());
  left.delete(0);
  while (left.size > 0) {
    const last = tour[tour.length - 1];
    let next = null;
    for (const j of left) if (next === null || dist[last][j] < dist[last][next]) next = j;
    tour.push(next);
    left.delete(next);
  }

  // …then 2-opt: reverse any stretch that makes the open walk shorter.
  const length = (t) => t.slice(1).reduce((sum, j, i) => sum + dist[t[i]][j], 0);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < tour.length - 1; i++) {
      for (let k = i + 1; k < tour.length; k++) {
        const candidate = [
          ...tour.slice(0, i),
          ...tour.slice(i, k + 1).reverse(),
          ...tour.slice(k + 1),
        ];
        if (length(candidate) + 1e-6 < length(tour)) {
          tour = candidate;
          improved = true;
        }
      }
    }
  }

  order.length = 0;
  tour.forEach((j, i) => {
    const d = i === 0 ? 0 : dist[tour[i - 1]][j];
    order.push({ id: list[j], walk: d >= FAR ? null : Math.round(d) });
  });
  return order;
}
