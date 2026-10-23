/**
 * Small 2D geometry helpers used by routing, directions and the map.
 *
 * Coordinates are SVG map units: x grows to the right (east) and y grows
 * downwards (south). "Bearing" follows the compass convention: 0° = north
 * (up on the map), 90° = east, 180° = south, 270° = west.
 */

/**
 * Euclidean distance between two points.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Compass bearing from `a` to `b`, in degrees within [0, 360).
 * Because SVG y points down, "north" is the negative y direction.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function bearing(a, b) {
  const deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Signed change of heading from `fromBearing` to `toBearing`, in (-180, 180].
 * Positive values are clockwise (a right turn), negative values a left turn.
 * @param {number} fromBearing
 * @param {number} toBearing
 * @returns {number}
 */
export function turnAngle(fromBearing, toBearing) {
  let delta = (toBearing - fromBearing) % 360;
  if (delta <= -180) delta += 360;
  if (delta > 180) delta -= 360;
  return delta;
}

/**
 * Maps a bearing to one of eight compass directions.
 * @param {number} deg Bearing in degrees.
 * @returns {'north'|'northeast'|'east'|'southeast'|'south'|'southwest'|'west'|'northwest'}
 */
export function compassDirection(deg) {
  const names = [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
  ];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/**
 * Maps a bearing to the nearest of the four sides of a building.
 * @param {number} deg Bearing in degrees.
 * @returns {'north'|'east'|'south'|'west'}
 */
export function cardinalSide(deg) {
  const names = ['north', 'east', 'south', 'west'];
  return names[Math.round((((deg % 360) + 360) % 360) / 90) % 4];
}

/**
 * Area-weighted centroid of a simple polygon (falls back to the vertex average
 * for degenerate polygons).
 * @param {number[][]} polygon Array of [x, y] points.
 * @returns {{x:number,y:number}}
 */
export function polygonCentroid(polygon) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    const n = polygon.length || 1;
    return {
      x: polygon.reduce((s, p) => s + p[0], 0) / n,
      y: polygon.reduce((s, p) => s + p[1], 0) / n,
    };
  }
  area /= 2;
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * Axis-aligned bounding box of a list of points.
 * @param {Array<{x:number,y:number}|number[]>} points Objects or [x, y] pairs.
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function boundsOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const x = Array.isArray(p) ? p[0] : p.x;
    const y = Array.isArray(p) ? p[1] : p.y;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Shortest distance from point `p` to the segment `a`–`b`, plus the position
 * `t` (0..1) of the closest point along the segment.
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {{distance:number, t:number}}
 */
export function pointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return { distance: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

/**
 * Shortest distance between a polygon outline and a segment. Used to decide
 * whether a walking segment passes right next to a building.
 * @param {number[][]} polygon
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function polygonToSegmentDistance(polygon, a, b) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const p = { x: polygon[i][0], y: polygon[i][1] };
    const q = { x: polygon[(i + 1) % polygon.length][0], y: polygon[(i + 1) % polygon.length][1] };
    // For two non-crossing segments, the closest pair always involves an endpoint.
    best = Math.min(
      best,
      pointToSegment(p, a, b).distance,
      pointToSegment(a, p, q).distance,
      pointToSegment(b, p, q).distance,
    );
  }
  return best;
}

/**
 * Ray-casting point-in-polygon test.
 * @param {{x:number,y:number}} p
 * @param {number[][]} polygon
 * @returns {boolean}
 */
export function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Outer rings of a building or area. Accepts the current schema
 * (`polygons: [[[x, y], …], …]`) and the older single `polygon`.
 * @param {{polygons?: number[][][], polygon?: number[][]}} item
 * @returns {number[][][]}
 */
export function outerRings(item) {
  if (Array.isArray(item?.polygons)) return item.polygons.filter((r) => r.length >= 3);
  if (Array.isArray(item?.polygon) && item.polygon.length >= 3) return [item.polygon];
  return [];
}

/**
 * Bounding box of all outer rings of a building or area.
 * @param {object} item
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function shapeBounds(item) {
  return boundsOf(outerRings(item).flat());
}

/**
 * True if the point lies inside the shape (inside an outer ring and not in a hole).
 * @param {{x:number,y:number}} p
 * @param {object} item
 * @returns {boolean}
 */
export function pointInShape(p, item) {
  if (!outerRings(item).some((ring) => pointInPolygon(p, ring))) return false;
  return !(item.holes ?? []).some((ring) => pointInPolygon(p, ring));
}

/**
 * Shortest distance between the outline of a shape and a segment.
 * @param {object} item
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function shapeToSegmentDistance(item, a, b) {
  return Math.min(...outerRings(item).map((ring) => polygonToSegmentDistance(ring, a, b)));
}

/**
 * Area-weighted centre of the largest outer ring.
 * @param {object} item
 * @returns {{x:number,y:number}}
 */
export function shapeCentroid(item) {
  const rings = outerRings(item);
  const largest = rings.reduce(
    (best, ring) => (ringSize(ring) > ringSize(best) ? ring : best),
    rings[0],
  );
  return polygonCentroid(largest);
}

function ringSize(ring) {
  const b = boundsOf(ring);
  return (b.maxX - b.minX) * (b.maxY - b.minY);
}
