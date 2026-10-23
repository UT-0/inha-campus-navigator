/**
 * Corrections made in the Map Editor, stored as a small "edits" file so they
 * survive rebuilding the data from OpenStreetMap and the official pages.
 *
 * Format (data-raw/edits/*.json, applied in file-name order by the build):
 *   {
 *     "created": "2026-10-24",
 *     "meta":      { "<field>": value, … },
 *     "buildings": { "<id>": { "<field>": value, … } | null },
 *     "nodes":     { "<id>": { … } | null },
 *     "pois":      { "<id>": { … } | null },
 *     "areas":     { "<id>": { … } | null },
 *     "edges":     { "<from>|<to>": { … } | null }
 *   }
 * For an item that already exists, the listed top-level fields replace the
 * built values (other fields keep coming from the data sources). An id that
 * doesn't exist adds the item; `null` removes it. Edges are keyed by their
 * two node ids in sorted order, so direction doesn't matter.
 *
 * Pure module (no DOM): used by the editor (diffCampus) and the build
 * (applyEdits), and unit tested.
 */

const COLLECTIONS = ['buildings', 'nodes', 'pois', 'areas'];

/** Key of an edge: its two node ids, sorted. */
export function edgeKey(edge) {
  return [edge.from, edge.to].sort().join('|');
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Changed top-level fields of an object (or null if nothing changed). */
function changedFields(before, after) {
  const fields = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!same(before[key], after[key])) fields[key] = after[key] ?? null;
  }
  return Object.keys(fields).length ? fields : null;
}

function diffList(before, after, keyOf) {
  const out = {};
  const old = new Map(before.map((item) => [keyOf(item), item]));
  const now = new Map(after.map((item) => [keyOf(item), item]));
  for (const [key, item] of now) {
    if (!old.has(key)) out[key] = item;
    else {
      const fields = changedFields(old.get(key), item);
      if (fields) out[key] = fields;
    }
  }
  for (const key of old.keys()) if (!now.has(key)) out[key] = null;
  return out;
}

/**
 * What changed between the bundled data and the editor's version.
 * @param {object} base   The campus.json the editor started from.
 * @param {object} edited The editor's campus.
 * @returns {object} An edits object (empty collections are left out).
 */
export function diffCampus(base, edited) {
  const edits = {};
  for (const name of COLLECTIONS) {
    const diff = diffList(base[name] ?? [], edited[name] ?? [], (item) => item.id);
    if (Object.keys(diff).length) edits[name] = diff;
  }
  const edges = diffList(base.edges ?? [], edited.edges ?? [], edgeKey);
  if (Object.keys(edges).length) edits.edges = edges;
  const meta = changedFields(base.meta ?? {}, edited.meta ?? {});
  if (meta) edits.meta = meta;
  return edits;
}

/**
 * Applies an edits object to a campus (mutates it).
 * @param {object} campus
 * @param {object} edits
 * @returns {{applied: number, skipped: string[]}} skipped: edits whose
 *          target no longer exists (e.g. a path removed from OpenStreetMap).
 */
export function applyEdits(campus, edits) {
  let applied = 0;
  const skipped = [];
  const apply = (list, key, value, keyOf, label) => {
    const index = list.findIndex((item) => keyOf(item) === key);
    if (value === null) {
      if (index === -1) skipped.push(`${label} ${key}: already gone`);
      else {
        list.splice(index, 1);
        applied++;
      }
      return;
    }
    if (index === -1) {
      // New item: needs its full description.
      const complete = label === 'edge' ? value.from && value.to : value.id;
      if (complete) {
        list.push(value);
        applied++;
      } else skipped.push(`${label} ${key}: no longer exists`);
      return;
    }
    Object.assign(list[index], value);
    for (const [field, v] of Object.entries(value)) if (v === null) delete list[index][field];
    applied++;
  };

  for (const name of COLLECTIONS) {
    campus[name] = campus[name] ?? [];
    for (const [id, value] of Object.entries(edits[name] ?? {})) {
      apply(campus[name], id, value, (item) => item.id, name.replace(/s$/, ''));
    }
  }
  campus.edges = campus.edges ?? [];
  for (const [key, value] of Object.entries(edits.edges ?? {})) {
    apply(campus.edges, key, value, edgeKey, 'edge');
  }
  if (edits.meta) {
    Object.assign(campus.meta, edits.meta);
    applied++;
  }

  // Keep entrance lists consistent with removed nodes.
  const nodeIds = new Set(campus.nodes.map((n) => n.id));
  for (const b of campus.buildings) {
    b.entrances = (b.entrances ?? []).filter((id) => nodeIds.has(id));
  }
  return { applied, skipped };
}
