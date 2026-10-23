/**
 * Draggable bottom sheet for phones (< 900px wide).
 *
 * The panel area slides up from the bottom and rests at three snap points:
 *   peek – only the top of the panel is visible, the map is free;
 *   half – about half the screen (route results, building info);
 *   full – nearly the whole screen, for reading long content.
 *
 * Drag the handle (or the content while the sheet is not fully open) to move
 * it; on release it snaps to the nearest point, taking the flick speed into
 * account. Tapping or pressing Enter on the handle cycles through the snap
 * points. Only vertical drags inside the sheet are handled here, so they never
 * conflict with the map's own pan and pinch gestures.
 *
 * On desktop the sheet is a normal sidebar and this module does nothing.
 */

const SNAPS = ['peek', 'half', 'full'];

/**
 * @param {Object} options
 * @param {HTMLElement} options.sheet
 * @param {HTMLElement} options.handle
 * @param {HTMLElement} options.content
 * @param {MediaQueryList} options.mobileQuery
 * @param {(snap: string) => string} options.handleLabel Accessible label for the handle.
 * @param {(snap: string) => void} [options.onSnap] Called after the snap point changes.
 */
export function createBottomSheet({
  sheet,
  handle,
  content,
  mobileQuery,
  handleLabel,
  onSnap = () => {},
}) {
  let snap = 'peek';
  let drag = null;
  /** Clicks right after a drag are ignored (the drag ended on a button). */
  let suppressClicksUntil = 0;

  // ---------- Geometry ----------

  function viewportHeight() {
    return window.visualViewport?.height ?? window.innerHeight;
  }

  function cssPx(name, fallback) {
    const value = parseFloat(getComputedStyle(sheet.closest('.app')).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  /** Height of the sheet that is visible at a snap point. */
  function visibleHeight(name = snap) {
    const sheetHeight = sheet.offsetHeight || viewportHeight() - 124;
    if (name === 'full') return sheetHeight;
    if (name === 'half')
      return Math.min(sheetHeight, Math.max(300, Math.round(viewportHeight() * 0.5)));
    return Math.min(sheetHeight, cssPx('--sheet-peek', 156));
  }

  function offsetFor(name) {
    return sheet.offsetHeight - visibleHeight(name);
  }

  function apply() {
    if (!mobileQuery.matches) {
      sheet.style.transform = '';
      content.style.touchAction = '';
      return;
    }
    sheet.style.transform = `translateY(${offsetFor(snap)}px)`;
    sheet.dataset.snap = snap;
    // Content scrolls natively only when fully open; otherwise drags move the sheet.
    content.style.touchAction = snap === 'full' ? 'pan-y' : 'none';
    handle.setAttribute('aria-label', handleLabel(snap));
    handle.setAttribute('aria-expanded', String(snap !== 'peek'));
  }

  /**
   * Moves the sheet to a snap point.
   * @param {'peek'|'half'|'full'} name
   */
  function snapTo(name) {
    if (!SNAPS.includes(name)) return;
    const changed = name !== snap;
    snap = name;
    apply();
    if (changed) onSnap(snap);
  }

  // ---------- Dragging ----------

  function start(event, fromContent) {
    if (!mobileQuery.matches) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (fromContent && snap === 'full') return;
    drag = {
      id: event.pointerId,
      startY: event.clientY,
      startOffset: offsetFor(snap),
      lastY: event.clientY,
      lastTime: performance.now(),
      velocity: 0,
      moved: false,
      fromContent,
    };
    // The handle owns the pointer right away so fast drags can't escape it.
    if (!fromContent) handle.setPointerCapture(event.pointerId);
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dy) < 6) return;
      drag.moved = true;
      sheet.classList.add('is-dragging');
      if (drag.fromContent) content.setPointerCapture(event.pointerId);
    }
    const now = performance.now();
    drag.velocity = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastTime);
    drag.lastY = event.clientY;
    drag.lastTime = now;
    const min = offsetFor('full');
    const max = offsetFor('peek');
    // Resist a little when pulled past the ends.
    let offset = drag.startOffset + dy;
    if (offset < min) offset = min - (min - offset) * 0.3;
    if (offset > max) offset = max + (offset - max) * 0.3;
    sheet.style.transform = `translateY(${offset}px)`;
  }

  function end(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, velocity, startOffset, startY } = drag;
    drag = null;
    sheet.classList.remove('is-dragging');
    if (!moved) return;
    suppressClicksUntil = performance.now() + 350;
    // Project where a flick would carry the sheet, then pick the closest snap.
    const projected = startOffset + (event.clientY - startY) + velocity * 180;
    const closest = SNAPS.reduce((best, name) =>
      Math.abs(offsetFor(name) - projected) < Math.abs(offsetFor(best) - projected) ? name : best,
    );
    snapTo(closest);
    if (closest === snap) apply();
  }

  handle.addEventListener('pointerdown', (event) => start(event, false));
  // Taps on buttons and fields still work: a drag only starts after 6px of movement.
  content.addEventListener('pointerdown', (event) => start(event, true));
  for (const target of [handle, content]) {
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  // A drag inside the content must not also count as a click on a button.
  sheet.addEventListener(
    'click',
    (event) => {
      if (performance.now() < suppressClicksUntil) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    true,
  );

  // Tap / keyboard on the handle cycles the snap points.
  handle.addEventListener('click', () => {
    if (!mobileQuery.matches) return;
    snapTo(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');
  });

  // ---------- Layout changes ----------

  mobileQuery.addEventListener('change', apply);
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
  apply();

  return {
    snapTo,
    /** @returns {'peek'|'half'|'full'} */
    getSnap: () => snap,
    /** Visible height of the sheet (px) at the current or given snap point. */
    visibleHeight,
    isActive: () => mobileQuery.matches,
  };
}
