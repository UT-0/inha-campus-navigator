/**
 * Geometry helpers for the data build scripts: OSM element lookup, ring
 * assembly for multipolygons, Douglas–Peucker simplification, polygon area
 * and a "pole of inaccessibility" label point.
 */

/**
 * Indexes the elements of an OSM API JSON response.
 * @param {{elements: object[]}} data
 */
export function indexOsm(data) {
  const nodes = new Map();
  const ways = new Map();
  const relations = new Map();
  for (const e of data.elements) {
    if (e.type === 'node') nodes.set(e.id, e);
    else if (e.type === 'way') ways.set(e.id, e);
    else if (e.type === 'relation') relations.set(e.id, e);
  }
  return { nodes, ways, relations };
}

/**
 * Joins way segments into closed rings by matching end nodes (needed for
 * multipolygon relations whose outer ring is split across several ways).
 * @param {number[][]} segments Lists of node ids.
 * @returns {number[][]} Closed rings (first id === last id).
 */
export function joinRings(segments) {
  const pending = segments.map((s) => [...s]);
  const rings = [];
  while (pending.length > 0) {
    let ring = pending.shift();
    let guard = 0;
    while (ring[0] !== ring[ring.length - 1] && guard++ < 1000) {
      const end = ring[ring.length - 1];
      const index = pending.findIndex((s) => s[0] === end || s[s.length - 1] === end);
      if (index === -1) break;
      const [next] = pending.splice(index, 1);
      ring = ring.concat(next[0] === end ? next.slice(1) : next.reverse().slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

/** Perpendicular distance from p to segment a–b. */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas–Peucker line simplification.
 * @param {number[][]} points
 * @param {number} tolerance In map units (meters).
 * @returns {number[][]}
 */
export function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

/**
 * Simplifies a closed ring (keeps at least a triangle).
 * @param {number[][]} ring Without the repeated closing point.
 * @param {number} tolerance
 */
export function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;
  // Split at the point farthest from the first one so both halves are open lines.
  let far = 1;
  let best = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = simplify(ring.slice(0, far + 1), tolerance);
  const b = simplify([...ring.slice(far), ring[0]], tolerance);
  const result = a.slice(0, -1).concat(b.slice(0, -1));
  return result.length >= 3 ? result : ring;
}

/** Signed area of a ring (shoelace formula). */
export function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Ray-casting point-in-ring test. */
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the outline of a ring. */
export function distanceToRing(p, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    best = Math.min(best, segmentDistance(p, ring[i], ring[(i + 1) % ring.length]));
  }
  return best;
}

/**
 * A good label position: the point inside the polygon farthest from its
 * edges (a coarse "pole of inaccessibility"), so U- and L-shaped buildings
 * get their label inside the building rather than in a courtyard.
 * @param {number[][]} outer
 * @param {number[][][]} [holes]
 * @returns {number[]}
 */
export function labelPoint(outer, holes = []) {
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const step = Math.max(0.5, Math.min(maxX - minX, maxY - minY) / 40);
  let best = null;
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let y = minY + step / 2; y < maxY; y += step) {
      const p = [x, y];
      if (!pointInRing(p, outer) || holes.some((h) => pointInRing(p, h))) continue;
      const d = Math.min(distanceToRing(p, outer), ...holes.map((h) => distanceToRing(p, h)));
      if (!best || d > best.d) best = { p, d };
    }
  }
  if (best) return best.p;
  return [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length];
}

/** Rounds a coordinate pair to 0.1 m to keep the JSON small. */
export function round([x, y]) {
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}
