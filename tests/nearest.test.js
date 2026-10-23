/**
 * Tests for accessible routing (no stairs, step-free entrances) and
 * "find nearest" on a small fixture graph and on the real campus.
 */
import { describe, expect, it } from 'vitest';
import { createRouter } from '../src/routing/router.js';
import campus from '../src/data/campus.json';

/**
 *   W(A) ── B ──stairs── C ── D(E)
 *            \          /
 *             ── F ─────          (B–F–C is 60 m longer but step-free)
 * Building "west" has entrance A; building "east" has D (wheelchair=no)
 * and G (step-free) next to it.
 */
const fixture = {
  meta: { metersPerUnit: 1, walkingSpeedMetersPerMin: 75 },
  buildings: [
    {
      id: 'west',
      name: { en: 'West', ko: '서' },
      polygons: [
        [
          [-10, -5],
          [-2, -5],
          [-2, 5],
          [-10, 5],
        ],
      ],
      entrances: ['A'],
    },
    {
      id: 'east',
      name: { en: 'East', ko: '동' },
      polygons: [
        [
          [52, -5],
          [60, -5],
          [60, 5],
          [52, 5],
        ],
      ],
      entrances: ['D', 'G'],
    },
    {
      id: 'shop',
      name: { en: 'Shop', ko: '상점' },
      polygons: [
        [
          [20, 30],
          [30, 30],
          [30, 40],
          [20, 40],
        ],
      ],
      entrances: ['H'],
    },
  ],
  nodes: [
    { id: 'A', x: 0, y: 0, type: 'entrance', building: 'west' },
    { id: 'B', x: 10, y: 0 },
    { id: 'C', x: 40, y: 0 },
    { id: 'D', x: 50, y: 0, type: 'entrance', building: 'east', wheelchair: 'no' },
    { id: 'G', x: 50, y: -6, type: 'entrance', building: 'east', wheelchair: 'yes' },
    { id: 'F', x: 25, y: -30 },
    { id: 'H', x: 25, y: 28, type: 'entrance', building: 'shop' },
    { id: 'K', x: 70, y: 0 },
  ],
  edges: [
    { from: 'A', to: 'B', distance: 10 },
    { from: 'B', to: 'C', distance: 30, stairs: true },
    { from: 'C', to: 'D', distance: 10 },
    { from: 'C', to: 'G', distance: 12 },
    { from: 'B', to: 'F', distance: 45 },
    { from: 'F', to: 'C', distance: 45 },
    { from: 'B', to: 'H', distance: 30 },
    { from: 'D', to: 'K', distance: 20 },
  ],
  pois: [
    {
      id: 'cafe-out',
      type: 'cafe',
      group: 'food',
      name: { en: 'Kiosk', ko: '키오스크' },
      x: 72,
      y: 3,
      indoor: false,
    },
    {
      id: 'cafe-in',
      type: 'cafe',
      group: 'food',
      name: { en: 'Café', ko: '카페' },
      x: 25,
      y: 35,
      indoor: true,
      buildingId: 'shop',
    },
    { id: 'stop', type: 'bus_stop', group: 'transport', name: null, x: 41, y: 1, indoor: false },
  ],
};

describe('accessible routing', () => {
  const router = createRouter(fixture);

  it('takes the stairs when allowed (shortest)', () => {
    const { status, route } = router.findRoute('west', 'east');
    expect(status).toBe('ok');
    expect(route.path).toEqual(['A', 'B', 'C', 'D']);
    expect(route.distance).toBe(50);
  });

  it('avoids stairs and entrances that are not step-free', () => {
    const { status, route } = router.findRoute('west', 'east', { accessible: true });
    expect(status).toBe('ok');
    expect(route.path).toEqual(['A', 'B', 'F', 'C', 'G']);
    expect(route.path).not.toContain('D');
    expect(route.distance).toBe(10 + 45 + 45 + 12);
    expect(route.accessible).toBe(true);
  });

  it('says so when only a route with stairs exists', () => {
    const steep = {
      ...fixture,
      edges: fixture.edges.filter((e) => e.to !== 'F' && e.from !== 'F'),
    };
    const outcome = createRouter(steep).findRoute('west', 'east', { accessible: true });
    expect(outcome.status).toBe('noAccessible');
    expect(createRouter(steep).findRoute('west', 'east').status).toBe('ok');
  });
});

describe('find nearest', () => {
  const router = createRouter(fixture);

  it('picks the closest place by walking distance, not straight line', () => {
    // The bus stop is 41 m away in a straight line but only reachable over
    // the stairs (40 m walk + ~1.4 m off the path).
    const outcome = router.findNearest('west', 'bus_stop');
    expect(outcome.status).toBe('ok');
    expect(outcome.targetId).toBe('stop');
    expect(outcome.route.toId).toBe('stop');
    expect(outcome.route.distance).toBeCloseTo(40 + Math.hypot(1, 1), 5);
  });

  it('routes to the building an indoor place is in', () => {
    const outcome = router.findNearest('west', 'cafe');
    expect(outcome.targetId).toBe('cafe-in'); // 40 m vs 70 m + 3.6 m for the kiosk
    expect(outcome.route.path.at(-1)).toBe('H');
  });

  it('reports a place inside the start building', () => {
    const outcome = router.findNearest('shop', 'cafe');
    expect(outcome.status).toBe('inside');
    expect(outcome.targetId).toBe('cafe-in');
  });

  it('reports when nothing of that kind is mapped', () => {
    expect(router.findNearest('west', 'restroom').status).toBe('noCandidates');
  });

  it('works on the real campus', () => {
    const real = createRouter(campus);
    const atm = real.findNearest('b-9', 'atm');
    expect(atm.status).toBe('ok');
    expect(atm.route.distance).toBeGreaterThan(0);
    const bus = real.findNearest('b-hitech', 'bus_stop');
    expect(bus.status).toBe('ok');
    expect(campus.pois.find((p) => p.id === bus.targetId).type).toBe('bus_stop');
    // The Student Center has its own cafeteria.
    expect(real.findNearest('b-7', 'cafeteria').status).toBe('inside');
  });

  it('builds directions that end at a place', () => {
    const outcome = router.findNearest('west', 'bus_stop');
    const directions = router.directionsFor(outcome.route, 'en', (key, params = {}) =>
      `${key} ${Object.values(params).join(' ')}`.trim(),
    );
    expect(directions.steps.at(-1).text).toContain('dir.arrivePlace');
  });
});
