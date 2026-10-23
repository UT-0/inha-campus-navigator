/**
 * Toast notifications: short messages that appear briefly at the bottom of
 * the screen ("Link copied", "No route found"). The container is an
 * aria-live region, so screen readers announce them too.
 */
import { el } from '../utils/dom.js';
import { createIcon } from './icons.js';

const ICONS = { info: 'info', success: 'check', error: 'warning' };
const MAX_VISIBLE = 3;

/**
 * Shows a toast.
 * @param {string} message
 * @param {Object} [options]
 * @param {'info'|'success'|'error'} [options.type='info']
 * @param {number} [options.duration=2800] Milliseconds before it disappears.
 */
export function showToast(message, { type = 'info', duration = 2800 } = {}) {
  const region = document.getElementById('toasts');
  if (!region) return;
  const toast = el(
    'div',
    { class: `toast toast-${type}` },
    createIcon(ICONS[type] ?? 'info', { size: 18 }),
    el('span', { text: message }),
  );
  region.append(toast);
  while (region.childElementCount > MAX_VISIBLE) region.firstElementChild.remove();

  setTimeout(() => {
    toast.classList.add('is-leaving');
    // Remove after the exit transition (or right away if animations are off).
    setTimeout(() => toast.remove(), 250);
  }, duration);
}
