/**
 * Draws the route on the map: a light casing line under a thick, rounded
 * line in the accent color, animated with a "draw-on" effect, plus the start
 * ("A", green) and destination ("B", red) pins. A direction step can be
 * highlighted on top of the route.
 *
 * Line widths are given in screen pixels and converted to map units on every
 * zoom change, so the route looks the same at any zoom level.
 */
import { svgEl, prefersReducedMotion } from '../utils/dom.js';
import { markerSize } from './renderMap.js';

const CASING_PX = 11;
const LINE_PX = 6;
const HIGHLIGHT_PX = 8;
const DRAW_DURATION_MS = 900;

/**
 * @param {Object} options
 * @param {SVGGElement} options.routeLayer
 * @param {SVGGElement} options.markerLayer
 */
export function createRouteLayer({ routeLayer, markerLayer }) {
  let scale = 1;
  let casing = null;
  let line = null;
  let highlight = null;
  let markers = [];

  function pointsAttr(points) {
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  }

  function applyWidths() {
    casing?.setAttribute('stroke-width', String(CASING_PX / scale));
    line?.setAttribute('stroke-width', String(LINE_PX / scale));
    highlight?.setAttribute('stroke-width', String(HIGHLIGHT_PX / scale));
    const size = markerSize(scale) / scale;
    for (const marker of markers) {
      marker.setAttribute(
        'transform',
        `translate(${marker.dataset.x} ${marker.dataset.y}) scale(${size})`,
      );
    }
  }

  /** A map pin with a letter, anchored at its tip. */
  function createMarker(point, letter, kind) {
    const group = svgEl(
      'g',
      { class: `route-marker is-${kind}`, 'data-x': point.x, 'data-y': point.y },
      svgEl(
        'g',
        { class: 'route-marker-body' },
        svgEl('ellipse', { class: 'route-marker-shadow', cx: 0, cy: 0, rx: 6, ry: 2.5 }),
        svgEl('path', {
          class: 'route-marker-pin',
          d: 'M0 0C-3 -7 -13 -13 -13 -23A13 13 0 1 1 13 -23C13 -13 3 -7 0 0Z',
        }),
        svgEl('text', { class: 'route-marker-letter', x: 0, y: -23, dy: '0.35em', text: letter }),
      ),
    );
    markerLayer.append(group);
    return group;
  }

  return {
    /**
     * Draws a route.
     * @param {Array<{x:number,y:number}>} points
     */
    draw(points) {
      this.clear();
      if (points.length === 0) return;
      const animate = !prefersReducedMotion();
      const attrs = { points: pointsAttr(points), pathLength: 1 };
      casing = svgEl('polyline', { ...attrs, class: 'route-casing' });
      line = svgEl('polyline', { ...attrs, class: 'route-line' });
      if (animate) {
        for (const el of [casing, line]) {
          el.classList.add('is-drawing');
          el.style.animationDuration = `${DRAW_DURATION_MS}ms`;
        }
      }
      routeLayer.append(casing, line);
      markers = [
        createMarker(points[0], 'A', 'start'),
        createMarker(points[points.length - 1], 'B', 'end'),
      ];
      if (animate) markers[1].firstChild.style.animationDelay = `${DRAW_DURATION_MS * 0.8}ms`;
      applyWidths();
    },

    /**
     * Highlights part of the route (one direction step).
     * @param {Array<{x:number,y:number}>|null} points
     */
    highlight(points) {
      highlight?.remove();
      highlight = null;
      routeLayer.classList.toggle('has-highlight', Boolean(points && points.length));
      if (!points || points.length === 0) return;
      if (points.length === 1) {
        // A single node (exit/arrive step): draw a dot.
        highlight = svgEl('polyline', {
          class: 'route-highlight is-point',
          points: pointsAttr([points[0], points[0]]),
        });
      } else {
        highlight = svgEl('polyline', { class: 'route-highlight', points: pointsAttr(points) });
      }
      routeLayer.append(highlight);
      applyWidths();
    },

    /** Removes the route, highlight and markers. */
    clear() {
      routeLayer.replaceChildren();
      markerLayer.replaceChildren();
      routeLayer.classList.remove('has-highlight');
      casing = line = highlight = null;
      markers = [];
    },

    /**
     * Keeps line widths and pins at a constant screen size.
     * @param {number} k Camera zoom.
     */
    setScale(k) {
      scale = k;
      applyWidths();
    },
  };
}
