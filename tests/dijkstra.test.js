/**
 * Tests for the min-heap, graph building/validation and Dijkstra routing,
 * on a small hand-built graph and on the real campus data.
 */
import { describe, expect, it } from 'vitest';
import { MinHeap } from '../src/routing/minHeap.js';
import { buildGraph, connectedComponents, validateCampus } from '../src/routing/graph.js';
import {
  dijkstra,
  findBuildingRoute,
  findMultiEntranceRoute,
  shortestPath,
} from '../src/routing/dijkstra.js';
import campusData from '../src/data/campus.json';

/**
 * Small hand-built campus (metersPerUnit = 1, so distances equal coordinates):
 *
 *   A ---10--- B ---10--- C
 *   |                     |
 *   40                    10
 *   |                     |
 *   D --------50--------- E        F (isolated)
 */
function smallCampus() {
  return {
    meta: { viewBox: [0, 0, 100, 100], metersPerUnit: 1 },
    buildings: [
      {
        id: 'west',
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        entrances: ['A', 'D'],
      },
      {
        id: 'east',
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        entrances: ['C', 'E'],
      },
      {
        id: 'island',
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        entrances: ['F'],
      },
    ],
    nodes: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 10, y: 0 },
      { id: 'C', x: 20, y: 0 },
      { id: 'D', x: 0, y: 40 },
      { id: 'E', x: 20, y: 10 },
      { id: 'F', x: 90, y: 90 },
    ],
    edges: [
      { from: 'A', to: 'B', distance: null },
      { from: 'B', to: 'C', distance: null },
      { from: 'C', to: 'E', distance: null },
      { from: 'A', to: 'D', distance: null },
      { from: 'D', to: 'E', distance: 50 },
    ],
  };
}

describe('MinHeap', () => {
  it('pops values in priority order', () => {
    const heap = new MinHeap();
    [5, 3, 8, 1, 9, 2, 7].forEach((n) => heap.push(`v${n}`, n));
    const order = [];
    while (!heap.isEmpty()) order.push(heap.pop().priority);
    expect(order).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });

  it('returns undefined when empty', () => {
    const heap = new MinHeap();
    expect(heap.pop()).toBeUndefined();
    expect(heap.size).toBe(0);
  });
});

describe('buildGraph', () => {
  it('creates bidirectional edges and computes null distances from coordinates', () => {
    const graph = buildGraph(smallCampus());
    expect(
      graph.adjacency
        .get('A')
        .map((n) => n.to)
        .sort(),
    ).toEqual(['B', 'D']);
    expect(graph.adjacency.get('B').find((n) => n.to === 'A').distance).toBe(10);
    expect(graph.adjacency.get('E').find((n) => n.to === 'D').distance).toBe(50);
  });

  it('applies metersPerUnit', () => {
    const campus = smallCampus();
    campus.meta.metersPerUnit = 0.5;
    const graph = buildGraph(campus);
    expect(graph.adjacency.get('A').find((n) => n.to === 'B').distance).toBe(5);
  });
});

describe('dijkstra', () => {
  it('finds the shortest path on a small graph', () => {
    const graph = buildGraph(smallCampus());
    const result = shortestPath(graph, 'A', 'E');
    expect(result.path).toEqual(['A', 'B', 'C', 'E']);
    expect(result.distance).toBe(30);
  });

  it('prefers the longer-looking path when it is actually shorter', () => {
    const graph = buildGraph(smallCampus());
    // D → E directly is 50 m, but D → A → B → C → E is 40 + 30 = 70 m.
    expect(shortestPath(graph, 'D', 'E').path).toEqual(['D', 'E']);
  });

  it('returns null when the target is unreachable', () => {
    const graph = buildGraph(smallCampus());
    expect(shortestPath(graph, 'A', 'F')).toBeNull();
  });

  it('returns a zero-length path when start equals target', () => {
    const graph = buildGraph(smallCampus());
    expect(shortestPath(graph, 'B', 'B')).toEqual({ path: ['B'], distance: 0 });
  });

  it('works with any neighbour function', () => {
    const edges = {
      s: [
        { to: 'a', distance: 1 },
        { to: 'b', distance: 5 },
      ],
      a: [{ to: 'b', distance: 1 }],
      b: [],
    };
    expect(dijkstra((id) => edges[id], 's', 'b')).toEqual({ path: ['s', 'a', 'b'], distance: 2 });
  });
});

describe('multi-entrance routing', () => {
  it('chooses the best entrance at both ends', () => {
    const campus = smallCampus();
    const graph = buildGraph(campus);
    const [west, east] = campus.buildings;
    const result = findBuildingRoute(graph, west, east);
    // Best pair is A (west) → C (east): 20 m. D → E would be 50 m.
    expect(result.path).toEqual(['A', 'B', 'C']);
    expect(result.distance).toBe(20);
  });

  it('never returns the virtual nodes', () => {
    const graph = buildGraph(smallCampus());
    const result = findMultiEntranceRoute(graph, ['D'], ['C', 'E']);
    expect(result.path.some((id) => id.startsWith('__'))).toBe(false);
    expect(result.path[0]).toBe('D');
  });

  it('returns null for an unreachable building', () => {
    const campus = smallCampus();
    const graph = buildGraph(campus);
    expect(findBuildingRoute(graph, campus.buildings[0], campus.buildings[2])).toBeNull();
  });

  it('returns null when a building has no valid entrances', () => {
    const graph = buildGraph(smallCampus());
    expect(findMultiEntranceRoute(graph, ['nope'], ['C'])).toBeNull();
  });
});

describe('validateCampus', () => {
  it('reports unknown nodes, missing entrances and disconnected parts', () => {
    const campus = smallCampus();
    campus.edges.push({ from: 'A', to: 'ZZZ', distance: null });
    campus.buildings.push({
      id: 'ghost',
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      entrances: [],
    });
    const codes = validateCampus(campus).map((p) => p.code);
    expect(codes).toContain('unknown-node');
    expect(codes).toContain('no-entrance');
    expect(codes).toContain('disconnected');
  });

  it('accepts the bundled campus data without problems', () => {
    expect(validateCampus(campusData)).toEqual([]);
    expect(connectedComponents(buildGraph(campusData))).toHaveLength(1);
  });

  it('can route between every pair of buildings on the real campus', () => {
    const graph = buildGraph(campusData);
    for (const a of campusData.buildings) {
      for (const b of campusData.buildings) {
        expect(findBuildingRoute(graph, a, b), `${a.id} → ${b.id}`).not.toBeNull();
      }
    }
  });

  it('routes along real geometry, never shorter than the straight line', () => {
    const graph = buildGraph(campusData);
    const byId = new Map(campusData.buildings.map((b) => [b.id, b]));
    const route = findBuildingRoute(graph, byId.get('b-library'), byId.get('b-hitech'));
    const [a, b] = [graph.nodes.get(route.path[0]), graph.nodes.get(route.path.at(-1))];
    expect(route.distance).toBeGreaterThanOrEqual(Math.hypot(b.x - a.x, b.y - a.y));
    expect(route.distance).toBeLessThan(1500);
  });
});
