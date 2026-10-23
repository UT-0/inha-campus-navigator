/**
 * Converts between latitude/longitude and flat map coordinates in meters.
 *
 * The campus is small (under 1 km across), so a local equirectangular
 * projection centred on the campus is accurate to a few centimetres:
 *   x = east  distance from the centre in meters
 *   y = south distance from the centre in meters (so SVG's y-axis works)
 * The centre is stored in campus.json (`meta.projection`), which makes the
 * conversion reversible — needed to place the GPS "you are here" dot.
 */

/** Mean Earth radius used by WGS84-based web maps, in meters. */
export const EARTH_RADIUS = 6378137;

const RAD = Math.PI / 180;

/**
 * Creates a projection centred on the given point.
 * @param {{lat0: number, lon0: number}} center
 * @returns {{
 *   project: (lat: number, lon: number) => {x: number, y: number},
 *   unproject: (x: number, y: number) => {lat: number, lon: number}
 * }}
 */
export function createProjection({ lat0, lon0 }) {
  const metersPerDegLat = EARTH_RADIUS * RAD;
  const metersPerDegLon = EARTH_RADIUS * RAD * Math.cos(lat0 * RAD);
  return {
    project(lat, lon) {
      return { x: (lon - lon0) * metersPerDegLon, y: -(lat - lat0) * metersPerDegLat };
    },
    unproject(x, y) {
      return { lat: lat0 - y / metersPerDegLat, lon: lon0 + x / metersPerDegLon };
    },
  };
}

/**
 * Great-circle distance between two points in meters (haversine formula).
 * Used to check the projection and to measure GPS accuracy against the map.
 * @param {{lat: number, lon: number}} a
 * @param {{lat: number, lon: number}} b
 * @returns {number}
 */
export function haversineMeters(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}
