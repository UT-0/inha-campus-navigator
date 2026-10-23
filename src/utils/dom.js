/**
 * Tiny DOM helpers so UI modules can build elements declaratively without a
 * framework.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates an HTML element.
 * @param {string} tag
 * @param {Object<string, any>} [props] Attributes; `class`, `text`, `html`,
 *        `dataset`, `style` and `on<Event>` handlers get special treatment.
 * @param {...(Node|string|null|undefined|false)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  return applyProps(document.createElement(tag), props, children);
}

/**
 * Creates an SVG element.
 * @param {string} tag
 * @param {Object<string, any>} [props]
 * @param {...(Node|string|null|undefined|false)} children
 * @returns {SVGElement}
 */
export function svgEl(tag, props = {}, ...children) {
  return applyProps(document.createElementNS(SVG_NS, tag), props, children);
}

function applyProps(node, props, children) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.setAttribute('class', value);
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Escapes text for safe use inside innerHTML.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts translated text with **bold** markers into safe HTML.
 * @param {string} text
 * @returns {string}
 */
export function richText(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Removes ** markers, for plain-text contexts such as aria labels.
 * @param {string} text
 * @returns {string}
 */
export function plainText(text) {
  return String(text).replace(/\*\*/g, '');
}

/** @returns {boolean} True if the user asked the OS to reduce motion. */
export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Safe localStorage read (storage can throw in private mode or when blocked).
 * @param {string} key
 * @param {any} fallback
 * @returns {any} Parsed JSON value or the fallback.
 */
export function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Safe localStorage write.
 * @param {string} key
 * @param {any} value Serialised as JSON.
 */
export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: not critical */
  }
}
