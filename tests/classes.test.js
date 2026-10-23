/**
 * Tests for "My classes": validation and finding the next class.
 */
import { describe, expect, it } from 'vitest';
import { nextClass, sortClasses, toMinutes, validateClass } from '../src/utils/classes.js';

const classes = [
  {
    id: 'a',
    name: 'Data Structures',
    room: '하이테크 1012호',
    day: 2,
    start: '10:30',
    end: '11:45',
  },
  { id: 'b', name: 'Calculus', room: '5동 213B호', day: 4, start: '09:00', end: '10:15' },
  { id: 'c', name: 'Korean', room: '서호관 206호', day: 1, start: '13:30', end: '14:45' },
];

// 2026-10-20 is a Tuesday.
const at = (day, time) => new Date(`2026-10-${String(18 + day).padStart(2, '0')}T${time}:00`);

describe('toMinutes', () => {
  it('parses HH:MM', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('9:05')).toBe(545);
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('noon')).toBeNull();
  });
});

describe('validateClass', () => {
  it('accepts a complete class', () => {
    expect(validateClass(classes[0])).toEqual([]);
  });

  it('reports missing fields and impossible times', () => {
    expect(validateClass({ name: '', room: '', day: 9, start: '11:00', end: '10:00' })).toEqual([
      'classes.errorName',
      'classes.errorRoom',
      'classes.errorDay',
      'classes.errorTime',
    ]);
  });
});

describe('nextClass', () => {
  it('finds a class that is on right now', () => {
    const next = nextClass(classes, at(2, '11:00'));
    expect(next.item.id).toBe('a');
    expect(next.ongoing).toBe(true);
  });

  it('finds the next class later the same week', () => {
    const next = nextClass(classes, at(2, '12:00'));
    expect(next.item.id).toBe('b');
    expect(next.daysAhead).toBe(2);
    expect(next.ongoing).toBe(false);
  });

  it('wraps around to next week', () => {
    // Saturday afternoon → Monday's class.
    const next = nextClass(classes, at(6, '15:00'));
    expect(next.item.id).toBe('c');
    expect(next.daysAhead).toBe(2);
  });

  it('counts minutes until the class starts', () => {
    expect(nextClass(classes, at(2, '10:00')).minutesUntil).toBe(30);
  });

  it('returns null without classes', () => {
    expect(nextClass([], new Date())).toBeNull();
  });
});

describe('sortClasses', () => {
  it('orders Monday first, then by time', () => {
    expect(sortClasses(classes).map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});
