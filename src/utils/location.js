/**
 * "Use my location": turns a GPS fix into map coordinates and finds the
 * building the person is in or nearest to. The position is only used in the
 * browser; it is never sent anywhere.
 */
import { createProjection } from './projection.js';
import { pointInShape, shapeToSegmentDistance } from './geometry.js';

/** Fixes less accurate than this (meters) ask the user to confirm the building. */
export const GOOD_ACCURACY_METERS = 50;
/** Farther than this from every building: probably not on campus. */
export const OFF_CAMPUS_METERS = 400;

/**
 * Map position of a latitude/longitude.
 * @param {object} campus
 * @param {number} lat
 * @param {number} lon
 * @returns {{x: number, y: number}|null} null when the data has no projection.
 */
export function toMapPoint(campus, lat, lon) {
  const center = campus.meta?.projection;
  if (!center) return null;
  return createProjection(center).project(lat, lon);
}

/**
 * The building containing the point, or else the closest one.
 * Outdoor areas (sports fields, parking) are skipped.
 * @param {object} campus
 * @param {{x: number, y: number}} point
 * @returns {{building: object, meters: number}|null}
 */
export function nearestBuilding(campus, point) {
  const metersPerUnit = campus.meta?.metersPerUnit ?? 1;
  let best = null;
  for (const building of campus.buildings) {
    if (building.kind === 'area' || !(building.entrances ?? []).length) continue;
    const d = pointInShape(point, building)
      ? 0
      : shapeToSegmentDistance(building, point, point) * metersPerUnit;
    if (!best || d < best.meters) best = { building, meters: d };
  }
  return best;
}

/**
 * One position fix from the browser.
 * @returns {Promise<GeolocationPosition>}
 */
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(Object.assign(new Error('unsupported'), { code: 'unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });
}
