/**
 * The data checks of `npm run validate`, run on the real data and on broken
 * copies to make sure they catch problems.
 */
import { describe, expect, it } from 'vitest';
import { validateData } from '../scripts/validate-data.mjs';
import campus from '../src/data/campus.json';

const copy = () => structuredClone(campus);

describe('validateData', () => {
  it('passes on the real campus data', () => {
    const { errors, stats } = validateData(campus);
    expect(errors).toEqual([]);
    expect(stats.graphParts).toBe(1);
    expect(stats.routePairs).toBe((campus.buildings.length * (campus.buildings.length - 1)) / 2);
  });

  it('catches a building without entrances or description', () => {
    const data = copy();
    data.buildings[0].entrances = [];
    data.buildings[1].description = { ko: '', en: '' };
    const { errors } = validateData(data);
    expect(errors.some((e) => e.includes(`${data.buildings[0].id}: no entrance`))).toBe(true);
    expect(errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('catches a verified fact without a source', () => {
    const data = copy();
    const building = data.buildings.find((b) => b.departments.length);
    building.sources = building.sources.filter((s) => s.field !== 'departments');
    const { errors } = validateData(data);
    expect(errors.some((e) => e.includes('departments is "verified" but has no source'))).toBe(
      true,
    );
  });

  it('catches an amenity placed off campus', () => {
    const data = copy();
    data.pois.push({ id: 'p-test', type: 'cafe', group: 'food', x: 5000, y: 5000, indoor: false });
    const { errors } = validateData(data);
    expect(errors.some((e) => e.includes('p-test'))).toBe(true);
  });

  it('catches a disconnected path network', () => {
    const data = copy();
    data.nodes.push({ id: 'island-a', x: 0, y: 0 }, { id: 'island-b', x: 5, y: 0 });
    data.edges.push({ from: 'island-a', to: 'island-b', distance: 5 });
    expect(validateData(data).errors.some((e) => e.includes('separate parts'))).toBe(true);
  });

  it('catches a missing photo file', () => {
    const data = copy();
    data.buildings[0].photo = {
      src: 'photos/web/nope.webp',
      author: 'x',
      license: 'CC0',
      sourceUrl: 'https://example.org',
    };
    expect(validateData(data).errors.some((e) => e.includes('missing photos/web/nope.webp'))).toBe(
      true,
    );
  });
});
