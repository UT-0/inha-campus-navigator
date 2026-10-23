/**
 * Text matching and the global search index.
 *
 * Matching is:
 *  - case-insensitive and ignores spaces, hyphens and punctuation
 *    ("ise 3231" finds "ISE3231", "engineering hall a" finds "Engineering Hall A");
 *  - Korean-aware: Hangul syllables are compared letter by letter (jamo), so a
 *    typo inside one syllable is a small difference, and initial-consonant
 *    queries such as "ㅈㅇㄷㅅㄱ" find "중앙도서관";
 *  - typo tolerant: longer queries may differ by one or two letters.
 *
 * Pure module (no DOM) so it can be unit tested.
 */

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/**
 * Normalises text for comparison: Unicode-compatible form, lower case,
 * without whitespace and common punctuation.
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_.,·:;'’"()&/\\#]+/g, '');
}

/**
 * Splits Hangul syllables into individual letters (jamo) using Unicode
 * canonical decomposition, e.g. "한" → "ᄒ ᅡ ᆫ". Other text is unchanged.
 * @param {string} text
 * @returns {string}
 */
export function toJamo(text) {
  return text.normalize('NFD');
}

/**
 * Replaces each Hangul syllable with its initial consonant ("중앙" → "ㅈㅇ").
 * @param {string} text
 * @returns {string}
 */
export function initialConsonants(text) {
  let result = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    result +=
      code >= HANGUL_START && code <= HANGUL_END
        ? CHOSEONG[Math.floor((code - HANGUL_START) / 588)]
        : char;
  }
  return result;
}

/**
 * Smallest edit distance between `pattern` and any substring of `text`
 * (Sellers' algorithm: Levenshtein where the match may start anywhere).
 * @param {string} pattern
 * @param {string} text
 * @returns {number}
 */
export function substringDistance(pattern, text) {
  let previous = new Array(text.length + 1).fill(0);
  for (let i = 1; i <= pattern.length; i++) {
    const current = [i];
    for (let j = 1; j <= text.length; j++) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return Math.min(...previous);
}

/**
 * Typos allowed for a query of the given length in characters (syllables for
 * Korean), so short queries such as "버스" must match exactly.
 */
function allowedTypos(length) {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * Scores how well `query` matches `term` (0 = no match, 100 = exact).
 * @param {string} query Raw user input.
 * @param {string} term  A searchable value (name, code, number…).
 * @returns {number}
 */
export function matchScore(query, term) {
  const q = normalize(query);
  const t = normalize(term);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90 - Math.min(10, t.length - q.length);
  if (t.includes(q)) return 75 - Math.min(10, t.length - q.length) / 2;
  // Initial-consonant queries ("ㅈㅇㄷㅅㄱ"). Checked on the raw text because
  // NFKC turns these letters into a different (conjoining) form.
  const consonants = String(query).replace(/\s+/g, '');
  if (/^[ㄱ-ㅎ]+$/.test(consonants) && initialConsonants(t).includes(consonants)) return 70;

  const allowed = allowedTypos(q.length);
  if (allowed === 0) return 0;
  const typos = substringDistance(toJamo(q), toJamo(t));
  return typos <= allowed ? 55 - typos * 10 : 0;
}

/**
 * Best score of `query` against several terms.
 * @param {string} query
 * @param {Array<string|null|undefined>} terms
 * @returns {number}
 */
export function bestScore(query, terms) {
  let best = 0;
  for (const term of terms) {
    if (!term) continue;
    const score = matchScore(query, term);
    if (score > best) best = score;
    if (best === 100) break;
  }
  return best;
}

/**
 * @typedef {Object} SearchEntry
 * @property {'building'|'course'|'room'|'department'|'facility'|'place'} type
 * @property {string} id                 Unique id of the entry.
 * @property {string|null} buildingId    Building to open when selected.
 * @property {{en:string,ko:string}|string} title
 * @property {{en:string,ko:string}|string|null} subtitle
 * @property {string[]} terms            Values the query is matched against.
 * @property {boolean} [exactNumber]     Numeric terms must match exactly / by prefix.
 * @property {{type:string, value:string}|null} highlight Item to highlight in the building panel.
 * @property {{x:number,y:number}} [point] Location for places that are not buildings.
 * @property {string} [icon]
 * @property {string} [category]
 * @property {string} [number]
 */

/** Order of result groups in the UI. */
export const GROUP_ORDER = ['building', 'course', 'room', 'department', 'facility', 'place'];

/**
 * Builds the search index from campus and course data.
 * @param {object} campus Parsed campus.json.
 * @param {object[]} courses Parsed courses.json.
 * @param {(key: string) => {en: string, ko: string}} labelFor Returns both translations
 *        of a UI key (used for facility and POI type names).
 * @returns {SearchEntry[]}
 */
export function buildSearchIndex(campus, courses, labelFor) {
  const entries = [];
  const buildingsById = new Map(campus.buildings.map((b) => [b.id, b]));
  const both = (value) => (value && typeof value === 'object' ? [value.en, value.ko] : [value]);

  for (const b of campus.buildings) {
    entries.push({
      type: 'building',
      id: `building:${b.id}`,
      buildingId: b.id,
      title: b.name,
      subtitle: null,
      terms: [...both(b.name), ...both(b.shortName), b.number, b.id],
      highlight: null,
      category: b.category,
      number: b.number,
    });

    (b.departments ?? []).forEach((department, i) => {
      entries.push({
        type: 'department',
        id: `department:${b.id}:${i}`,
        buildingId: b.id,
        title: department,
        subtitle: b.name,
        terms: both(department),
        highlight: { type: 'department', value: String(i) },
        icon: 'users',
      });
    });

    for (const facility of b.facilities ?? []) {
      const label = labelFor(`facility.${facility}`);
      entries.push({
        type: 'facility',
        id: `facility:${b.id}:${facility}`,
        buildingId: b.id,
        title: label,
        subtitle: b.name,
        terms: [...both(label), facility],
        highlight: { type: 'facility', value: facility },
        icon: facility,
      });
    }

    for (const room of b.rooms ?? []) {
      entries.push({
        type: 'room',
        id: `room:${b.id}:${room}`,
        buildingId: b.id,
        title: { en: `Room ${room}`, ko: `${room}호` },
        subtitle: b.name,
        terms: [room],
        exactNumber: true,
        highlight: { type: 'room', value: room },
        icon: 'door',
      });
    }
  }

  for (const course of courses ?? []) {
    const building = buildingsById.get(course.building);
    if (!building) continue;
    entries.push({
      type: 'course',
      id: `course:${course.code}`,
      buildingId: course.building,
      title: { en: `${course.code} · ${course.name.en}`, ko: `${course.code} · ${course.name.ko}` },
      subtitle: building.name,
      room: course.room,
      terms: [course.code, ...both(course.name)],
      highlight: { type: 'course', value: course.code },
      icon: 'book',
    });
  }

  for (const poi of campus.pois ?? []) {
    const typeLabel = labelFor(`facility.${poi.type}`);
    entries.push({
      type: 'place',
      id: `place:${poi.id}`,
      buildingId: null,
      title: poi.name ?? typeLabel,
      subtitle: typeLabel,
      terms: [...both(poi.name), ...both(typeLabel), poi.type],
      highlight: null,
      point: { x: poi.x, y: poi.y },
      icon: poi.type,
    });
  }
  for (const gate of campus.nodes.filter((n) => n.type === 'gate' && n.name)) {
    const typeLabel = labelFor('facility.gate');
    entries.push({
      type: 'place',
      id: `place:${gate.id}`,
      buildingId: null,
      title: gate.name,
      subtitle: typeLabel,
      terms: [...both(gate.name), ...both(typeLabel)],
      highlight: null,
      point: { x: gate.x, y: gate.y },
      icon: 'gate',
    });
  }

  return entries;
}

/**
 * Scores one entry against a query. Numbers (building numbers, rooms) only
 * match exactly or as a prefix, so "20" does not fuzzily match "120".
 * @param {SearchEntry} entry
 * @param {string} query
 * @returns {number}
 */
function scoreEntry(entry, query) {
  const q = normalize(query);
  const prefixScore = (term) => {
    const t = normalize(term);
    if (t === q) return 100;
    return t.startsWith(q) ? 70 : 0;
  };
  // Rooms: only exact or prefix matches ("20" finds "201", never "120").
  if (entry.exactNumber) return Math.max(0, ...entry.terms.map(prefixScore));
  // A plain number typed for a building means its building number.
  if (entry.type === 'building' && /^\d+$/.test(q))
    return entry.number ? prefixScore(entry.number) : 0;
  return bestScore(query, entry.terms);
}

/**
 * Searches the index.
 * @param {SearchEntry[]} index
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.perGroup=5] Max results per type.
 * @param {number} [options.minScore=40]
 * @returns {Array<{entry: SearchEntry, score: number}>} Best matches grouped by
 *          type (strongest group first) and sorted by score within each group.
 */
export function search(index, query, { perGroup = 5, minScore = 40 } = {}) {
  if (!normalize(query)) return [];
  const groups = new Map(GROUP_ORDER.map((g) => [g, []]));
  for (const entry of index) {
    const score = scoreEntry(entry, query);
    if (score >= minScore) groups.get(entry.type)?.push({ entry, score });
  }
  // Groups with the strongest match come first ("201" → rooms before courses
  // whose code merely contains 201); ties keep the GROUP_ORDER.
  const ranked = GROUP_ORDER.map((type) => groups.get(type).sort((a, b) => b.score - a.score))
    .filter((list) => list.length > 0)
    .sort((a, b) => b[0].score - a[0].score);
  return ranked.flatMap((list) => list.slice(0, perGroup));
}
