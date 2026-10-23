/**
 * Builds the walking graph from OpenStreetMap ways.
 *
 *  1. Keep ways people can walk on (footways, paths, steps, pedestrian
 *     streets, service roads, residential and minor roads with sidewalks),
 *     except ways tagged access=private/no or foot=no.
 *  2. Split ways where they meet, so every intersection becomes a node.
 *     Edge lengths are measured along the real geometry.
 *  3. Keep the largest connected network; bridge other parts only across
 *     gaps under BRIDGE_MAX_METERS (marked "estimated"), report the rest.
 *  4. Attach building entrances: OSM entrance nodes when mapped, otherwise
 *     one estimated entrance on the outline point closest to a path. Each
 *     entrance is snapped onto the nearest path by splitting that edge.
 *  5. Merge chains of plain degree-2 nodes into single edges (the full
 *     polyline is kept for drawing and for turn detection).
 */
import { pointInRing, simplify, round } from './geo.mjs';

const WALKABLE = new Set([
  'footway',
  'path',
  'pedestrian',
  'steps',
  'service',
  'residential',
  'living_street',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'track',
  'cycleway',
  'corridor',
]);
/** Classes that carry vehicles: directions say "walk along the road". */
const VEHICLE_ROADS = new Set([
  'service',
  'residential',
  'living_street',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'track',
]);
export const BRIDGE_MAX_METERS = 5;

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const polylineLength = (points) =>
  points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0);

/** Closest point on segment a–b to p, with its distance and position t. */
function projectOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { point: q, distance: dist(p, q), t };
}

function isWalkable(tags) {
  if (!tags || !WALKABLE.has(tags.highway)) return false;
  if (tags.foot === 'no') return false;
  const footAllowed =
    tags.foot === 'yes' || tags.foot === 'designated' || tags.foot === 'permissive';
  if ((tags.access === 'private' || tags.access === 'no') && !footAllowed) return false;
  if (tags.area === 'yes') return false;
  return true;
}

/**
 * @param {Object} input
 * @param {ReturnType<import('./geo.mjs').indexOsm>} input.osm
 * @param {(node: object) => number[]} input.toXY
 * @param {Array<{id: string, polygons: number[][][], osmWays: Set<number>}>} input.buildings
 *        App buildings with the OSM way ids of their outlines.
 * @param {Array<{id: string, osmNode: number, name: {ko: string, en: string}}>} input.gates
 * @param {number[][]} input.campusRing Campus outline, to decide which network to keep.
 */
export function buildWalkGraph({ osm, toXY, buildings, gates, campusRing }) {
  const report = {
    droppedComponents: [],
    bridges: [],
    snappedEntrances: [],
    estimatedEntrances: [],
    skippedEntrances: [],
  };

  // ---------- 1. Walkable ways ----------
  const ways = [...osm.ways.values()].filter((w) => isWalkable(w.tags));
  const useCount = new Map();
  for (const way of ways) {
    const seen = new Set();
    way.nodes.forEach((id, index) => {
      const isEnd = index === 0 || index === way.nodes.length - 1;
      const repeat = seen.has(id);
      seen.add(id);
      useCount.set(id, (useCount.get(id) ?? 0) + (isEnd || repeat ? 2 : 1));
    });
  }
  const gateNodeIds = new Set(gates.map((g) => g.osmNode));
  const isSpecial = (id) => {
    const tags = osm.nodes.get(id)?.tags ?? {};
    return Boolean(tags.entrance) || gateNodeIds.has(id);
  };

  // ---------- 2. Split ways into edges ----------
  const nodes = new Map(); // id -> {id, x, y, type, osmId, name?}
  const edges = []; // {from, to, geometry, distance, ...attrs}
  const nodeId = (osmId) => `n${osmId}`;
  const ensureNode = (osmId) => {
    const id = nodeId(osmId);
    if (!nodes.has(id)) {
      const [x, y] = toXY(osm.nodes.get(osmId));
      nodes.set(id, { id, x, y, type: 'junction', osmId });
    }
    return id;
  };

  for (const way of ways) {
    const tags = way.tags;
    const ids = way.nodes.filter((id) => osm.nodes.has(id));
    let start = 0;
    for (let i = 1; i < ids.length; i++) {
      const id = ids[i];
      const isLast = i === ids.length - 1;
      if (!isLast && (useCount.get(id) ?? 0) < 2 && !isSpecial(id)) continue;
      const slice = ids.slice(start, i + 1);
      const geometry = slice.map((n) => toXY(osm.nodes.get(n)));
      const crossing =
        tags.footway === 'crossing' ||
        Boolean(tags.crossing) ||
        slice.some((n) => osm.nodes.get(n).tags?.highway === 'crossing');
      edges.push({
        from: ensureNode(slice[0]),
        to: ensureNode(slice[slice.length - 1]),
        geometry,
        distance: polylineLength(geometry),
        road: VEHICLE_ROADS.has(tags.highway),
        stairs: tags.highway === 'steps',
        covered: tags.covered === 'yes' || tags.tunnel === 'building_passage',
        ...(crossing ? { crossing: true } : {}),
        ...(tags.surface ? { surface: tags.surface } : {}),
        ...(tags.incline ? { incline: tags.incline } : {}),
        ...(tags.name ? { name: { ko: tags.name, en: tags['name:en'] ?? tags.name } } : {}),
        osmWay: way.id,
        status: 'osm',
      });
      start = i;
    }
  }

  // ---------- 3. Connectivity ----------
  const adjacency = () => {
    const adj = new Map([...nodes.keys()].map((id) => [id, []]));
    edges.forEach((e, index) => {
      adj.get(e.from).push(index);
      adj.get(e.to).push(index);
    });
    return adj;
  };
  const components = () => {
    const adj = adjacency();
    const seen = new Set();
    const result = [];
    for (const start of nodes.keys()) {
      if (seen.has(start)) continue;
      const stack = [start];
      const members = [];
      seen.add(start);
      while (stack.length) {
        const id = stack.pop();
        members.push(id);
        for (const index of adj.get(id)) {
          const e = edges[index];
          const other = e.from === id ? e.to : e.from;
          if (!seen.has(other)) {
            seen.add(other);
            stack.push(other);
          }
        }
      }
      result.push(members);
    }
    return result;
  };
  const insideCampus = (id) => {
    const n = nodes.get(id);
    return pointInRing([n.x, n.y], campusRing);
  };

  let parts = components().sort(
    (a, b) => b.filter(insideCampus).length - a.filter(insideCampus).length || b.length - a.length,
  );
  const main = new Set(parts[0]);
  for (const part of parts.slice(1)) {
    // Closest pair of nodes between this part and the main network.
    let best = null;
    for (const a of part) {
      const pa = nodes.get(a);
      for (const b of main) {
        const pb = nodes.get(b);
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    if (best && best.d <= BRIDGE_MAX_METERS) {
      const pa = nodes.get(best.a);
      const pb = nodes.get(best.b);
      edges.push({
        from: best.a,
        to: best.b,
        geometry: [
          [pa.x, pa.y],
          [pb.x, pb.y],
        ],
        distance: best.d,
        road: false,
        stairs: false,
        covered: false,
        status: 'estimated',
        note: 'Bridges a gap in the mapped paths',
      });
      report.bridges.push({ from: best.a, to: best.b, meters: +best.d.toFixed(1) });
      part.forEach((id) => main.add(id));
    } else {
      report.droppedComponents.push({
        nodes: part.length,
        insideCampus: part.some(insideCampus),
        gapMeters: best ? +best.d.toFixed(1) : null,
        osmWays: [...new Set(edges.filter((e) => part.includes(e.from)).map((e) => e.osmWay))],
        sample: nodes.get(part[0]),
      });
    }
  }
  // Keep only the connected network.
  for (const id of [...nodes.keys()]) if (!main.has(id)) nodes.delete(id);
  for (let i = edges.length - 1; i >= 0; i--) if (!nodes.has(edges[i].from)) edges.splice(i, 1);

  // ---------- 4. Entrances ----------
  let snapCounter = 0;

  /** Splits the nearest edge at the point closest to p; returns the new/existing node id. */
  function snapToNetwork(p) {
    let best = null;
    edges.forEach((edge, index) => {
      for (let i = 0; i + 1 < edge.geometry.length; i++) {
        const hit = projectOnSegment(p, edge.geometry[i], edge.geometry[i + 1]);
        if (!best || hit.distance < best.distance) best = { ...hit, index, segment: i };
      }
    });
    const edge = edges[best.index];
    const geometry = edge.geometry;
    const atStart = best.segment === 0 && best.t < 1e-6;
    const atEnd = best.segment === geometry.length - 2 && best.t > 1 - 1e-6;
    if (atStart) return { id: edge.from, distance: best.distance, point: geometry[0] };
    if (atEnd)
      return { id: edge.to, distance: best.distance, point: geometry[geometry.length - 1] };
    const id = `s${++snapCounter}`;
    nodes.set(id, {
      id,
      x: best.point[0],
      y: best.point[1],
      type: 'junction',
      status: 'estimated',
    });
    const first = [...geometry.slice(0, best.segment + 1), best.point];
    const second = [best.point, ...geometry.slice(best.segment + 1)];
    edges.splice(
      best.index,
      1,
      { ...edge, to: id, geometry: first, distance: polylineLength(first) },
      { ...edge, from: id, geometry: second, distance: polylineLength(second) },
    );
    return { id, distance: best.distance, point: best.point };
  }

  function connectEntrance(entranceId, point, label) {
    const snap = snapToNetwork(point);
    if (snap.id === entranceId) return;
    if (snap.distance < 0.05) {
      // Practically on the path: reuse the path node position.
      edges.push({
        from: entranceId,
        to: snap.id,
        geometry: [point, snap.point],
        distance: snap.distance,
        road: false,
        stairs: false,
        covered: false,
        status: 'osm',
      });
      return;
    }
    edges.push({
      from: entranceId,
      to: snap.id,
      geometry: [point, snap.point],
      distance: snap.distance,
      road: false,
      stairs: false,
      covered: false,
      status: 'estimated',
      note: 'Straight link from the entrance to the nearest mapped path',
    });
    report.snappedEntrances.push({
      entrance: entranceId,
      label,
      meters: +snap.distance.toFixed(1),
    });
  }

  // Which building outline (way) each OSM node belongs to.
  const wayToBuilding = new Map();
  for (const b of buildings) for (const wayId of b.osmWays) wayToBuilding.set(wayId, b.id);
  const nodeToBuilding = new Map();
  for (const [wayId, buildingId] of wayToBuilding) {
    for (const id of osm.ways.get(wayId)?.nodes ?? []) nodeToBuilding.set(id, buildingId);
  }

  const entrancesByBuilding = new Map(buildings.map((b) => [b.id, []]));
  for (const node of osm.nodes.values()) {
    const tags = node.tags ?? {};
    if (!tags.entrance) continue;
    const buildingId = nodeToBuilding.get(node.id);
    if (!buildingId) continue;
    const label = tags.ref ?? tags.name ?? tags.description ?? null;
    if (tags.access === 'private' || tags.access === 'no') {
      report.skippedEntrances.push({
        osmNode: node.id,
        building: buildingId,
        label,
        reason: `access=${tags.access}`,
      });
      continue;
    }
    const id = nodeId(node.id);
    const [x, y] = toXY(node);
    const entrance = {
      id,
      x,
      y,
      type: 'entrance',
      building: buildingId,
      osmId: node.id,
      status: 'osm',
      ...(label ? { label } : {}),
      ...(tags.wheelchair ? { wheelchair: tags.wheelchair } : {}),
      ...(tags.access ? { access: tags.access } : {}),
      ...(tags.level ? { level: tags.level } : {}),
    };
    const onNetwork = nodes.has(id);
    nodes.set(id, { ...(nodes.get(id) ?? {}), ...entrance });
    if (!onNetwork) connectEntrance(id, [x, y], label);
    entrancesByBuilding.get(buildingId).push(id);
  }

  // Buildings without a mapped entrance: one estimated entrance.
  for (const b of buildings) {
    if (entrancesByBuilding.get(b.id).length > 0) continue;
    let best = null;
    for (const ring of b.polygons) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const c = ring[(i + 1) % ring.length];
        const steps = Math.max(1, Math.ceil(dist(a, c)));
        for (let s = 0; s <= steps; s++) {
          const p = [a[0] + ((c[0] - a[0]) * s) / steps, a[1] + ((c[1] - a[1]) * s) / steps];
          for (const edge of edges) {
            for (let k = 0; k + 1 < edge.geometry.length; k++) {
              const hit = projectOnSegment(p, edge.geometry[k], edge.geometry[k + 1]);
              if (!best || hit.distance < best.distance)
                best = { point: p, distance: hit.distance };
            }
          }
        }
      }
    }
    const id = `e-${b.id}-1`;
    nodes.set(id, {
      id,
      x: best.point[0],
      y: best.point[1],
      type: 'entrance',
      building: b.id,
      status: 'estimated',
    });
    connectEntrance(id, best.point, null);
    entrancesByBuilding.get(b.id).push(id);
    report.estimatedEntrances.push({
      building: b.id,
      entrance: id,
      metersToPath: +best.distance.toFixed(1),
    });
  }

  // Gates.
  for (const gate of gates) {
    const osmNode = osm.nodes.get(gate.osmNode);
    const [x, y] = toXY(osmNode);
    const id = nodeId(gate.osmNode);
    const onNetwork = nodes.has(id);
    nodes.set(id, {
      ...(nodes.get(id) ?? {}),
      id,
      x,
      y,
      type: 'gate',
      name: gate.name,
      gateId: gate.id,
      osmId: gate.osmNode,
      status: 'osm',
    });
    if (!onNetwork) connectEntrance(id, [x, y], gate.name.ko);
  }

  // Named OSM junction nodes become landmarks.
  for (const node of nodes.values()) {
    if (node.type !== 'junction' || !node.osmId || node.name) continue;
    const tags = osm.nodes.get(node.osmId)?.tags;
    if (tags?.name && !tags.entrance)
      node.name = { ko: tags.name, en: tags['name:en'] ?? tags.name };
  }

  // ---------- 5. Merge degree-2 chains ----------
  const attrsKey = (e) =>
    JSON.stringify([
      e.road,
      e.stairs,
      e.covered,
      e.crossing ?? false,
      e.status,
      e.name?.ko ?? '',
      e.surface ?? '',
      e.incline ?? '',
    ]);
  let merged = true;
  while (merged) {
    merged = false;
    const adj = adjacency();
    for (const [id, incident] of adj) {
      const node = nodes.get(id);
      if (
        incident.length !== 2 ||
        node.type !== 'junction' ||
        node.name ||
        node.status === 'estimated'
      )
        continue;
      const [e1, e2] = incident.map((i) => edges[i]);
      if (e1 === e2 || attrsKey(e1) !== attrsKey(e2)) continue;
      const a = e1.from === id ? e1.to : e1.from;
      const b = e2.from === id ? e2.to : e2.from;
      if (a === b || a === id || b === id) continue;
      const g1 = e1.to === id ? e1.geometry : [...e1.geometry].reverse(); // a -> id
      const g2 = e2.from === id ? e2.geometry : [...e2.geometry].reverse(); // id -> b
      const geometry = [...g1, ...g2.slice(1)];
      const combined = { ...e1, from: a, to: b, geometry, distance: e1.distance + e2.distance };
      delete combined.osmWay;
      combined.osmWays = [
        ...new Set([e1.osmWay ?? e1.osmWays, e2.osmWay ?? e2.osmWays].flat().filter(Boolean)),
      ];
      const [hi, lo] = incident[0] > incident[1] ? incident : [incident[1], incident[0]];
      edges.splice(hi, 1);
      edges.splice(lo, 1, combined);
      nodes.delete(id);
      merged = true;
      break;
    }
  }

  // ---------- Output ----------
  const outNodes = [...nodes.values()].map((n) => {
    const out = {
      id: n.id,
      x: Math.round(n.x * 10) / 10,
      y: Math.round(n.y * 10) / 10,
      type: n.type,
    };
    for (const key of [
      'building',
      'name',
      'label',
      'gateId',
      'status',
      'wheelchair',
      'access',
      'level',
    ]) {
      if (n[key] !== undefined) out[key] = n[key];
    }
    if (n.osmId) out.osmId = `node/${n.osmId}`;
    return out;
  });
  const outEdges = edges.map((e) => {
    const out = {
      from: e.from,
      to: e.to,
      distance: Math.round(e.distance * 10) / 10,
      geometry: simplify(e.geometry, 0.5).map(round),
      road: e.road,
      stairs: e.stairs,
      covered: e.covered,
      status: e.status,
    };
    for (const key of ['crossing', 'surface', 'incline', 'name', 'note'])
      if (e[key] !== undefined) out[key] = e[key];
    const osmWays = e.osmWays ?? (e.osmWay ? [e.osmWay] : []);
    if (osmWays.length) out.osmWays = osmWays.map((id) => `way/${id}`);
    return out;
  });
  return {
    nodes: outNodes,
    edges: outEdges,
    entrances: Object.fromEntries(entrancesByBuilding),
    report,
  };
}
