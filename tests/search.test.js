/**
 * Tests for text matching and the global search index: real campus
 * buildings, plus small fixtures for courses, rooms and facilities (the
 * real data has no verified course or room lists yet).
 */
import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  initialConsonants,
  matchScore,
  normalize,
  search,
} from '../src/utils/search.js';
import { translate } from '../src/i18n/index.js';
import campus from '../src/data/campus.json';

const labelFor = (key) => ({ en: translate('en', key), ko: translate('ko', key) });
const index = buildSearchIndex(campus, [], labelFor);

/** A tiny fixture campus for the parts the real data doesn't have yet. */
const fixture = {
  buildings: [
    {
      id: 'b-eng',
      number: '3',
      name: { en: 'Engineering Hall', ko: '공학관' },
      category: 'academic',
      polygons: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
      departments: [{ en: 'Department of Computer Science', ko: '컴퓨터공학과' }],
      facilities: ['printer'],
      rooms: ['201', '305'],
    },
    {
      id: 'b-sci',
      number: '4',
      name: { en: 'Science Hall', ko: '과학관' },
      category: 'academic',
      polygons: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
      rooms: ['120', '201'],
    },
  ],
  nodes: [],
  pois: [],
};
const fixtureCourses = [
  {
    code: 'ISE3231',
    name: { en: 'Sensor Engineering', ko: '센서공학' },
    building: 'b-eng',
    room: '201',
  },
];
const fixtureIndex = buildSearchIndex(fixture, fixtureCourses, labelFor);

/** Building ids (or entry ids) of the results of one type, best first. */
function ids(query, type, idx = index) {
  return search(idx, query)
    .filter((r) => r.entry.type === type)
    .map((r) => r.entry.buildingId ?? r.entry.id);
}

describe('normalize and matchScore', () => {
  it('ignores case, spaces and hyphens', () => {
    expect(normalize('ISE 3231')).toBe('ise3231');
    expect(normalize('Hi-Tech  Center')).toBe('hitechcenter');
    expect(matchScore('hi tech', 'Hi-Tech')).toBe(100);
  });

  it('ranks exact > prefix > substring > typo', () => {
    const exact = matchScore('library', 'Library');
    const prefix = matchScore('libr', 'Library');
    const substring = matchScore('brary', 'Library');
    const typo = matchScore('libary', 'Memorial Library');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it('does not fuzzy-match very short queries', () => {
    expect(matchScore('lbr', 'Library')).toBe(0);
  });

  it('extracts Korean initial consonants', () => {
    expect(initialConsonants('하이테크센터')).toBe('ㅎㅇㅌㅋㅅㅌ');
  });
});

describe('search: real campus buildings', () => {
  it('finds buildings by official English name', () => {
    expect(ids('Jungseok Memorial Library', 'building')[0]).toBe('b-library');
    expect(ids('hi-tech center', 'building')[0]).toBe('b-hitech');
    expect(ids('Student Center', 'building')[0]).toBe('b-7');
  });

  it('finds buildings by Korean name, partial name and alias', () => {
    expect(ids('정석학술정보관', 'building')[0]).toBe('b-library');
    expect(ids('하이테크', 'building')[0]).toBe('b-hitech');
    expect(ids('학생회관', 'building')[0]).toBe('b-7');
    expect(ids('웅비재', 'building')[0]).toBe('b-woongbi');
  });

  it('finds buildings by Korean initial consonants', () => {
    expect(ids('ㅎㅇㅌㅋ', 'building')[0]).toBe('b-hitech');
  });

  it('finds buildings by number exactly first', () => {
    expect(ids('12', 'building')[0]).toBe('b-hitech');
    expect(ids('5', 'building')[0]).toBe('b-5');
  });

  it('tolerates small typos in English and Korean', () => {
    expect(ids('Libary', 'building')[0]).toBe('b-library');
    expect(ids('하이테크센타', 'building')[0]).toBe('b-hitech');
  });

  it('returns nothing for an empty query', () => {
    expect(search(index, '   ')).toEqual([]);
  });
});

describe('search: courses, rooms, departments and facilities (fixture)', () => {
  it('finds a course by code, ignoring case and spaces', () => {
    const [first] = search(fixtureIndex, 'ise 3231');
    expect(first.entry.type).toBe('course');
    expect(first.entry.buildingId).toBe('b-eng');
    expect(first.entry.highlight).toEqual({ type: 'course', value: 'ISE3231' });
  });

  it('finds a course by English or Korean name', () => {
    expect(ids('Sensor', 'course', fixtureIndex)).toContain('b-eng');
    expect(ids('센서', 'course', fixtureIndex)).toContain('b-eng');
  });

  it('finds rooms by number in every building that has them', () => {
    const rooms = search(fixtureIndex, '201').filter((r) => r.entry.type === 'room');
    expect(rooms.map((r) => r.entry.buildingId).sort()).toEqual(['b-eng', 'b-sci']);
    expect(search(fixtureIndex, '201')[0].entry.type).toBe('room');
  });

  it('does not match rooms by digits in the middle', () => {
    const rooms = search(fixtureIndex, '20').filter((r) => r.entry.type === 'room');
    expect(rooms.every((r) => r.entry.terms[0].startsWith('20'))).toBe(true);
  });

  it('finds departments and facilities in both languages', () => {
    expect(ids('컴퓨터공학', 'department', fixtureIndex)).toContain('b-eng');
    expect(ids('printer', 'facility', fixtureIndex)).toContain('b-eng');
    expect(ids('프린터', 'facility', fixtureIndex)).toContain('b-eng');
  });
});
