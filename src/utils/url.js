/**
 * Shareable links: reads and writes `?from=<buildingId>&to=<buildingId>` in
 * the address bar, so a route can be shared and reopened.
 */

/**
 * Reads the route parameters from the current URL.
 * @param {string} [search=location.search]
 * @returns {{from: string|null, to: string|null, edit: boolean}}
 */
export function readRouteParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    from: params.get('from'),
    to: params.get('to'),
    edit: params.get('edit') === '1',
  };
}

/**
 * Builds a full URL for a route (or the plain app URL when ids are missing).
 * Other query parameters are kept.
 * @param {string|null} from
 * @param {string|null} to
 * @returns {string}
 */
export function buildRouteUrl(from, to) {
  const url = new URL(window.location.href);
  url.searchParams.delete('from');
  url.searchParams.delete('to');
  if (from && to) {
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
  }
  url.hash = '';
  return url.toString();
}

/**
 * Updates the address bar without reloading or adding a history entry.
 * @param {string|null} from
 * @param {string|null} to
 */
export function writeRouteParams(from, to) {
  const next = buildRouteUrl(from, to);
  if (next !== window.location.href) window.history.replaceState(null, '', next);
}

/**
 * Copies text to the clipboard, with a fallback for older browsers.
 * @param {string} text
 * @returns {Promise<boolean>} Whether copying succeeded.
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
