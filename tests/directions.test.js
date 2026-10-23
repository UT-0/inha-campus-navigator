/**
 * Tests for turning a node path into walking directions.
 */
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/routing/graph.js';
import {
  buildDirections,
  classifyTurn,
  formatDistance,
  roundDistance,
  walkingMinutes,
} from '../src/routing/directions.js';
import { createTranslator } from '../src/i18n/index.js';

const L = (en, ko) => ({ en, ko });

/**
 * Test campus (metersPerUnit = 1). North is up (negative y).
 *
 *              c ── t   [Target Hall above t]
 *              |
 *   j ──────── c'        j = "Central Crossroads"
 *   |
 *   b
 *   |  [Central Library beside this stretch]
 *   a
 *   |
 *   s   [Start Hall below s]
 */
function testCampus() {
  return {
    meta: { viewBox: [0, 0, 100, 100], metersPerUnit: 1, walkingSpeedMetersPerMin: 75 },
    buildings: [
      {
        id: 'start',
        name: L('Start Hall', '출발관'),
        polygon: [
          [-10, 10],
          [10, 10],
          [10, 30],
          [-10, 30],
        ],
        entrances: ['s'],
      },
      {
        id: 'target',
        name: L('Target Hall', '도착관'),
        polygon: [
          [90, -260],
          [110, -260],
          [110, -210],
          [90, -210],
        ],
        entrances: ['t'],
      },
      {
        id: 'lib',
        name: L('Central Library', '중앙도서관'),
        polygon: [
          [10, -80],
          [30, -80],
          [30, -60],
          [10, -60],
        ],
        entrances: [],
      },
    ],
    nodes: [
      { id: 's', x: 0, y: 0, type: 'entrance', building: 'start' },
      { id: 'a', x: 0, y: -50, type: 'junction' },
      { id: 'b', x: 2, y: -100, type: 'junction' }, // a tiny bend: still "straight"
      { id: 'j', x: 0, y: -150, type: 'junction', name: L('Central Crossroads', '중앙 사거리') },
      { id: 'c', x: 100, y: -150, type: 'junction' },
      { id: 't', x: 100, y: -200, type: 'entrance', building: 'target' },
    ],
    edges: [
      { from: 's', to: 'a', distance: null },
      { from: 'a', to: 'b', distance: null },
      { from: 'b', to: 'j', distance: null },
      { from: 'j', to: 'c', distance: null },
      { from: 'c', to: 't', distance: null, stairs: true },
    ],
    pois: [],
  };
}

function directionsFor(lang) {
  const campus = testCampus();
  const graph = buildGraph(campus);
  return buildDirections({
    path: ['s', 'a', 'b', 'j', 'c', 't'],
    graph,
    campus,
    fromBuilding: campus.buildings[0],
    toBuilding: campus.buildings[1],
    t: createTranslator(lang),
    lang,
  });
}

describe('classifyTurn', () => {
  it('treats small heading changes as straight', () => {
    expect(classifyTurn(0)).toBe('straight');
    expect(classifyTurn(10)).toBe('straight');
    expect(classifyTurn(-29)).toBe('straight');
  });

  it('classifies slight turns (30°–60°)', () => {
    expect(classifyTurn(30)).toBe('slight-right');
    expect(classifyTurn(45)).toBe('slight-right');
    expect(classifyTurn(-50)).toBe('slight-left');
  });

  it('classifies normal turns (60°–135°)', () => {
    expect(classifyTurn(90)).toBe('right');
    expect(classifyTurn(-90)).toBe('left');
    expect(classifyTurn(135)).toBe('right');
  });

  it('classifies sharp turns and turning around (> 135°)', () => {
    expect(classifyTurn(150)).toBe('sharp-right');
    expect(classifyTurn(-140)).toBe('sharp-left');
    expect(classifyTurn(180)).toBe('uturn');
  });
});

describe('buildDirections', () => {
  const { steps, totalMeters, minutes, hasStairs } = directionsFor('en');

  it('starts with the exit and ends with the arrival', () => {
    expect(steps[0].icon).toBe('exit');
    expect(steps[0].text).toBe('Exit **Start Hall** from the north entrance.');
    expect(steps.at(-1).icon).toBe('arrive');
    expect(steps.at(-1).text).toBe('Arrive at **Target Hall** (south entrance).');
  });

  it('merges consecutive straight segments into one step', () => {
    const head = steps[1];
    expect(head.nodeIds).toEqual(['s', 'a', 'b', 'j']);
    expect(Math.round(head.distanceMeters)).toBe(150);
    expect(steps).toHaveLength(5); // exit, head, right, left, arrive
  });

  it('mentions buildings walked past as landmarks', () => {
    expect(steps[1].text).toBe('Head north for 150 m, passing Central Library.');
  });

  it('classifies turns and names the junction where they happen', () => {
    expect(steps[2].icon).toBe('right');
    expect(steps[2].text).toBe('Turn right at Central Crossroads and walk 100 m.');
    expect(steps[3].icon).toBe('left');
    expect(steps[3].text).toContain('Turn left and walk 50 m.');
  });

  it('warns about stairs', () => {
    expect(hasStairs).toBe(true);
    expect(steps[3].text).toContain('Watch for stairs.');
  });

  it('computes total distance and walking time', () => {
    expect(Math.round(totalMeters)).toBe(300);
    expect(minutes).toBe(4); // 300 m / 75 m per min
  });

  it('produces Korean text with the same structure', () => {
    const ko = directionsFor('ko').steps;
    expect(ko).toHaveLength(steps.length);
    expect(ko[0].text).toBe('**출발관**의 북쪽 출입구로 나오세요.');
    expect(ko[2].text).toBe('중앙 사거리에서 오른쪽으로 돌아 100m 걸으세요.');
    expect(ko.at(-1).text).toContain('**도착관**에 도착합니다.');
  });
});

describe('distance and time rounding', () => {
  it('rounds distances to 10 m, never below 10 m', () => {
    expect(roundDistance(0)).toBe(0);
    expect(roundDistance(3)).toBe(10);
    expect(roundDistance(14)).toBe(10);
    expect(roundDistance(15)).toBe(20);
    expect(roundDistance(126)).toBe(130);
  });

  it('formats long distances in kilometers', () => {
    const t = createTranslator('en');
    expect(formatDistance(126, t)).toBe('130 m');
    expect(formatDistance(1234, t)).toBe('1.2 km');
    expect(formatDistance(126, createTranslator('ko'))).toBe('130m');
  });

  it('estimates walking time with a 1 minute minimum', () => {
    expect(walkingMinutes(10, 75)).toBe(1);
    expect(walkingMinutes(0, 75)).toBe(1);
    expect(walkingMinutes(750, 75)).toBe(10);
    expect(walkingMinutes(300, 60)).toBe(5);
  });
});
