/**
 * Inline SVG icon set, drawn for this project (no icon fonts or external
 * images). Every icon is a set of stroked shapes on a 24 × 24 grid that use
 * `currentColor`, so icons take the text color of wherever they are placed.
 */

/** Inner markup of each icon, keyed by name. */
export const ICON_PATHS = {
  // General UI
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  swap: '<path d="M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  reset:
    '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="M8 21l3-7 3 3v5M11 14l-.5-5.5 4 2.5 2 3M10.5 8.5L7.5 10l-1 3"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6a2 2 0 0 1-4 0"/>',
  building:
    '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 8h3M8 12h3M8 16h3"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18"/><path d="M14.5 12h.01"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/>',
  target:
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  warning: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  layersMap:
    '<path d="M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',

  // Editor
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M4 20h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  node: '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  connect:
    '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><path d="M7.5 16.5l9-9"/>',
  polygon: '<path d="M12 3l8.5 6.2-3.3 10.3H6.8L3.5 9.2z"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  pointer: '<path d="M5 3l14 7-6 2-2 6z"/>',

  // Directions
  exit: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8M10 12h11M18 9l3 3-3 3"/>',
  straight: '<path d="M12 20V4M6 10l6-6 6 6"/>',
  left: '<path d="M18 20v-8a3 3 0 0 0-3-3H5M9 5L5 9l4 4"/>',
  right: '<path d="M6 20v-8a3 3 0 0 1 3-3h10M15 5l4 4-4 4"/>',
  'slight-left': '<path d="M16 21v-8L7 4M7 4v6M7 4h6"/>',
  'slight-right': '<path d="M8 21v-8l9-9M17 4v6M17 4h-6"/>',
  'sharp-left': '<path d="M16 21V6L6 16M6 16v-6M6 16h6"/>',
  'sharp-right': '<path d="M8 21V6l10 10M18 16v-6M18 16h-6"/>',
  uturn: '<path d="M8 21V9a4 4 0 0 1 8 0v8M12 13l4 4 4-4"/>',
  arrive: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',

  // Facilities and POI types
  cafe: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3"/>',
  printer:
    '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  atm: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 14.5h4"/>',
  restroom:
    '<circle cx="7" cy="4.5" r="2"/><circle cx="17" cy="4.5" r="2"/><path d="M5 21v-5H4l1-6h4l1 6H9v5M15 21v-7h-1V9h6v5h-1v7M12 3v18"/>',
  convenience_store: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  restaurant: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 8h3"/>',
  parking:
    '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"/>',
  bus_stop:
    '<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 21v-3M16 21v-3M8.5 14.5h.01M15.5 14.5h.01"/>',
  gate: '<path d="M3 21V8l9-5 9 5v13M7 21v-8h10v8M12 13v8"/>',
  elevator:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01"/>',
  study_room:
    '<path d="M3 5c3-1 6-.5 9 1.5V20c-3-2-6-2.5-9-1.5zM21 5c-3-1-6-.5-9 1.5V20c3-2 6-2.5 9-1.5z"/>',
  lounge:
    '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v5H3zM5 18v2M19 18v2"/>',
  lockers: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M8 8h1M15 8h1"/>',
  laundry:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6.5h.01M11 6.5h.01"/>',
};

/**
 * Returns the markup of an icon as an inline <svg> string.
 * @param {string} name Icon name from ICON_PATHS (falls back to "info").
 * @param {Object} [options]
 * @param {number} [options.size=20] Width/height in pixels.
 * @param {number} [options.strokeWidth=2]
 * @param {string} [options.className]
 * @returns {string}
 */
export function iconSvg(name, { size = 20, strokeWidth = 2, className = '' } = {}) {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.info;
  return (
    `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${paths}</svg>`
  );
}

/**
 * Creates an icon as a DOM element.
 * @param {string} name
 * @param {Parameters<typeof iconSvg>[1]} [options]
 * @returns {SVGSVGElement}
 */
export function createIcon(name, options) {
  const template = document.createElement('template');
  template.innerHTML = iconSvg(name, options);
  return /** @type {SVGSVGElement} */ (template.content.firstElementChild);
}
