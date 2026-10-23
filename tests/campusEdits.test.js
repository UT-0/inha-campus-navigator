/**
 * Tests for Map Editor edits that survive rebuilding the data.
 */
import { describe, expect, it } from 'vitest';
import { applyEdits, diffCampus, edgeKey } from '../src/utils/campusEdits.js';
import campus from '../src/data/campus.json';

const copy = () => structuredClone(campus);

describe('diffCampus / applyEdits', () => {
  it('finds nothing when nothing changed', () => {
    expect(diffCampus(campus, copy())).toEqual({});
  });

  it('records changed fields, new items and removals, and replays them', () => {
    const edited = copy();
    const library = edited.buildings.find((b) => b.id === 'b-library');
    library.lastVerified = '2026-10-24';
    library.amenities.elevator = { available: true, status: 'verified' };
    edited.nodes.push({ id: 'j-new', x: 1, y: 2, type: 'junction', status: 'verified' });
    const someEdge = edited.edges[0];
    edited.edges.push({ from: someEdge.from, to: 'j-new', distance: null, status: 'verified' });
    const removed = edited.pois.pop();

    const edits = diffCampus(campus, edited);
    expect(Object.keys(edits.buildings)).toEqual(['b-library']);
    expect(Object.keys(edits.buildings['b-library']).sort()).toEqual(['amenities', 'lastVerified']);
    expect(edits.nodes['j-new'].x).toBe(1);
    expect(edits.pois[removed.id]).toBeNull();
    expect(edits.edges[edgeKey({ from: someEdge.from, to: 'j-new' })]).toBeTruthy();

    // A fresh build gets the same corrections.
    const rebuilt = copy();
    const { applied, skipped } = applyEdits(rebuilt, edits);
    expect(skipped).toEqual([]);
    expect(applied).toBe(4);
    expect(rebuilt.buildings.find((b) => b.id === 'b-library').lastVerified).toBe('2026-10-24');
    expect(rebuilt.nodes.some((n) => n.id === 'j-new')).toBe(true);
    expect(rebuilt.pois.some((p) => p.id === removed.id)).toBe(false);
    expect(diffCampus(edited, rebuilt)).toEqual({});
  });

  it('keys edges by their nodes, whatever the direction', () => {
    expect(edgeKey({ from: 'b', to: 'a' })).toBe(edgeKey({ from: 'a', to: 'b' }));
  });

  it('skips edits whose target is gone instead of failing', () => {
    const rebuilt = copy();
    const { skipped } = applyEdits(rebuilt, { nodes: { 'n-missing': { status: 'verified' } } });
    expect(skipped).toEqual(['node n-missing: no longer exists']);
  });

  it('drops removed entrances from their building', () => {
    const rebuilt = copy();
    const building = rebuilt.buildings.find((b) => b.entrances.length > 1);
    const [first] = building.entrances;
    applyEdits(rebuilt, { nodes: { [first]: null } });
    expect(building.entrances).not.toContain(first);
  });
});
