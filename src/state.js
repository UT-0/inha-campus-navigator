/**
 * Application state.
 *
 * The whole app shares one plain state object. Modules never write to it
 * directly: they call `setState(partial)`, which merges the change and
 * notifies every subscriber with the list of keys that actually changed.
 * This tiny publish/subscribe pattern keeps UI modules independent — each one
 * just reacts to the keys it cares about.
 */

/**
 * @typedef {Object} RouteResult
 * @property {string} fromId   Start building (or place) id.
 * @property {string} toId     Destination building or place (POI) id.
 * @property {string[]} path   Node ids along the route (real nodes only).
 * @property {number} distance Total length in meters.
 * @property {boolean} [accessible] Found with the step-free option.
 */

/**
 * @typedef {Object} AppState
 * @property {object|null} campus           Parsed campus.json.
 * @property {object[]} courses             Parsed courses.json.
 * @property {'en'|'ko'} lang               Current UI language.
 * @property {'light'|'dark'} theme         Effective color theme.
 * @property {string|null} from             Selected start building id.
 * @property {string|null} to               Selected destination building id.
 * @property {RouteResult|null} route       Current route, if one is shown.
 * @property {'idle'|'ok'|'same'|'inside'|'none'|'noAccessible'|'noCandidates'} routeStatus
 *           Outcome of the last route request.
 * @property {number|null} activeStep       Index of the highlighted direction step.
 * @property {string|null} selectedBuilding Building whose panel is open.
 * @property {{type: string, value: string}|null} highlight Item to highlight in the building panel.
 * @property {string|null} hoveredBuilding  Building under the pointer.
 * @property {string[]} poiFilters          Amenity groups shown on the map.
 * @property {boolean} accessible           Step-free routes only (no stairs, step-free entrances).
 * @property {string|null} routeTarget      Place found by "nearest" (or the kind searched).
 * @property {boolean} infoOpen             Whether the campus Info panel is open.
 */

/** @type {AppState} */
const state = {
  campus: null,
  courses: [],
  lang: 'en',
  theme: 'light',
  from: null,
  to: null,
  route: null,
  routeStatus: 'idle',
  activeStep: null,
  selectedBuilding: null,
  highlight: null,
  hoveredBuilding: null,
  poiFilters: [],
  accessible: false,
  routeTarget: null,
  infoOpen: false,
};

/** @type {Set<(state: AppState, changed: string[]) => void>} */
const listeners = new Set();

/**
 * Returns the current state. Treat the result as read-only.
 * @returns {AppState}
 */
export function getState() {
  return state;
}

/**
 * Merges `partial` into the state and notifies subscribers about the keys
 * whose values changed (compared with `Object.is`).
 * @param {Partial<AppState>} partial
 */
export function setState(partial) {
  const changed = [];
  for (const [key, value] of Object.entries(partial)) {
    if (!Object.is(state[key], value)) {
      state[key] = value;
      changed.push(key);
    }
  }
  if (changed.length === 0) return;
  for (const listener of listeners) listener(state, changed);
}

/**
 * Registers a listener called after every state change.
 * @param {(state: AppState, changed: string[]) => void} listener
 * @returns {() => void} Function that removes the listener.
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
