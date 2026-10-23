/**
 * Turns a route (a list of node ids) into human-readable walking directions.
 *
 1. The path is split into segments (node → next node) that follow the real
 *    geometry of each walkway, each with its length and the compass bearing
 *    at its start and end (measured over the first/last ~10 m of the curve).
 * 2. Segments are merged into "legs". A new leg (a turn instruction) starts
 *    only at a decision point — an intersection, or a corner sharper than
 *    60° — where the heading changes by 30° or more. Gentle bends along a
 *    path are simply followed.
 * 3. Turns are classified by the heading change (slight / normal / sharp,
 *    left / right, turn around).
 * 4. Each leg mentions what helps people find their way: the named place
 *    where you turn (junction, gate, building entrance), the road it follows,
 *    a building or place it passes, stairs, and road crossings.
 * 5. The first step says which side of the building to leave from; the last
 *    says which side you arrive at.
 *
 * All text is produced through the translator passed in, so the same steps
 * work in English and Korean. Pure module (no DOM) for unit testing.
 */
import {
  bearing,
  cardinalSide,
  compassDirection,
  pointToSegment,
  shapeCentroid,
  shapeToSegmentDistance,
  turnAngle,
} from '../utils/geometry.js';
import { linkBetween, walkGeometry } from './graph.js';

/** Heading changes (degrees) that separate the turn classes. */
export const TURN_THRESHOLDS = { straight: 30, slight: 60, normal: 135, uturn: 165 };

/** A building counts as "passed" if it is within this many meters of the leg. */
const LANDMARK_BUILDING_METERS = 20;
/** A POI counts as "passed" if it is within this many meters of the leg. */
const LANDMARK_POI_METERS = 15;
/** Corners at least this sharp are announced even where paths don't meet. */
const CORNER_DEGREES = 60;
/** Length (m) over which the heading at the start/end of a segment is measured. */
const BEARING_SAMPLE_METERS = 10;
/** A first leg shorter than this is folded into the next one. */
const SHORT_FIRST_LEG_METERS = 15;

/**
 * Classifies a signed heading change (positive = clockwise = right).
 * @param {number} delta Degrees in (-180, 180].
 * @returns {'straight'|'slight-left'|'slight-right'|'left'|'right'|'sharp-left'|'sharp-right'|'uturn'}
 */
export function classifyTurn(delta) {
  const abs = Math.abs(delta);
  const side = delta > 0 ? 'right' : 'left';
  if (abs < TURN_THRESHOLDS.straight) return 'straight';
  if (abs < TURN_THRESHOLDS.slight) return `slight-${side}`;
  if (abs <= TURN_THRESHOLDS.normal) return side;
  if (abs < TURN_THRESHOLDS.uturn) return `sharp-${side}`;
  return 'uturn';
}

/**
 * Rounds a distance for display: to the nearest 10 m, never below 10 m for a
 * non-zero distance.
 * @param {number} meters
 * @returns {number}
 */
export function roundDistance(meters) {
  if (meters <= 0) return 0;
  return Math.max(10, Math.round(meters / 10) * 10);
}

/**
 * Formats a distance with units, e.g. "120 m" or "1.2 km".
 * @param {number} meters
 * @param {(key:string, params?:object)=>string} t Translator.
 * @returns {string}
 */
export function formatDistance(meters, t) {
  const rounded = roundDistance(meters);
  if (rounded >= 1000) {
    return t('units.km', { n: (Math.round(rounded / 100) / 10).toString() });
  }
  return t('units.m', { n: rounded });
}

/**
 * Estimated walking time in whole minutes (minimum 1).
 * @param {number} meters
 * @param {number} speedMetersPerMin
 * @returns {number}
 */
export function walkingMinutes(meters, speedMetersPerMin = 75) {
  return Math.max(1, Math.round(meters / (speedMetersPerMin || 75)));
}

/**
 * @typedef {Object} DirectionStep
 * @property {string} icon            Icon id (exit, straight, left, right, slight-left, …, arrive).
 * @property {string} key             i18n key of the sentence.
 * @property {object} params          Values for the sentence placeholders.
 * @property {string} text            Translated sentence (may contain **bold** markers).
 * @property {number} distanceMeters  Unrounded length of this step in meters.
 * @property {string[]} nodeIds       Graph nodes covered by this step.
 * @property {Array<{x:number,y:number}>} points Geometry of this step (for map highlighting).
 */

/**
 * @typedef {Object} Directions
 * @property {DirectionStep[]} steps
 * @property {number} totalMeters
 * @property {number} minutes
 * @property {boolean} hasStairs
 * @property {boolean} hasCovered
 * @property {boolean} hasCrossing
 */

/**
 * Builds step-by-step directions for a path.
 * @param {Object} options
 * @param {string[]} options.path         Node ids from start entrance to destination entrance.
 * @param {import('./graph.js').Graph} options.graph
 * @param {object} options.campus         Parsed campus.json (for landmarks and walking speed).
 * @param {import('./endpoints.js').Endpoint} [options.from] Start (building or place).
 * @param {import('./endpoints.js').Endpoint} [options.to]   Destination (building or place).
 * @param {object} [options.fromBuilding] Start building (when `from` is not given).
 * @param {object} [options.toBuilding]   Destination building (when `to` is not given).
 * @param {(key:string, params?:object)=>string} options.t Translator.
 * @param {'en'|'ko'} options.lang        Language used for names from the data.
 * @returns {Directions}
 */
export function buildDirections({
  path,
  graph,
  campus,
  from: fromEndpoint,
  to: toEndpoint,
  fromBuilding,
  toBuilding,
  t,
  lang,
}) {
  const from = fromEndpoint ?? asEndpoint(fromBuilding);
  const to = toEndpoint ?? asEndpoint(toBuilding);
  const name = (value) => (value ? (value[lang] ?? value.en ?? value.ko ?? '') : '');
  const segments = buildSegments(path, graph);
  const legs = foldShortFirstLeg(mergeIntoLegs(segments, graph));
  const excluded = new Set([from.building?.id, to.building?.id, from.id, to.id].filter(Boolean));
  const first = graph.nodes.get(path[0]);
  const last = graph.nodes.get(path[path.length - 1]);

  const steps = [];

  // 1. Leave the start building (or start at a place outdoors).
  steps.push(
    from.building
      ? makeStep(
          t,
          'exit',
          'dir.exit',
          {
            building: name(from.name),
            side: t(`side.${sideOfBuilding(from.building, first)}`),
          },
          0,
          [path[0]],
          [first],
        )
      : makeStep(
          t,
          'exit',
          'dir.startPlace',
          { place: name(from.name) },
          from.offMeters ?? 0,
          [path[0]],
          [first],
        ),
  );

  // 2. One step per leg.
  legs.forEach((leg, index) => {
    const legNodeIds = [leg.segments[0].fromId, ...leg.segments.map((s) => s.toId)];
    const legMeters = leg.segments.reduce((sum, s) => sum + s.meters, 0);
    const points = leg.segments.flatMap((s, i) => (i === 0 ? s.points : s.points.slice(1)));
    const landmark = findLandmark(leg, campus, graph, excluded, name);
    const road = roadFollowed(leg, name);
    const pieces = {
      distance: formatDistance(legMeters, t),
      along: road ? t('dir.along', { road }) : '',
      passing: landmark ? t('dir.passing', { landmark }) : '',
    };

    let step;
    if (index === 0) {
      const heading = (leg.headingSegment ?? leg.segments[0]).bearingStart;
      const direction = t(`compass.${compassDirection(heading)}`);
      step = makeStep(
        t,
        'straight',
        'dir.legHead',
        { ...pieces, direction },
        legMeters,
        legNodeIds,
        points,
      );
    } else {
      const place = placeName(graph.nodes.get(leg.segments[0].fromId), campus, excluded, name);
      const turn = t(`turn.${leg.turn}`);
      const start = place ? t('dir.startTurnAt', { turn, place }) : t('dir.startTurn', { turn });
      step = makeStep(
        t,
        leg.turn,
        'dir.legTurn',
        { ...pieces, start },
        legMeters,
        legNodeIds,
        points,
      );
    }
    if (leg.segments.some((s) => s.crossing)) step.text += ` ${t('dir.crossing')}`;
    if (leg.segments.some((s) => s.stairs)) step.text += ` ${t('dir.stairs')}`;
    steps.push(step);
  });

  // 3. Arrive at the destination.
  steps.push(
    to.building
      ? makeStep(
          t,
          'arrive',
          'dir.arrive',
          {
            building: name(to.name),
            side: t(`side.${sideOfBuilding(to.building, last)}`),
          },
          0,
          [path[path.length - 1]],
          [last],
        )
      : makeStep(
          t,
          'arrive',
          'dir.arrivePlace',
          { place: name(to.name) },
          to.offMeters ?? 0,
          [path[path.length - 1]],
          [last],
        ),
  );

  const totalMeters =
    segments.reduce((sum, s) => sum + s.meters, 0) + (from.offMeters ?? 0) + (to.offMeters ?? 0);
  return {
    steps,
    totalMeters,
    minutes: walkingMinutes(totalMeters, campus.meta?.walkingSpeedMetersPerMin),
    hasStairs: segments.some((s) => s.stairs),
    hasCovered: segments.some((s) => s.covered),
    hasCrossing: segments.some((s) => s.crossing),
  };
}

/** Creates a step object and its translated text. */
function makeStep(t, icon, key, params, distanceMeters, nodeIds, points) {
  return { icon, key, params, text: t(key, params), distanceMeters, nodeIds, points };
}

/** Point at `meters` along a polyline (clamped to its ends). */
function pointAlong(points, meters) {
  let walked = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + length >= meters) {
      const f = length === 0 ? 0 : (meters - walked) / length;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    walked += length;
  }
  return points[points.length - 1];
}

function polylineLength(points) {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return total;
}

/**
 * One segment per graph edge on the route, following its real geometry.
 * Zero-length segments are dropped because they have no direction.
 */
function buildSegments(path, graph) {
  const segments = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const link = linkBetween(graph, path[i], path[i + 1]);
    const points = walkGeometry(graph, path[i], path[i + 1]);
    const length = polylineLength(points);
    if (length === 0) continue;
    const sample = Math.min(BEARING_SAMPLE_METERS, length / 2);
    const end = points[points.length - 1];
    segments.push({
      fromId: path[i],
      toId: path[i + 1],
      points,
      a: points[0],
      b: end,
      bearingStart: bearing(points[0], pointAlong(points, sample)),
      bearingEnd: bearing(pointAlong(points, length - sample), end),
      meters: link ? link.distance : length * graph.metersPerUnit,
      stairs: Boolean(link?.edge?.stairs),
      covered: Boolean(link?.edge?.covered),
      crossing: Boolean(link?.edge?.crossing),
      road: Boolean(link?.edge?.road),
      roadName: link?.edge?.name ?? null,
    });
  }
  return segments;
}

/**
 * Groups segments into legs. A turn is announced only at a decision point:
 * a node where three or more walkways meet, or a corner of CORNER_DEGREES
 * or more. Smaller heading changes elsewhere just follow the path.
 */
function mergeIntoLegs(segments, graph) {
  const legs = [];
  for (const segment of segments) {
    const current = legs[legs.length - 1];
    if (!current) {
      legs.push({ turn: null, segments: [segment] });
      continue;
    }
    const previous = current.segments[current.segments.length - 1];
    const delta = turnAngle(previous.bearingEnd, segment.bearingStart);
    const degree = graph.adjacency.get(segment.fromId)?.length ?? 0;
    const decisionPoint = degree >= 3 || Math.abs(delta) >= CORNER_DEGREES;
    const turn = classifyTurn(delta);
    if (turn === 'straight' || !decisionPoint) current.segments.push(segment);
    else legs.push({ turn, segments: [segment] });
  }
  return legs;
}

/**
 * A very short first leg is usually just the link from the door to the
 * path ("Head northwest for 10 m"). Fold it into the next leg, which then
 * starts with a compass direction instead of a turn.
 */
function foldShortFirstLeg(legs) {
  if (legs.length < 2) return legs;
  const firstMeters = legs[0].segments.reduce((sum, s) => sum + s.meters, 0);
  if (firstMeters >= SHORT_FIRST_LEG_METERS) return legs;
  const [first, second, ...rest] = legs;
  const merged = { turn: null, segments: [...first.segments, ...second.segments] };
  // The heading of the combined leg is the heading of its main part.
  merged.headingSegment = second.segments[0];
  return [merged, ...rest];
}

/** Which side of a building (north/east/south/west) an entrance node is on. */
/** Wraps a plain building as a route endpoint (older callers and tests). */
function asEndpoint(building) {
  return { id: building.id, kind: 'building', name: building.name, building, offMeters: 0 };
}

function sideOfBuilding(building, node) {
  const center = shapeCentroid(building);
  return cardinalSide(bearing(center, node));
}

/**
 * Name to use for the node where a turn happens: its own name (junctions,
 * gates), or the building it is an entrance of (if that is not the start or
 * destination building).
 */
function placeName(node, campus, excluded, name) {
  if (!node) return null;
  if (node.name) return name(node.name);
  if (node.type === 'entrance' && node.building && !excluded.has(node.building)) {
    const building = campus.buildings.find((b) => b.id === node.building);
    if (building) return name(building.name);
  }
  return null;
}

/** The named road a leg mostly follows (at least 60% of its length), if any. */
function roadFollowed(leg, name) {
  const total = leg.segments.reduce((sum, s) => sum + s.meters, 0);
  const byName = new Map();
  for (const s of leg.segments) {
    if (!s.roadName) continue;
    const key = name(s.roadName);
    byName.set(key, (byName.get(key) ?? 0) + s.meters);
  }
  for (const [road, meters] of byName) if (total > 0 && meters / total >= 0.6) return road;
  return null;
}

/** All straight pieces of a leg's geometry, as {a, b} pairs. */
function legPieces(leg) {
  return leg.segments.flatMap((s) => s.points.slice(1).map((b, i) => ({ a: s.points[i], b })));
}

/**
 * Picks one landmark that the leg walks past: the closest building beside the
 * path; otherwise a named place passed straight through; otherwise a POI.
 */
function findLandmark(leg, campus, graph, excluded, name) {
  const unitsToMeters = graph.metersPerUnit;
  const pieces = legPieces(leg);

  let best = null;
  for (const building of campus.buildings) {
    if (excluded.has(building.id)) continue;
    const meters =
      Math.min(...pieces.map((p) => shapeToSegmentDistance(building, p.a, p.b))) * unitsToMeters;
    // Only count it as "passing" if the building lies alongside the leg, not
    // just beyond one of its ends.
    if (meters > LANDMARK_BUILDING_METERS || !isAlongside(shapeCentroid(building), pieces))
      continue;
    if (!best || meters < best.meters) best = { meters, label: name(building.name) };
  }
  if (best) return best.label;

  for (const s of leg.segments.slice(0, -1)) {
    const node = graph.nodes.get(s.toId);
    if (node?.name) return name(node.name);
  }

  let bestPoi = null;
  for (const poi of campus.pois ?? []) {
    if (!poi.name || !poi.landmark || !Number.isFinite(poi.x)) continue;
    const meters =
      Math.min(...pieces.map((p) => pointToSegment(poi, p.a, p.b).distance)) * unitsToMeters;
    if (meters > LANDMARK_POI_METERS || !isAlongside(poi, pieces)) continue;
    if (!bestPoi || meters < bestPoi.meters) bestPoi = { meters, label: name(poi.name) };
  }
  return bestPoi ? bestPoi.label : null;
}

/**
 * True if the point's closest position on the leg lies in its interior
 * (between 5% and 95% of the leg's length).
 */
function isAlongside(point, pieces) {
  const total = pieces.reduce((sum, p) => sum + Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y), 0);
  let walked = 0;
  let closest = { distance: Infinity, position: 0 };
  for (const p of pieces) {
    const length = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
    const { distance: d, t } = pointToSegment(point, p.a, p.b);
    if (d < closest.distance) closest = { distance: d, position: walked + t * length };
    walked += length;
  }
  const fraction = total > 0 ? closest.position / total : 0;
  return fraction > 0.05 && fraction < 0.95;
}
