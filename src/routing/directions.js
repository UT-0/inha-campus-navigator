/**
 * Turns a route (a list of node ids) into human-readable walking directions.
 *
 * 1. The path is split into segments (node → next node), each with a compass
 *    bearing and a length in meters.
 * 2. Consecutive segments that continue roughly straight (heading change
 *    under 30°) are merged into one "leg".
 * 3. Every leg after the first starts with a turn, classified by how much
 *    the heading changes (slight / normal / sharp, left / right).
 * 4. Each leg mentions a landmark when possible: the named junction where
 *    you turn, and a building, named junction or POI you walk past.
 * 5. The first step says which entrance to leave by; the last says which
 *    entrance you arrive at.
 *
 * All text is produced through the translator passed in, so the same steps
 * work in English and Korean. Pure module (no DOM) for unit testing.
 */
import {
  bearing,
  cardinalSide,
  compassDirection,
  distance,
  pointToSegment,
  shapeCentroid,
  shapeToSegmentDistance,
  turnAngle,
} from '../utils/geometry.js';

/** Heading changes (degrees) that separate the turn classes. */
export const TURN_THRESHOLDS = { straight: 30, slight: 60, normal: 135, uturn: 165 };

/** A building counts as "passed" if it is within this many meters of the leg. */
const LANDMARK_BUILDING_METERS = 20;
/** A POI counts as "passed" if it is within this many meters of the leg. */
const LANDMARK_POI_METERS = 15;

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
 * @property {string[]} nodeIds       Nodes covered by this step (for map highlighting).
 */

/**
 * @typedef {Object} Directions
 * @property {DirectionStep[]} steps
 * @property {number} totalMeters
 * @property {number} minutes
 * @property {boolean} hasStairs
 * @property {boolean} hasCovered
 */

/**
 * Builds step-by-step directions for a path.
 * @param {Object} options
 * @param {string[]} options.path         Node ids from start entrance to destination entrance.
 * @param {import('./graph.js').Graph} options.graph
 * @param {object} options.campus         Parsed campus.json (for landmarks and walking speed).
 * @param {object} options.fromBuilding   Start building.
 * @param {object} options.toBuilding     Destination building.
 * @param {(key:string, params?:object)=>string} options.t Translator.
 * @param {'en'|'ko'} options.lang        Language used for names from the data.
 * @returns {Directions}
 */
export function buildDirections({ path, graph, campus, fromBuilding, toBuilding, t, lang }) {
  const name = (value) => (value ? (value[lang] ?? value.en ?? '') : '');
  const nodes = path.map((id) => graph.nodes.get(id));
  const segments = buildSegments(path, nodes, graph);
  const legs = mergeIntoLegs(segments);

  const steps = [];
  const fromName = name(fromBuilding.name);
  const toName = name(toBuilding.name);

  // 1. Leave the start building.
  const exitSide = sideOfBuilding(fromBuilding, nodes[0]);
  steps.push(
    makeStep(t, 'exit', 'dir.exit', { building: fromName, side: t(`side.${exitSide}`) }, 0, [
      path[0],
    ]),
  );

  // 2. One step per leg.
  const excluded = new Set([fromBuilding.id, toBuilding.id]);
  legs.forEach((leg, index) => {
    const legNodeIds = [leg.segments[0].fromId, ...leg.segments.map((s) => s.toId)];
    const legMeters = leg.segments.reduce((sum, s) => sum + s.meters, 0);
    const distanceText = formatDistance(legMeters, t);
    const landmark = findLandmark(leg, campus, graph, excluded, name);
    const hasStairs = leg.segments.some((s) => s.stairs);

    let key;
    let params;
    let icon;
    if (index === 0) {
      icon = 'straight';
      const direction = t(`compass.${compassDirection(leg.segments[0].bearing)}`);
      key = landmark ? 'dir.headPast' : 'dir.head';
      params = { direction, distance: distanceText, landmark };
    } else {
      icon = leg.turn;
      const place = placeName(graph.nodes.get(leg.segments[0].fromId), campus, excluded, name);
      const turn = t(`turn.${leg.turn}`);
      key = place
        ? landmark
          ? 'dir.turnAtPast'
          : 'dir.turnAt'
        : landmark
          ? 'dir.turnPast'
          : 'dir.turn';
      params = { turn, place, distance: distanceText, landmark };
    }
    const step = makeStep(t, icon, key, params, legMeters, legNodeIds);
    if (hasStairs) step.text += ` ${t('dir.stairs')}`;
    steps.push(step);
  });

  // 3. Arrive at the destination.
  const last = nodes[nodes.length - 1];
  const arriveSide = sideOfBuilding(toBuilding, last);
  steps.push(
    makeStep(t, 'arrive', 'dir.arrive', { building: toName, side: t(`side.${arriveSide}`) }, 0, [
      path[path.length - 1],
    ]),
  );

  const totalMeters = segments.reduce((sum, s) => sum + s.meters, 0);
  return {
    steps,
    totalMeters,
    minutes: walkingMinutes(totalMeters, campus.meta?.walkingSpeedMetersPerMin),
    hasStairs: segments.some((s) => s.stairs),
    hasCovered: segments.some((s) => s.covered),
  };
}

/** Creates a step object and its translated text. */
function makeStep(t, icon, key, params, distanceMeters, nodeIds) {
  return { icon, key, params, text: t(key, params), distanceMeters, nodeIds };
}

/**
 * Converts consecutive node pairs into segments with bearing and length.
 * Zero-length segments are dropped because they have no direction.
 */
function buildSegments(path, nodes, graph) {
  const segments = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const link = graph.adjacency.get(a.id)?.find((n) => n.to === b.id);
    const meters = link ? link.distance : distance(a, b) * graph.metersPerUnit;
    if (distance(a, b) === 0) continue;
    segments.push({
      fromId: path[i],
      toId: path[i + 1],
      a,
      b,
      bearing: bearing(a, b),
      meters,
      stairs: Boolean(link?.edge?.stairs),
      covered: Boolean(link?.edge?.covered),
    });
  }
  return segments;
}

/**
 * Groups segments into legs: a new leg starts whenever the heading changes
 * by at least the "straight" threshold.
 */
function mergeIntoLegs(segments) {
  const legs = [];
  for (const segment of segments) {
    const current = legs[legs.length - 1];
    if (!current) {
      legs.push({ turn: null, segments: [segment] });
      continue;
    }
    const previous = current.segments[current.segments.length - 1];
    const turn = classifyTurn(turnAngle(previous.bearing, segment.bearing));
    if (turn === 'straight') current.segments.push(segment);
    else legs.push({ turn, segments: [segment] });
  }
  return legs;
}

/** Which side of a building (north/east/south/west) an entrance node is on. */
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

/**
 * Picks one landmark that the leg walks past: the closest building beside the
 * path; otherwise a named junction passed straight through; otherwise a POI.
 */
function findLandmark(leg, campus, graph, excluded, name) {
  const unitsToMeters = graph.metersPerUnit;

  let best = null;
  for (const building of campus.buildings) {
    if (excluded.has(building.id)) continue;
    const meters =
      Math.min(...leg.segments.map((s) => shapeToSegmentDistance(building, s.a, s.b))) *
      unitsToMeters;
    // Only count it as "passing" if the building lies alongside the leg, not
    // just beyond one of its ends.
    if (meters > LANDMARK_BUILDING_METERS || !isAlongside(shapeCentroid(building), leg)) continue;
    if (!best || meters < best.meters) best = { meters, label: name(building.name) };
  }
  if (best) return best.label;

  for (const s of leg.segments.slice(0, -1)) {
    const node = graph.nodes.get(s.toId);
    if (node?.name) return name(node.name);
  }

  let bestPoi = null;
  for (const poi of campus.pois ?? []) {
    if (!poi.name) continue;
    const meters =
      Math.min(...leg.segments.map((s) => pointToSegment(poi, s.a, s.b).distance)) * unitsToMeters;
    if (meters > LANDMARK_POI_METERS || !isAlongside(poi, leg)) continue;
    if (!bestPoi || meters < bestPoi.meters) bestPoi = { meters, label: name(poi.name) };
  }
  return bestPoi ? bestPoi.label : null;
}

/**
 * True if the point's closest position on the leg lies in its interior
 * (between 5% and 95% of the leg's length).
 */
function isAlongside(point, leg) {
  const total = leg.segments.reduce((sum, s) => sum + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0);
  let walked = 0;
  let closest = { distance: Infinity, position: 0 };
  for (const s of leg.segments) {
    const length = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const { distance: d, t } = pointToSegment(point, s.a, s.b);
    if (d < closest.distance) closest = { distance: d, position: walked + t * length };
    walked += length;
  }
  const fraction = total > 0 ? closest.position / total : 0;
  return fraction > 0.05 && fraction < 0.95;
}
