/**
 * Pan, zoom and camera animation for the SVG map.
 *
 * The <svg> uses a pixel viewBox ("0 0 width height"), and the camera <g>
 * gets `translate(x y) scale(k)`. So a map point (wx, wy) appears on screen
 * at (x + k·wx, y + k·wy), and `k` is simply "screen pixels per map unit".
 *
 * Supported input:
 *  - mouse wheel / trackpad pinch: zoom around the cursor
 *  - drag with mouse, pen or one finger: pan
 *  - two fingers: pinch-zoom and pan together
 *  - double click / double tap: zoom in
 *  - keyboard (when the map has focus): arrows pan, + / − zoom, 0 resets
 *  - buttons call zoomBy() / reset()
 *
 * Zoom is limited to 0.5×–6× of the "whole campus" view, and the map can't be
 * dragged completely out of sight. `flyTo` animates the view to fit any box
 * (about 600 ms with easing, instant if the user prefers reduced motion).
 */
import { prefersReducedMotion } from '../utils/dom.js';

/** Movement (px) before a press turns into a drag instead of a click. */
const DRAG_THRESHOLD = 5;
/** Minimum number of pixels of the campus that must stay visible. */
const KEEP_VISIBLE = 80;

/**
 * @typedef {Object} Transform
 * @property {number} k Scale (screen px per map unit).
 * @property {number} x Horizontal offset in px.
 * @property {number} y Vertical offset in px.
 */

/**
 * @typedef {{top:number,right:number,bottom:number,left:number}} Padding
 * @typedef {{minX:number,minY:number,maxX:number,maxY:number}} Bounds
 */

/**
 * Creates the pan/zoom controller.
 * @param {Object} options
 * @param {SVGSVGElement} options.svg
 * @param {SVGGElement} options.camera Group that receives the transform.
 * @param {Bounds} options.worldBounds The campus extent in map units.
 * @param {number} [options.minZoom=0.5] Relative to the fitted "whole campus" view.
 * @param {number} [options.maxZoom=6]
 * @param {() => Padding} [options.getPadding] Screen areas covered by floating UI.
 * @param {(event: PointerEvent) => boolean} [options.shouldStartPan] Return false to
 *        let another tool (e.g. the map editor) handle a press.
 * @param {(t: Transform) => void} [options.onChange] Called after each camera change.
 */
export function createPanZoom({
  svg,
  camera,
  worldBounds,
  minZoom = 0.5,
  maxZoom = 6,
  getPadding = () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  shouldStartPan = () => true,
  onChange = () => {},
}) {
  let width = 1;
  let height = 1;
  let fitScale = 1;
  /** @type {Transform} */
  let view = { k: 1, x: 0, y: 0 };
  let frame = 0;
  let animation = 0;
  let initialised = false;

  // ---------- Geometry helpers ----------

  /** Scale that fits the given bounds into the padded viewport. */
  function scaleToFit(bounds, padding) {
    const availableW = Math.max(40, width - padding.left - padding.right);
    const availableH = Math.max(40, height - padding.top - padding.bottom);
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    return Math.min(availableW / bw, availableH / bh);
  }

  /** Transform that centres `bounds` in the padded viewport at scale `k`. */
  function centeredOn(bounds, k, padding) {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const sx = padding.left + (width - padding.left - padding.right) / 2;
    const sy = padding.top + (height - padding.top - padding.bottom) / 2;
    return { k, x: sx - k * cx, y: sy - k * cy };
  }

  /** Keeps zoom within limits and the campus at least partly on screen. */
  function clamp(t) {
    const k = Math.min(fitScale * maxZoom, Math.max(fitScale * minZoom, t.k));
    const left = t.x + k * worldBounds.minX;
    const right = t.x + k * worldBounds.maxX;
    const top = t.y + k * worldBounds.minY;
    const bottom = t.y + k * worldBounds.maxY;
    const keepX = Math.min(KEEP_VISIBLE, width / 2);
    const keepY = Math.min(KEEP_VISIBLE, height / 2);
    let { x, y } = t;
    if (right < keepX) x += keepX - right;
    if (left > width - keepX) x -= left - (width - keepX);
    if (bottom < keepY) y += keepY - bottom;
    if (top > height - keepY) y -= top - (height - keepY);
    return { k, x, y };
  }

  // ---------- Applying the transform ----------

  function setView(next) {
    view = clamp(next);
    if (!frame) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    camera.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    onChange({ ...view });
  }

  /** Zooms by `factor`, keeping the screen point (sx, sy) fixed. */
  function zoomAround(factor, sx, sy) {
    const k = Math.min(fitScale * maxZoom, Math.max(fitScale * minZoom, view.k * factor));
    const ratio = k / view.k;
    setView({ k, x: sx - (sx - view.x) * ratio, y: sy - (sy - view.y) * ratio });
  }

  // ---------- Animation ----------

  function stopAnimation() {
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
  }

  /**
   * Animates to a target transform. The point in the middle of the screen
   * moves in a straight line while the scale changes geometrically, which
   * looks natural for zooming.
   */
  function animateTo(target, duration = 600) {
    stopAnimation();
    target = clamp(target);
    if (duration <= 0 || prefersReducedMotion()) {
      setView(target);
      return;
    }
    const start = { ...view };
    const cx = width / 2;
    const cy = height / 2;
    const c0 = { x: (cx - start.x) / start.k, y: (cy - start.y) / start.k };
    const c1 = { x: (cx - target.x) / target.k, y: (cy - target.y) / target.k };
    const logK0 = Math.log(start.k);
    const logK1 = Math.log(target.k);
    const t0 = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - t0) / duration);
      const e = easeInOutCubic(progress);
      const k = Math.exp(logK0 + (logK1 - logK0) * e);
      const wx = c0.x + (c1.x - c0.x) * e;
      const wy = c0.y + (c1.y - c0.y) * e;
      view = { k, x: cx - k * wx, y: cy - k * wy };
      render();
      animation = progress < 1 ? requestAnimationFrame(step) : 0;
    };
    animation = requestAnimationFrame(step);
  }

  // ---------- Public camera API ----------

  /**
   * Smoothly fits the view to a bounding box.
   * @param {Bounds} bounds
   * @param {Object} [options]
   * @param {number} [options.margin=48]  Extra space around the box, in px.
   * @param {number} [options.maxScale=3] Max zoom relative to the whole-campus view.
   * @param {number} [options.duration=600]
   */
  function flyTo(bounds, { margin = 48, maxScale = 3, duration = 600 } = {}) {
    const base = getPadding();
    const padding = {
      top: base.top + margin,
      right: base.right + margin,
      bottom: base.bottom + margin,
      left: base.left + margin,
    };
    const k = Math.min(scaleToFit(bounds, padding), fitScale * maxScale);
    animateTo(centeredOn(bounds, k, padding), duration);
  }

  /** Shows the whole campus. */
  function reset(animate = true) {
    const padding = getPadding();
    fitScale = scaleToFit(worldBounds, padding);
    const target = centeredOn(worldBounds, fitScale, padding);
    if (animate) animateTo(target, 450);
    else {
      stopAnimation();
      setView(target);
    }
  }

  /** Zooms in (factor > 1) or out around the middle of the visible area. */
  function zoomBy(factor) {
    const padding = getPadding();
    const sx = padding.left + (width - padding.left - padding.right) / 2;
    const sy = padding.top + (height - padding.top - padding.bottom) / 2;
    const k = Math.min(fitScale * maxZoom, Math.max(fitScale * minZoom, view.k * factor));
    const ratio = k / view.k;
    animateTo({ k, x: sx - (sx - view.x) * ratio, y: sy - (sy - view.y) * ratio }, 250);
  }

  /**
   * Converts a client (page) position into map units.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x:number, y:number}}
   */
  function screenToWorld(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  }

  /**
   * Converts map units into a client position.
   * @param {number} x
   * @param {number} y
   * @returns {{x:number, y:number}}
   */
  function worldToScreen(x, y) {
    const rect = svg.getBoundingClientRect();
    return { x: rect.left + view.x + view.k * x, y: rect.top + view.y + view.k * y };
  }

  // ---------- Resize handling ----------

  function measure() {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Keep whatever was in the middle of the screen in the middle.
    const center = initialised
      ? { x: (width / 2 - view.x) / view.k, y: (height / 2 - view.y) / view.k }
      : null;
    width = rect.width;
    height = rect.height;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    fitScale = scaleToFit(worldBounds, getPadding());
    if (!initialised) {
      initialised = true;
      reset(false);
    } else {
      setView({ k: view.k, x: width / 2 - view.k * center.x, y: height / 2 - view.k * center.y });
    }
  }

  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(svg);
  measure();

  // ---------- Pointer input ----------

  const pointers = new Map();
  let dragDistance = 0;
  let suppressClick = false;
  let lastPinch = null;

  function localPoint(event) {
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    };
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!shouldStartPan(event)) return;
    stopAnimation();
    suppressClick = false;
    pointers.set(event.pointerId, localPoint(event));
    if (pointers.size === 1) dragDistance = 0;
    if (pointers.size === 2) lastPinch = pinchInfo();
  }

  function onPointerMove(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const current = localPoint(event);
    pointers.set(event.pointerId, current);

    if (pointers.size === 1) {
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      dragDistance += Math.hypot(dx, dy);
      if (dragDistance > DRAG_THRESHOLD) {
        // Capture only once it is really a drag, so plain clicks still reach buildings.
        if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
        svg.classList.add('is-panning');
        setView({ k: view.k, x: view.x + dx, y: view.y + dy });
      }
    } else if (pointers.size === 2 && lastPinch) {
      const pinch = pinchInfo();
      dragDistance = Infinity; // a pinch is never a tap
      const factor = pinch.dist / lastPinch.dist;
      const k = Math.min(fitScale * maxZoom, Math.max(fitScale * minZoom, view.k * factor));
      const ratio = k / view.k;
      // Zoom around the previous midpoint, then follow the midpoint's movement.
      setView({
        k,
        x: pinch.mid.x - (lastPinch.mid.x - view.x) * ratio,
        y: pinch.mid.y - (lastPinch.mid.y - view.y) * ratio,
      });
      lastPinch = pinch;
    }
  }

  function onPointerUp(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (dragDistance > DRAG_THRESHOLD) suppressClick = true;
    if (pointers.size < 2) lastPinch = null;
    if (pointers.size === 0) svg.classList.remove('is-panning');
  }

  // A drag should not also count as a click on the building under the pointer.
  function onClickCapture(event) {
    if (suppressClick) {
      event.stopPropagation();
      event.preventDefault();
      suppressClick = false;
    }
  }

  function onWheel(event) {
    event.preventDefault();
    stopAnimation();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    // Trackpad pinch arrives as a wheel event with ctrlKey and small deltas.
    const speed = event.ctrlKey ? 0.01 : 0.0018;
    const factor = Math.exp(-event.deltaY * unit * speed);
    const p = localPoint(event);
    zoomAround(factor, p.x, p.y);
  }

  function onDoubleClick(event) {
    if (!shouldStartPan(event)) return;
    event.preventDefault();
    const p = localPoint(event);
    const k = Math.min(fitScale * maxZoom, view.k * 2);
    const ratio = k / view.k;
    animateTo({ k, x: p.x - (p.x - view.x) * ratio, y: p.y - (p.y - view.y) * ratio }, 300);
  }

  function onKeyDown(event) {
    if (event.target !== svg) return;
    const step = 60;
    const actions = {
      ArrowLeft: () => animateTo({ ...view, x: view.x + step }, 150),
      ArrowRight: () => animateTo({ ...view, x: view.x - step }, 150),
      ArrowUp: () => animateTo({ ...view, y: view.y + step }, 150),
      ArrowDown: () => animateTo({ ...view, y: view.y - step }, 150),
      '+': () => zoomBy(1.5),
      '=': () => zoomBy(1.5),
      '-': () => zoomBy(1 / 1.5),
      0: () => reset(),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('click', onClickCapture, true);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('dblclick', onDoubleClick);
  svg.addEventListener('keydown', onKeyDown);

  return {
    flyTo,
    reset,
    zoomBy,
    screenToWorld,
    worldToScreen,
    /** @returns {Transform} */
    getTransform: () => ({ ...view }),
    /** @returns {number} Zoom relative to the whole-campus view (1 = fitted). */
    getRelativeZoom: () => view.k / fitScale,
    /** Re-measures after layout changes (e.g. the bottom sheet moved). */
    refresh: measure,
    destroy() {
      resizeObserver.disconnect();
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerUp);
      svg.removeEventListener('click', onClickCapture, true);
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('dblclick', onDoubleClick);
      svg.removeEventListener('keydown', onKeyDown);
    },
  };
}

/** Classic ease-in-out curve: slow start, fast middle, slow end. */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
