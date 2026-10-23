/**
 * Tests for the map projection: lat/lon → meters and back, and how well map
 * distances match real (great-circle) distances across the campus.
 */
import { describe, expect, it } from 'vitest';
import { createProjection, haversineMeters } from '../src/utils/projection.js';
import { toMapPoint, nearestBuilding } from '../src/utils/location.js';
import campus from '../src/data/campus.json';

const projection = createProjection(campus.meta.projection);
// Corners of the area the map covers, and two well-known points.
const points = [
  { lat: 37.4449572, lon: 126.6473094 },
  { lat: 37.4534846, lon: 126.6615749 },
  { lat: 37.4534846, lon: 126.6473094 },
  { lat: 37.4449572, lon: 126.6615749 },
  { lat: 37.4482513, lon: 126.6535706 }, // somewhere mid-campus
];

describe('projection', () => {
  it('round-trips within 0.5 m', () => {
    for (const p of points) {
      const { x, y } = projection.project(p.lat, p.lon);
      const back = projection.unproject(x, y);
      expect(haversineMeters(p, back)).toBeLessThan(0.5);
    }
  });

  it('keeps map distances within 0.5 m of real distances across the map', () => {
    for (const a of points) {
      for (const b of points) {
        const pa = projection.project(a.lat, a.lon);
        const pb = projection.project(b.lat, b.lon);
        const map = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        expect(Math.abs(map - haversineMeters(a, b))).toBeLessThan(0.5);
      }
    }
  });

  it('puts north up and east right', () => {
    const center = projection.project(campus.meta.projection.lat0, campus.meta.projection.lon0);
    const north = projection.project(
      campus.meta.projection.lat0 + 0.001,
      campus.meta.projection.lon0,
    );
    const east = projection.project(
      campus.meta.projection.lat0,
      campus.meta.projection.lon0 + 0.001,
    );
    expect(center.x).toBeCloseTo(0, 6);
    expect(north.y).toBeLessThan(0);
    expect(east.x).toBeGreaterThan(0);
  });
});

describe('use my location', () => {
  it('places a GPS fix on the right building', () => {
    // The main gate node from OpenStreetMap (node 4741793208).
    const gate = campus.nodes.find((n) => n.gateId === 'g-main');
    const back = projection.unproject(gate.x, gate.y);
    const point = toMapPoint(campus, back.lat, back.lon);
    expect(Math.hypot(point.x - gate.x, point.y - gate.y)).toBeLessThan(0.5);

    // A point inside the library is "in" the library.
    const library = campus.buildings.find((b) => b.id === 'b-library');
    const [lx, ly] = library.labelPosition;
    const nearest = nearestBuilding(campus, { x: lx, y: ly });
    expect(nearest.building.id).toBe('b-library');
    expect(nearest.meters).toBe(0);
  });
});
