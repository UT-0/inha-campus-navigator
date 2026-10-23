/**
 * Tests for parseRoomCode() with room locations quoted from official Inha
 * pages (see data-raw/official/details.json).
 */
import { describe, expect, it } from 'vitest';
import { buildPrefixTable, floorFromRoom, parseRoomCode } from '../src/utils/roomCode.js';
import campus from '../src/data/campus.json';

const table = buildPrefixTable(campus.buildings);
const parse = (text) => parseRoomCode(text, table);

describe('parseRoomCode with official examples', () => {
  it('reads building + wing + room ("2북 291호", 기계공학과)', () => {
    expect(parse('2북 291호')).toMatchObject({
      buildingId: 'b-2',
      wing: 'north',
      room: '291',
      floor: 2,
      floorLabel: '2F',
    });
  });

  it('reads wing letters with letter suffixes ("5동 213B호", "5서 554B호")', () => {
    expect(parse('5동 213B호')).toMatchObject({
      buildingId: 'b-5',
      wing: 'east',
      room: '213B',
      floor: 2,
    });
    expect(parse('5서 554B호')).toMatchObject({
      buildingId: 'b-5',
      wing: 'west',
      room: '554B',
      floor: 5,
    });
  });

  it('reads long forms of the wing ("2호관 북쪽 477A호", "2호관(남) 316A", "5호관 남 309호")', () => {
    expect(parse('2호관 북쪽 477A호')).toMatchObject({
      buildingId: 'b-2',
      wing: 'north',
      room: '477A',
      floor: 4,
    });
    expect(parse('2호관(남) 316A')).toMatchObject({
      buildingId: 'b-2',
      wing: 'south',
      room: '316A',
      floor: 3,
    });
    expect(parse('5호관 남 309호')).toMatchObject({
      buildingId: 'b-5',
      wing: 'south',
      room: '309',
      floor: 3,
    });
    expect(parse('2호관 2남 212호')).toMatchObject({
      buildingId: 'b-2',
      wing: 'south',
      room: '212',
    });
  });

  it('reads named buildings and four-digit rooms', () => {
    expect(parse('60주년 901A호')).toMatchObject({ buildingId: 'b-60th', room: '901A', floor: 9 });
    expect(parse('60주년기념관 1408호')).toMatchObject({
      buildingId: 'b-60th',
      room: '1408',
      floor: 14,
    });
    expect(parse('하이테크 1012호')).toMatchObject({
      buildingId: 'b-hitech',
      room: '1012',
      floor: 10,
    });
    expect(parse('서호관 223호')).toMatchObject({ buildingId: 'b-seoho', room: '223', floor: 2 });
    expect(parse('평생교육원 221호')).toMatchObject({ buildingId: 'b-lifelong', room: '221' });
    expect(parse('미래융합대학관 106호')).toMatchObject({ buildingId: 'b-lifelong', floor: 1 });
  });

  it('prefers an explicit floor ("정석학술정보관 5층 521호")', () => {
    expect(parse('정석학술정보관 5층 521호')).toMatchObject({
      buildingId: 'b-library',
      floor: 5,
      room: '521',
    });
  });

  it('ignores the university name and accepts compact or hyphenated input', () => {
    expect(parse('인하대학교 하이테크센터 801호')).toMatchObject({
      buildingId: 'b-hitech',
      room: '801',
    });
    expect(parse('2남212')).toMatchObject({ buildingId: 'b-2', wing: 'south', room: '212' });
    expect(parse('60-901')).toMatchObject({ buildingId: 'b-60th', room: '901' });
  });

  it('does not confuse "6" with "60주년"', () => {
    expect(parse('6호관 222호').buildingId).toBe('b-6');
    expect(parse('60주년 330호').buildingId).toBe('b-60th');
  });

  it('returns null for places off the main campus or unknown text', () => {
    expect(parse('항공우주융합캠퍼스 208호')).toBeNull();
    expect(parse('hello')).toBeNull();
  });
});

describe('floorFromRoom', () => {
  it('drops the last two digits and handles basements', () => {
    expect(floorFromRoom('212')).toBe(2);
    expect(floorFromRoom('1309')).toBe(13);
    expect(floorFromRoom('B101')).toBe(-1);
    expect(floorFromRoom('12')).toBeNull();
  });
});
