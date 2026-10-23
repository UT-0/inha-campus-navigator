/**
 * Points of interest for the map: OSM amenity nodes (only where actually
 * mapped) plus official facilities from data-raw/official/details.json.
 *
 * - Amenities on campus are kept; those inside the Inha Technical College
 *   area are dropped unless they sit in an Inha building (the dormitories).
 * - Transport (bus stops, subway exits, the station) is kept anywhere inside
 *   the map area, since the stops just outside the gates matter most.
 * - A POI inside a building gets `buildingId` and `indoor: true`; the map
 *   draws those as one icon per group next to the building, and the
 *   building panel lists them (food places, the floor directory).
 *
 * Each POI: { id, type, group, name: {ko, en} | null, x, y, buildingId,
 *   indoor, status, source: {url, retrieved}, landmark?, ref?, routes?, note? }
 */
import { buildPrefixTable, parseRoomCode } from '../../src/utils/roomCode.js';
import { pointInRing, round } from './geo.mjs';

/** Filter groups shown as map chips, in display order. */
export const POI_GROUPS = [
  'food',
  'restroom',
  'printing',
  'money',
  'transport',
  'health',
  'study',
  'services',
];

/**
 * OSM tags → {type, group}. The first matching rule wins.
 * @type {Array<[(tags: object) => boolean, string, string]>}
 */
const RULES = [
  [(t) => t.railway === 'station', 'station', 'transport'],
  [(t) => t.railway === 'subway_entrance', 'subway_entrance', 'transport'],
  [
    (t) => t.highway === 'bus_stop' && t.public_transport !== 'stop_position',
    'bus_stop',
    'transport',
  ],
  [(t) => t.amenity === 'bicycle_parking', 'bicycle_parking', 'transport'],
  [(t) => t.amenity === 'parking', 'parking', 'transport'],
  [(t) => t.amenity === 'cafe' || t.amenity === 'ice_cream' || t.shop === 'bakery', 'cafe', 'food'],
  [(t) => t.amenity === 'restaurant' || t.amenity === 'fast_food', 'restaurant', 'food'],
  [(t) => t.shop === 'convenience' || t.shop === 'supermarket', 'convenience_store', 'food'],
  [(t) => t.amenity === 'vending_machine', 'vending', 'food'],
  [(t) => t.amenity === 'drinking_water', 'water', 'food'],
  [(t) => t.amenity === 'toilets', 'restroom', 'restroom'],
  [
    (t) => t.shop === 'stationery' || t.shop === 'copyshop' || t.amenity === 'printer',
    'printer',
    'printing',
  ],
  [(t) => t.amenity === 'atm', 'atm', 'money'],
  [(t) => t.amenity === 'bank', 'bank', 'money'],
  [(t) => t.amenity === 'defibrillator' || t.emergency === 'defibrillator', 'aed', 'health'],
  [(t) => ['pharmacy', 'clinic', 'doctors', 'hospital'].includes(t.amenity), 'health', 'health'],
  [(t) => t.amenity === 'smoking_area', 'smoking', 'health'],
  [(t) => t.amenity === 'bench', 'bench', 'study'],
  [(t) => t.amenity === 'post_office', 'post_office', 'services'],
  [(t) => t.tourism === 'museum', 'museum', 'services'],
  [(t) => t.shop === 'books', 'bookstore', 'services'],
  [(t) => t.amenity === 'place_of_worship', 'prayer_room', 'services'],
];

/** Types that also serve as landmarks in walking directions. */
const LANDMARK_TYPES = new Set(['station', 'museum']);

/** Official office kinds that appear as map POIs. */
const OFFICE_TYPES = {
  health: { type: 'health', group: 'health' },
  counseling: { type: 'counseling', group: 'health' },
  student_support: { type: 'counseling', group: 'health' },
};

function classify(tags) {
  for (const [test, type, group] of RULES) if (test(tags)) return { type, group };
  return null;
}

function osmName(tags, type) {
  if (type === 'subway_entrance') {
    if (!tags.ref) return null;
    return {
      ko: tags['description:ko'] ?? `인하대역 ${tags.ref}번 출구`,
      en: `Inha Univ. Station Exit ${tags.ref}`,
    };
  }
  const ko = tags['name:ko'] ?? tags.name;
  const en = tags['name:en'] ?? tags.name;
  return ko || en ? { ko: ko ?? en, en: en ?? ko } : null;
}

/**
 * @param {object} options
 * @param {{nodes: Map, ways: Map}} options.osm  Indexed OSM data.
 * @param {(node: {lat:number, lon:number}) => number[]} options.toXY
 * @param {object[]} options.buildings Campus buildings (food and the floor
 *        directory are filled in for indoor amenities).
 * @param {number[][]} options.campusRing
 * @param {number[][]} options.excludeRing Inha Technical College area.
 * @param {number[]} options.viewBox
 * @param {object} options.details     data-raw/official/details.json
 * @param {string} options.osmRetrieved Date of the OSM snapshot.
 * @returns {{pois: object[], report: object}}
 */
export function buildAmenities({
  osm,
  toXY,
  buildings,
  campusRing,
  excludeRing,
  viewBox,
  details,
  osmRetrieved,
}) {
  const pois = [];
  const skipped = [];
  const [minX, minY, width, height] = viewBox;
  const inView = ([x, y]) => x >= minX && x <= minX + width && y >= minY && y <= minY + height;
  const buildingAt = (p) =>
    buildings.find((b) => b.kind !== 'area' && b.polygons.some((ring) => pointInRing(p, ring)));
  const usedAsBuilding = new Set(buildings.flatMap((b) => b.osmIds));

  function addOsm(element, point) {
    const tags = element.tags ?? {};
    const kind = classify(tags);
    if (!kind) return;
    const ref = `${element.type}/${element.id}`;
    if (usedAsBuilding.has(ref)) return;
    const building = buildingAt(point);
    const onCampus = pointInRing(point, campusRing);
    if (kind.group === 'transport') {
      if (!inView(point)) return;
    } else if (!onCampus || (pointInRing(point, excludeRing) && !building)) {
      return;
    }
    const name = osmName(tags, kind.type);
    const poi = {
      id: `p-${element.type[0]}${element.id}`,
      type: kind.type,
      group: kind.group,
      name,
      x: round(point)[0],
      y: round(point)[1],
      buildingId: building?.id ?? null,
      indoor: Boolean(building),
      status: 'osm',
      source: { url: `https://www.openstreetmap.org/${ref}`, retrieved: osmRetrieved },
      osmId: ref,
    };
    if (LANDMARK_TYPES.has(kind.type) && name) poi.landmark = true;
    if (tags.ref && kind.type === 'bus_stop') poi.ref = tags.ref;
    if (tags.route_ref) poi.routes = tags.route_ref.split(';');
    if (tags.opening_hours) poi.openingHours = tags.opening_hours;
    pois.push(poi);
  }

  for (const node of osm.nodes.values()) {
    if (node.tags) addOsm(node, toXY(node));
  }
  // Area amenities (parking lots): one icon at the middle of the outline.
  for (const way of osm.ways.values()) {
    if (way.tags?.amenity !== 'parking' || way.nodes[0] !== way.nodes[way.nodes.length - 1])
      continue;
    const points = way.nodes.slice(1).map((id) => toXY(osm.nodes.get(id)));
    const middle = [
      points.reduce((s, p) => s + p[0], 0) / points.length,
      points.reduce((s, p) => s + p[1], 0) / points.length,
    ];
    if (pointInRing(middle, campusRing)) addOsm(way, middle);
  }

  // ---------- Official facilities ----------
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const table = buildPrefixTable(buildings);
  const officialPoi = (id, building, fields) => {
    const [x, y] = building.labelPosition;
    pois.push({
      id,
      x,
      y,
      buildingId: building.id,
      indoor: true,
      status: 'verified',
      ...fields,
    });
  };

  for (const office of details.offices) {
    const mapped =
      office.type === 'lounge' ? { type: 'lounge', group: 'study' } : OFFICE_TYPES[office.kind];
    if (!mapped) continue;
    const parsed = parseRoomCode(office.location, table);
    const building = parsed && byId.get(parsed.buildingId);
    if (!building) {
      skipped.push({ what: office.ko, why: 'location not on campus map' });
      continue;
    }
    officialPoi(`p-office-${building.id}-${parsed.room ?? office.kind}`, building, {
      ...mapped,
      name: { ko: office.ko, en: office.en },
      note: { ko: office.location, en: office.location },
      source: { url: office.source, retrieved: office.retrieved },
    });
  }

  details.atms.list.forEach((atm, i) => {
    const building = byId.get(atm.building);
    if (!building) return;
    officialPoi(`p-atm-${i + 1}`, building, {
      type: 'atm',
      group: 'money',
      name: { ko: '하나은행 ATM', en: `${details.atms.bank} ATM` },
      note: { ko: atm.ko, en: atm.en },
      source: { url: details.atms.source, retrieved: details.atms.retrieved },
    });
  });

  const cafeteria = byId.get(details.cafeteria.building);
  if (cafeteria) {
    officialPoi('p-cafeteria', cafeteria, {
      type: 'restaurant',
      group: 'food',
      name: { ko: details.cafeteria.ko, en: details.cafeteria.en },
      source: { url: details.cafeteria.source, retrieved: details.cafeteria.retrieved },
    });
    // The OSM node for the same cafeteria is a duplicate.
    const duplicate = pois.findIndex(
      (p) =>
        p.status === 'osm' && p.buildingId === cafeteria.id && p.name?.ko === details.cafeteria.ko,
    );
    if (duplicate !== -1) pois.splice(duplicate, 1);
  }

  // ---------- Indoor OSM amenities in the building panel ----------
  for (const poi of pois) {
    if (!poi.indoor || poi.status !== 'osm') continue;
    const building = byId.get(poi.buildingId);
    const label = poi.name ?? null;
    if (poi.group === 'food' && label) {
      building.amenities.food.places.push({
        ko: label.ko,
        en: label.en,
        type: poi.type,
        status: 'osm',
      });
      if (building.amenities.food.status === 'unknown') building.amenities.food.status = 'osm';
    } else if (label) {
      // Floor not mapped in OSM: listed under "floor unknown".
      let unknownFloor = building.floorDirectory.find((f) => f.floor === null);
      if (!unknownFloor) {
        unknownFloor = { floor: null, items: [] };
        building.floorDirectory.push(unknownFloor);
      }
      unknownFloor.items.push({
        ko: label.ko,
        en: label.en,
        room: null,
        phone: null,
        type: 'facility',
        kind: poi.type,
        status: 'osm',
      });
    }
    if (!building.sources.some((s) => s.url === poi.source.url)) {
      building.sources.push({ field: 'amenities', ...poi.source });
    }
  }

  pois.sort((a, b) => a.id.localeCompare(b.id));
  const counts = Object.fromEntries(
    POI_GROUPS.map((g) => [g, pois.filter((p) => p.group === g).length]),
  );
  return { pois, report: { counts, skipped } };
}
