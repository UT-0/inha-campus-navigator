/**
 * Attaches official facts (data-raw/official/details.json) to buildings:
 * department and college offices, campus offices, ATMs, the cafeteria,
 * Wi-Fi, lounges; builds the floor directory; and writes short bilingual
 * descriptions from those facts only (plus a location hint computed from
 * the map geometry). Nothing here is guessed: buildings without facts get a
 * description that says their contents are not verified yet.
 */
import { buildPrefixTable, floorLabel, parseRoomCode } from '../../src/utils/roomCode.js';
import { pointInRing } from './geo.mjs';

const WING_EN = { 동: 'East', 서: 'West', 남: 'South', 북: 'North' };
const COMPASS = {
  en: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
  ko: ['북쪽', '북동쪽', '동쪽', '남동쪽', '남쪽', '남서쪽', '서쪽', '북서쪽'],
};

function centroid(building) {
  const ring = building.polygons[0];
  const n = ring.length;
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
}

/** Sorts rooms by number: "2호관 2남 212호" → "0212". */
function roomSortKey(room) {
  const number = [...(room?.ko ?? '').matchAll(/(\d+)([A-Z]?)호(?!관)/g)].at(-1);
  return number ? number[1].padStart(4, '0') + number[2] : '9999';
}

/** "2남 212호" → { ko: "2남 212호", en: "2 South, Room 212" } */
function roomText(parsed, raw) {
  if (!parsed) return { ko: raw, en: raw };
  const wingEn = parsed.wingKo ? ` ${WING_EN[parsed.wingKo]}` : '';
  return {
    ko: raw,
    en: parsed.room ? `Room ${parsed.room}${wingEn ? ` (${wingEn.trim()} wing)` : ''}` : raw,
  };
}

/**
 * @param {object} options
 * @param {object[]} options.buildings Campus buildings (mutated).
 * @param {object} options.details     data-raw/official/details.json
 * @param {object[]} options.nodes     Graph nodes (for gate landmarks).
 * @param {object[]} options.areas     Map areas (for the lake landmark).
 */
export function applyOfficialDetails({ buildings, details, nodes, areas }) {
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const table = buildPrefixTable(buildings);
  const unresolved = [];
  const directory = new Map(buildings.map((b) => [b.id, []])); // floor items
  const addSource = (b, field, url, retrieved) => {
    if (!b.sources.some((s) => s.field === field && s.url === url))
      b.sources.push({ field, url, retrieved });
  };

  function place(text) {
    const parsed = parseRoomCode(text, table);
    return parsed && byId.has(parsed.buildingId) ? parsed : null;
  }

  // ---------- College offices ----------
  for (const college of details.colleges) {
    if (!college.office) continue;
    const parsed = place(college.office);
    if (!parsed) {
      unresolved.push({ what: college.ko, location: college.office });
      continue;
    }
    const b = byId.get(parsed.buildingId);
    directory.get(b.id).push({
      floor: parsed.floor,
      ko: `${college.ko} 행정실`,
      en: `${college.en} office`,
      room: roomText(parsed, college.office),
      phone: college.phone,
      type: 'office',
      status: 'verified',
    });
    addSource(b, 'floorDirectory', college.source, college.retrieved);
  }

  // ---------- Department offices ----------
  for (const dept of details.departments) {
    const parsed = dept.office ? place(dept.office) : null;
    if (!parsed) {
      unresolved.push({ what: dept.ko, location: dept.office ?? '(not listed)', note: dept.note });
      continue;
    }
    const b = byId.get(parsed.buildingId);
    b.departments.push({
      ko: dept.ko,
      en: dept.en,
      url: dept.url,
      college: dept.college,
      office: roomText(parsed, dept.office),
      floor: parsed.floor,
      floorLabel: parsed.floorLabel,
      wing: parsed.wingKo,
      phone: dept.phone,
      status: 'verified',
    });
    directory.get(b.id).push({
      floor: parsed.floor,
      ko: `${dept.ko} 사무실`,
      en: `${dept.en} office`,
      room: roomText(parsed, dept.office),
      phone: dept.phone,
      type: 'office',
      status: 'verified',
    });
    addSource(b, 'departments', dept.source, dept.retrieved);
  }

  // ---------- Campus offices, health center, lounges ----------
  for (const office of details.offices) {
    const parsed = place(office.location);
    if (!parsed) {
      unresolved.push({ what: office.ko, location: office.location });
      continue;
    }
    const b = byId.get(parsed.buildingId);
    directory.get(b.id).push({
      floor: parsed.floor,
      ko: office.ko,
      en: office.en,
      room: roomText(parsed, office.location),
      phone: office.phone ?? null,
      hours: office.hours ?? null,
      type:
        office.type === 'lounge' ? 'lounge' : office.type === 'facility' ? 'facility' : 'office',
      kind: office.kind ?? null,
      status: 'verified',
    });
    if (office.type === 'lounge') {
      b.amenities.studySpace.locations.push({
        ko: `${office.ko} (${office.location})`,
        en: `${office.en} (${office.location})`,
      });
      b.amenities.studySpace.status = 'verified';
    }
    addSource(b, 'floorDirectory', office.source, office.retrieved);
  }

  // ---------- ATMs ----------
  for (const atm of details.atms.list) {
    const b = byId.get(atm.building);
    if (!b) continue;
    b.amenities.atm.locations.push({
      ko: `${details.atms.bank === 'Hana Bank' ? '하나은행' : ''} ATM · ${atm.ko}`,
      en: `${details.atms.bank} ATM · ${atm.en}`,
    });
    b.amenities.atm.status = 'verified';
    addSource(b, 'amenities.atm', details.atms.source, details.atms.retrieved);
  }

  // ---------- Cafeteria ----------
  const cafeteria = byId.get(details.cafeteria.building);
  if (cafeteria) {
    cafeteria.amenities.food.places.push({
      ko: details.cafeteria.ko,
      en: details.cafeteria.en,
      hours: details.cafeteria.hours,
    });
    cafeteria.amenities.food.status = 'verified';
    addSource(cafeteria, 'amenities.food', details.cafeteria.source, details.cafeteria.retrieved);
  }

  // ---------- Wi-Fi: "교내 건물 실내 전체" (inside all campus buildings) ----------
  for (const b of buildings) {
    if (b.kind === 'area' || b.number === null) continue;
    b.amenities.wifi = {
      available: true,
      networks: [details.wifi.ssid],
      status: 'verified',
      note: details.wifi.coverage,
    };
    for (const s of details.wifi.sources) addSource(b, 'amenities.wifi', s.url, s.retrieved);
  }

  // ---------- Floor directory ----------
  for (const b of buildings) {
    const items = directory.get(b.id);
    const floors = new Map();
    for (const item of items) {
      const key = item.floor ?? 'unknown';
      if (!floors.has(key)) floors.set(key, []);
      const { floor, ...rest } = item;
      floors.get(key).push(rest);
    }
    b.floorDirectory = [...floors.entries()]
      .sort(([a], [c]) => (a === 'unknown' ? 1 : c === 'unknown' ? -1 : a - c))
      .map(([floor, list]) => ({
        floor: floor === 'unknown' ? null : floorLabel(floor),
        items: list.sort((x, y) => roomSortKey(x.room).localeCompare(roomSortKey(y.room))),
      }));
  }

  // ---------- Categories confirmed by department offices ----------
  for (const b of buildings) {
    if (b.departments.length > 0 && b.categoryStatus !== 'verified') {
      b.category = 'academic';
      b.categoryStatus = 'verified';
    }
  }

  // ---------- Descriptions ----------
  const landmarks = buildLandmarks(buildings, nodes, areas);
  for (const b of buildings) {
    b.description = describe(b, landmarks);
    b.descriptionStatus =
      b.departments.length || b.floorDirectory.length || b.amenities.atm.locations.length
        ? 'verified'
        : 'osm';
  }

  return { unresolved };
}

/** Well-known places used in "where is it" hints. */
function buildLandmarks(buildings, nodes, areas) {
  const list = [];
  const pick = (id, ko, en) => {
    const b = buildings.find((x) => x.id === id);
    if (b) list.push({ id, ko, en, point: centroid(b), ring: b.polygons[0] });
  };
  pick('b-library', '정석학술정보관', 'the Jungseok Memorial Library');
  pick('b-1', '본관', 'the University Main Building');
  pick('b-7', '학생회관', 'the Student Center');
  pick('b-field', '대운동장', 'the Sports Field');
  for (const node of nodes) {
    if (node.type === 'gate' && node.name) {
      list.push({
        id: node.gateId,
        ko: node.name.ko,
        en: `the ${node.name.en}`,
        point: [node.x, node.y],
      });
    }
  }
  const lake = areas.find((a) => a.name?.ko === '인경호');
  if (lake) {
    const ring = lake.polygons[0];
    list.push({
      id: 'lake',
      ko: '인경호',
      en: 'Ingyeong Lake (인경호)',
      point: [
        ring.reduce((s, p) => s + p[0], 0) / ring.length,
        ring.reduce((s, p) => s + p[1], 0) / ring.length,
      ],
      ring,
    });
  }
  return list;
}

function locationHint(b, landmarks) {
  const c = centroid(b);
  let best = null;
  for (const l of landmarks) {
    if (l.id === b.id) continue;
    // Distance to the landmark outline when it has one (so big buildings are fair).
    let d = Math.hypot(l.point[0] - c[0], l.point[1] - c[1]);
    if (l.ring && pointInRing(c, l.ring)) d = 0;
    if (!best || d < best.d) best = { l, d };
  }
  if (!best) return null;
  const dx = c[0] - best.l.point[0];
  const dy = c[1] - best.l.point[1];
  const bearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const index = Math.round(bearing / 45) % 8;
  if (best.d < 90) return { ko: `${best.l.ko} 가까이에 있습니다`, en: `close to ${best.l.en}` };
  return {
    ko: `${best.l.ko} ${COMPASS.ko[index]}에 있습니다`,
    en: `${COMPASS.en[index]} of ${best.l.en}`,
  };
}

/**
 * Joins a list naturally: "A and B", "A, B, and C" (serial comma, since many
 * department names contain "and") / "A, B, C".
 */
function joinList(items, lang) {
  if (items.length <= 1) return items.join('');
  if (lang === 'ko') return items.join(', ');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Topic particle: 은 after a final consonant, 는 after a vowel. A trailing
 * "(…)" is skipped, as in "대운동장(캠퍼스맵 19번)은".
 */
function topic(word) {
  const base = word.replace(/(\([^()]*\))+$/, '');
  const code = base.charCodeAt(base.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}은(는)`;
  return `${word}${(code - 0xac00) % 28 ? '은' : '는'}`;
}

function describe(b, landmarks) {
  const hint = locationHint(b, landmarks);
  const en = [];
  const ko = [];
  const nameEn = b.name.en;
  const nameKo = b.name.ko;
  const numberEn = b.number ? ` (no. ${b.number} on the campus map)` : '';
  const numberKo = b.number ? `(캠퍼스맵 ${b.number}번)` : '';

  const offices = b.floorDirectory.flatMap((f) => f.items);
  const collegeOffices = offices.filter(
    (i) =>
      i.en.endsWith(' office') &&
      /College|School of|College of/.test(i.en) &&
      !b.departments.some((d) => `${d.en} office` === i.en),
  );
  const depts = b.departments;

  if (b.kind === 'area') {
    en.push(
      `${nameEn}${numberEn} is an outdoor ${b.category === 'sports' ? 'sports facility' : 'area'} of the campus.`,
    );
    ko.push(
      `${topic(nameKo + numberKo)} 캠퍼스의 야외 ${b.category === 'sports' ? '체육 시설' : '공간'}입니다.`,
    );
  } else if (b.category === 'dormitory') {
    en.push(`${nameEn}${numberEn} is a student residence hall.`);
    ko.push(`${topic(nameKo + numberKo)} 학생 생활관(기숙사)입니다.`);
  } else if (depts.length > 0) {
    const sample = depts.slice(0, 3);
    const more = depts.length > 3 ? depts.length - 3 : 0;
    const names = sample.map((d) => d.en);
    if (more) names.push(`${more} more department${more > 1 ? 's' : ''}`);
    en.push(`${nameEn}${numberEn} has the offices of ${joinList(names, 'en')}.`);
    ko.push(
      `${nameKo}${numberKo}에는 ${joinList(
        sample.map((d) => d.ko),
        'ko',
      )}${more ? ` 등 ${depts.length}개 학과·부서` : ''}의 사무실이 있습니다.`,
    );
  } else if (b.number) {
    en.push(`${nameEn} is building ${b.number} on the official campus map.`);
    ko.push(`${topic(nameKo)} 공식 캠퍼스맵의 ${b.number}번 건물입니다.`);
  } else {
    en.push(`${nameEn} is a building on campus, named in OpenStreetMap.`);
    ko.push(`${topic(nameKo)} OpenStreetMap에 이름이 표시된 교내 건물입니다.`);
  }

  if (collegeOffices.length) {
    en.push(
      `It is home to the ${joinList(
        collegeOffices.map((o) => o.en.replace(/ office$/, '')),
        'en',
      )} administration office${collegeOffices.length > 1 ? 's' : ''}.`,
    );
    ko.push(
      `${joinList(
        collegeOffices.map((o) => o.ko.replace(/ 행정실$/, '')),
        'ko',
      )} 행정실이 있습니다.`,
    );
  }

  const facilities = { en: [], ko: [] };
  for (const item of offices) {
    if (
      item.type === 'facility' ||
      item.kind === 'counseling' ||
      item.kind === 'student_support' ||
      item.kind === 'it'
    ) {
      facilities.en.push(`the ${item.en}`);
      facilities.ko.push(item.ko);
    }
  }
  if (offices.some((i) => i.type === 'lounge')) {
    facilities.en.push('a student lounge');
    facilities.ko.push('학생 휴게실');
  }
  if (b.amenities.food.places.length) {
    facilities.en.push(`the ${b.amenities.food.places[0].en}`);
    facilities.ko.push(b.amenities.food.places[0].ko);
  }
  if (b.amenities.atm.locations.length) {
    facilities.en.push('a Hana Bank ATM');
    facilities.ko.push('하나은행 ATM');
  }
  if (facilities.en.length) {
    en.push(`You'll also find ${joinList(facilities.en, 'en')} here.`);
    ko.push(`${joinList(facilities.ko, 'ko')}도 이곳에 있습니다.`);
  }

  if (hint) {
    en.push(`It is ${hint.en}.`);
    ko.push(`${hint.ko}.`);
  }
  if (!depts.length && !offices.length && b.kind !== 'area' && b.category !== 'dormitory') {
    en.push(
      facilities.en.length
        ? 'Its other contents have not been verified yet.'
        : 'What is inside has not been verified yet.',
    );
    ko.push(
      facilities.en.length
        ? '그 밖의 건물 내부 정보는 아직 확인되지 않았습니다.'
        : '건물 내부 정보는 아직 확인되지 않았습니다.',
    );
  }
  return { en: en.join(' '), ko: ko.join(' ') };
}
