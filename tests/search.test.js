/**
 * Tests for text matching and the global search index.
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
import courses from '../src/data/courses.json';

const index = buildSearchIndex(campus, courses, (key) => ({
  en: translate('en', key),
  ko: translate('ko', key),
}));

/** Ids of the results of one type, best first. */
function ids(query, type) {
  return search(index, query)
    .filter((r) => r.entry.type === type)
    .map((r) => r.entry.buildingId ?? r.entry.id);
}

describe('normalize and matchScore', () => {
  it('ignores case, spaces and hyphens', () => {
    expect(normalize('ISE 3231')).toBe('ise3231');
    expect(normalize('Eng-Hall  A')).toBe('enghalla');
    expect(matchScore('ise-3231', 'ISE3231')).toBe(100);
  });

  it('ranks exact > prefix > substring > typo', () => {
    const exact = matchScore('library', 'Library');
    const prefix = matchScore('libr', 'Library');
    const substring = matchScore('brary', 'Library');
    const typo = matchScore('libary', 'Central Library');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it('does not fuzzy-match very short queries', () => {
    expect(matchScore('lbr', 'Library')).toBe(0);
  });

  it('extracts Korean initial consonants', () => {
    expect(initialConsonants('중앙도서관')).toBe('ㅈㅇㄷㅅㄱ');
  });
});

describe('search: buildings', () => {
  it('finds buildings by English name', () => {
    expect(ids('library', 'building')[0]).toBe('b-lib');
    expect(ids('engineering hall a', 'building')[0]).toBe('b-eng-a');
  });

  it('finds buildings by Korean name and partial Korean name', () => {
    expect(ids('중앙도서관', 'building')[0]).toBe('b-lib');
    expect(ids('도서관', 'building')[0]).toBe('b-lib');
    expect(ids('기숙사', 'building')).toEqual(expect.arrayContaining(['b-dorm1', 'b-dorm2']));
  });

  it('finds buildings by Korean initial consonants', () => {
    expect(ids('ㅈㅇㄷㅅㄱ', 'building')[0]).toBe('b-lib');
  });

  it('finds buildings by number exactly first', () => {
    expect(ids('8', 'building')[0]).toBe('b-it');
    expect(ids('12', 'building')[0]).toBe('b-stadium');
  });

  it('tolerates small typos in English and Korean', () => {
    expect(ids('Libary', 'building')[0]).toBe('b-lib');
    expect(ids('gymnasum', 'building')[0]).toBe('b-gym');
    expect(ids('중앙도사관', 'building')[0]).toBe('b-lib');
  });
});

describe('search: courses, rooms and facilities', () => {
  it('finds a course by code, ignoring case and spaces', () => {
    const [first] = search(index, 'ise 3231');
    expect(first.entry.type).toBe('course');
    expect(first.entry.buildingId).toBe('b-eng-a');
    expect(first.entry.highlight).toEqual({ type: 'course', value: 'ISE3231' });
  });

  it('finds a course by English or Korean name', () => {
    expect(ids('Sensor', 'course')).toContain('b-eng-a');
    expect(ids('센서', 'course')).toContain('b-eng-a');
  });

  it('finds rooms by number in every building that has them', () => {
    const rooms = search(index, '201', { perGroup: 20 }).filter((r) => r.entry.type === 'room');
    expect(rooms.length).toBeGreaterThan(3);
    expect(rooms.every((r) => r.entry.highlight.value === '201')).toBe(true);
    expect(rooms.map((r) => r.entry.buildingId)).toContain('b-eng-a');
  });

  it('does not match rooms by digits in the middle', () => {
    const rooms = search(index, '20', { perGroup: 50 }).filter((r) => r.entry.type === 'room');
    expect(rooms.every((r) => r.entry.terms[0].startsWith('20'))).toBe(true);
  });

  it('finds facilities in English and Korean', () => {
    expect(ids('printer', 'facility')).toContain('b-lib');
    expect(ids('프린터', 'facility')).toContain('b-lib');
    expect(ids('cafe', 'place')).toContain('place:p-cafe-lawn');
  });

  it('finds departments', () => {
    expect(ids('computer science', 'department')[0]).toBe('b-it');
  });

  it('returns nothing for an empty query', () => {
    expect(search(index, '   ')).toEqual([]);
  });
});

describe('search: result grouping', () => {
  it('puts the group with the strongest match first', () => {
    expect(search(index, '201')[0].entry.type).toBe('room');
    expect(search(index, 'ISE3231')[0].entry.type).toBe('course');
    expect(search(index, 'Central Library')[0].entry.type).toBe('building');
  });
});

describe('search: short Korean queries', () => {
  it('does not fuzzy-match two-syllable words', () => {
    const places = search(index, '버스').map((r) => r.entry.id);
    expect(places).toEqual(['place:p-bus-main', 'place:p-bus-east']);
  });
});
