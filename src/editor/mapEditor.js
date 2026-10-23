/**
 * Map Editor — a developer tool for tracing the real campus.
 *
 * Opened with `?edit=1`. It is loaded as a separate chunk only in that case,
 * hides the normal app completely, and never changes the bundled data: it
 * works on a copy and exports a new campus.json.
 *
 * Features:
 *  - a reference image behind the map (from meta.backgroundImage or a local
 *    file) with adjustable opacity;
 *  - tools: select/edit, add node, add place, connect nodes (or delete a
 *    path), draw building/area polygons, move points, delete, calibrate scale;
 *  - live cursor coordinates, undo/redo, an autosaved draft;
 *  - validation with the same checks the app runs, JSON import/export, and
 *    "Preview in app" to test routing on the draft before exporting.
 *
 * The side panel (forms, file buttons, problems) lives in editorPanel.js.
 */
import './editor.css';
import { renderMap, updateScaledElements } from '../map/renderMap.js';
import { createPanZoom } from '../map/panZoom.js';
import { createLabels } from '../map/labels.js';
import { validateCampus } from '../routing/graph.js';
import { getLanguage, t } from '../i18n/index.js';
import { el, svgEl, readStorage, writeStorage } from '../utils/dom.js';
import {
  boundsOf,
  distance,
  pointInPolygon,
  polygonCentroid,
  polygonToSegmentDistance,
} from '../utils/geometry.js';
import { createIcon } from '../ui/icons.js';
import { createEditorPanel } from './editorPanel.js';
import { DRAFT_KEY } from './draft.js';

const HISTORY_LIMIT = 80;
/** Click tolerance in screen pixels when snapping to an existing node. */
const SNAP_PX = 10;

/** Toolbar tools: [mode, icon, shortcut key]. */
const TOOLS = [
  ['select', 'pointer', 'v'],
  ['add-node', 'node', 'n'],
  ['add-poi', 'pin', 'p'],
  ['connect', 'connect', 'c'],
  ['draw', 'polygon', 'b'],
  ['move', 'move', 'm'],
  ['delete', 'trash', 'd'],
  ['calibrate', 'ruler', 'k'],
];

/**
 * Starts the editor.
 * @param {object} initialCampus The campus data the app loaded.
 */
export function startEditor(initialCampus) {
  document.getElementById('app').hidden = true;
  document.title = `${t('editor.title')} · ${t('app.title')}`;

  let campus = structuredClone(initialCampus);
  const draft = readStorage(DRAFT_KEY, null);
  if (
    draft &&
    draft.meta &&
    Array.isArray(draft.nodes) &&
    window.confirm(t('editor.restoreDraft'))
  ) {
    campus = draft;
  }
  ensureShape(campus);

  /** Everything the editor knows besides the campus data itself. */
  const editor = {
    mode: 'select',
    nodeType: 'junction',
    poiType: 'bus_stop',
    /** @type {{kind: 'node'|'building'|'edge'|'poi'|'area', id: string|number}|null} */
    selection: null,
    connectFrom: null,
    drawing: [],
    calibration: [],
    pendingShape: null,
    imageUrl: null,
    imageOpacity: 0.5,
    imageSize: null,
    problems: null,
    flagged: new Set(),
    message: '',
  };
  const undoStack = [];
  const redoStack = [];

  // ---------- DOM ----------

  const svg = svgEl('svg', { class: 'map editor-svg', 'aria-label': t('editor.title') });
  const camera = svgEl('g', { class: 'editor-camera' });
  const overlay = svgEl('g', { class: 'editor-overlay' });
  svg.append(camera);
  const toolbar = el('div', {
    class: 'editor-toolbar',
    role: 'toolbar',
    'aria-label': t('editor.tools'),
  });
  const coords = el('div', { class: 'editor-coords', 'aria-live': 'off' });
  const status = el('div', { class: 'editor-status', role: 'status' });
  const panelEl = el('aside', { class: 'editor-panel', 'aria-label': t('editor.title') });
  const root = el(
    'div',
    { class: 'editor', id: 'editor' },
    el('div', { class: 'editor-map' }, svg, toolbar, coords, status),
    panelEl,
  );
  document.body.append(root);

  // ---------- Rendering ----------

  let view = null;
  let labels = null;
  let panZoom = null;
  let scale = 1;

  /** Campus copy used for drawing: swaps in a locally loaded reference image. */
  function renderableCampus() {
    if (!editor.imageUrl) return campus;
    return { ...campus, meta: { ...campus.meta, backgroundImage: editor.imageUrl } };
  }

  function renderBase() {
    view = renderMap(camera, renderableCampus());
    labels = createLabels(view.layers.labels, campus);
    labels.setLanguage(getLanguage());
    camera.append(overlay); // keep the editor overlay on top
    svg.style.setProperty('--reference-opacity', String(editor.imageOpacity));
    applyScale();
  }

  function applyScale() {
    if (!view) return;
    updateScaledElements(view.scaledEls, scale);
    labels.update({ scale, relativeZoom: panZoom?.getRelativeZoom() ?? 1, emphasized: new Set() });
    renderOverlay();
  }

  /** (Re)creates pan/zoom, e.g. after the map size (viewBox) changed. */
  function setupCamera() {
    panZoom?.destroy();
    const [x, y, w, h] = campus.meta.viewBox;
    panZoom = createPanZoom({
      svg,
      camera,
      worldBounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
      maxZoom: 12,
      getPadding: () => ({ top: 64, right: 16, bottom: 40, left: 16 }),
      shouldStartPan,
      onChange: ({ k }) => {
        scale = k;
        applyScale();
      },
    });
  }

  /** Editor handles and previews drawn above the map. */
  function renderOverlay() {
    const px = 1 / scale; // one screen pixel in map units
    const nodes = new Map(campus.nodes.map((n) => [n.id, n]));
    const sel = editor.selection;
    const parts = [];

    // Paths: wide invisible lines that are easy to click.
    campus.edges.forEach((edge, index) => {
      const a = nodes.get(edge.from);
      const b = nodes.get(edge.to);
      if (!a || !b) return;
      const selected = sel?.kind === 'edge' && sel.id === index;
      parts.push(
        svgEl('line', {
          class: `ed-edge${selected ? ' is-selected' : ''}`,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          'stroke-width': 12 * px,
          'data-kind': 'edge',
          'data-index': index,
        }),
      );
    });

    // Selected building/area outline and its corner handles (also in Move mode).
    for (const [kind, list] of [
      ['building', campus.buildings],
      ['area', campus.areas],
    ]) {
      for (const item of list) {
        const isSelected = sel?.kind === kind && sel.id === item.id;
        const flagged = editor.flagged.has(item.id);
        if (isSelected || flagged) {
          parts.push(
            svgEl('polygon', {
              class: `ed-outline${flagged ? ' is-flagged' : ''}`,
              points: item.polygon.map((p) => p.join(',')).join(' '),
              'stroke-width': 3 * px,
            }),
          );
        }
        if (isSelected || editor.mode === 'move') {
          item.polygon.forEach(([vx, vy], vi) => {
            parts.push(
              svgEl('rect', {
                class: 'ed-vertex',
                x: vx - 5 * px,
                y: vy - 5 * px,
                width: 10 * px,
                height: 10 * px,
                'stroke-width': 1.5 * px,
                'data-kind': 'vertex',
                'data-owner': kind,
                'data-id': item.id,
                'data-vi': vi,
              }),
            );
          });
        }
      }
    }

    // Nodes.
    for (const node of campus.nodes) {
      const selected =
        (sel?.kind === 'node' && sel.id === node.id) || editor.connectFrom === node.id;
      const radius = node.type === 'junction' ? 4.5 : 6;
      parts.push(
        svgEl('circle', {
          class: `ed-node ed-node-${node.type}${selected ? ' is-selected' : ''}${editor.flagged.has(node.id) ? ' is-flagged' : ''}`,
          cx: node.x,
          cy: node.y,
          r: (selected ? radius + 2 : radius) * px,
          'stroke-width': 2 * px,
          'data-kind': 'node',
          'data-id': node.id,
        }),
      );
    }

    // POIs: invisible hit circles over the icons.
    for (const poi of campus.pois) {
      const selected = sel?.kind === 'poi' && sel.id === poi.id;
      parts.push(
        svgEl('circle', {
          class: `ed-poi${selected ? ' is-selected' : ''}`,
          cx: poi.x,
          cy: poi.y,
          r: 13 * px,
          'stroke-width': 2.5 * px,
          'data-kind': 'poi',
          'data-id': poi.id,
        }),
      );
    }

    // Polygon being drawn.
    if (editor.drawing.length > 0) {
      const points = [...editor.drawing, ...(editor.cursor ? [editor.cursor] : [])];
      parts.push(
        svgEl('polyline', {
          class: 'ed-drawing',
          points: points.map((p) => `${p[0]},${p[1]}`).join(' '),
          'stroke-width': 2 * px,
        }),
      );
      for (const [x, y] of editor.drawing) {
        parts.push(svgEl('circle', { class: 'ed-drawing-point', cx: x, cy: y, r: 4 * px }));
      }
    }

    // Calibration line.
    if (editor.calibration.length > 0) {
      const [a] = editor.calibration;
      const b = editor.calibration[1] ?? editor.cursor;
      if (b) {
        parts.push(
          svgEl('line', {
            class: 'ed-calibration',
            x1: a[0],
            y1: a[1],
            x2: b[0],
            y2: b[1],
            'stroke-width': 2 * px,
            'stroke-dasharray': `${6 * px} ${4 * px}`,
          }),
        );
      }
      for (const [x, y] of editor.calibration) {
        parts.push(svgEl('circle', { class: 'ed-calibration-point', cx: x, cy: y, r: 5 * px }));
      }
    }

    overlay.replaceChildren(...parts);
  }

  function renderToolbar() {
    toolbar.replaceChildren(
      ...TOOLS.map(([mode, icon, key]) =>
        el(
          'button',
          {
            class: `editor-tool${editor.mode === mode ? ' is-active' : ''}`,
            type: 'button',
            'aria-pressed': String(editor.mode === mode),
            title: `${t(`editor.mode.${mode}`)} (${key.toUpperCase()})`,
            onClick: () => setMode(mode),
          },
          createIcon(icon, { size: 18 }),
          el('span', { text: t(`editor.mode.${mode}`) }),
        ),
      ),
      el('span', { class: 'editor-toolbar-sep', 'aria-hidden': 'true' }),
      el(
        'button',
        {
          class: 'editor-tool',
          type: 'button',
          title: `${t('editor.undo')} (Ctrl+Z)`,
          onClick: undo,
          disabled: undoStack.length === 0,
        },
        createIcon('history', { size: 18 }),
        el('span', { text: t('editor.undo') }),
      ),
    );
    status.textContent = editor.message || t(`editor.help.${editor.mode}`);
    svg.dataset.mode = editor.mode;
  }

  function renderAll({ keepForm = false } = {}) {
    renderBase();
    renderToolbar();
    panel.render({ keepForm });
  }

  // ---------- Changes and history ----------

  let draftTimer = 0;

  /**
   * Applies a change to the campus with undo support.
   * @param {(campus: object) => void} mutate
   * @param {{keepForm?: boolean}} [options] keepForm: the change came from the
   *        properties form, so the form is not rebuilt (keeps keyboard focus).
   */
  function commit(mutate, options = {}) {
    undoStack.push(JSON.stringify(campus));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    mutate(campus);
    afterChange(options);
  }

  function afterChange(options = {}) {
    editor.problems = null;
    editor.flagged.clear();
    // Drop a selection that no longer exists.
    if (editor.selection && !findSelected()) editor.selection = null;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => writeStorage(DRAFT_KEY, campus), 400);
    renderAll(options);
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify(campus));
    campus = JSON.parse(undoStack.pop());
    afterChange();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(campus));
    campus = JSON.parse(redoStack.pop());
    afterChange();
  }

  // ---------- Modes ----------

  function setMode(mode) {
    editor.mode = mode;
    editor.connectFrom = null;
    editor.drawing = [];
    editor.calibration = [];
    editor.message = '';
    renderToolbar();
    renderOverlay();
    panel.render({ keepForm: true });
  }

  function say(message) {
    editor.message = message;
    renderToolbar();
  }

  // ---------- Helpers ----------

  function findSelected() {
    const sel = editor.selection;
    if (!sel) return null;
    if (sel.kind === 'edge') return campus.edges[sel.id] ?? null;
    const list = {
      node: campus.nodes,
      building: campus.buildings,
      poi: campus.pois,
      area: campus.areas,
    }[sel.kind];
    return list?.find((item) => item.id === sel.id) ?? null;
  }

  function select(selection) {
    editor.selection = selection;
    renderOverlay();
    panel.render();
  }

  /** Map coordinates of a pointer event, rounded to whole units. */
  function worldPoint(event) {
    const p = panZoom.screenToWorld(event.clientX, event.clientY);
    return [Math.round(p.x), Math.round(p.y)];
  }

  function uniqueId(prefix, taken) {
    let i = 1;
    while (taken.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  }

  function allIds() {
    return new Set([
      ...campus.nodes.map((n) => n.id),
      ...campus.buildings.map((b) => b.id),
      ...campus.pois.map((p) => p.id),
      ...campus.areas.map((a) => a.id),
    ]);
  }

  function nodeNear([x, y]) {
    let best = null;
    for (const node of campus.nodes) {
      const d = Math.hypot(node.x - x, node.y - y) * scale;
      if (d <= SNAP_PX && (!best || d < best.d)) best = { node, d };
    }
    return best?.node ?? null;
  }

  /** Building that contains the point, or the closest one. */
  function nearestBuilding([x, y]) {
    let best = null;
    for (const building of campus.buildings) {
      const p = { x, y };
      const d = pointInPolygon(p, building.polygon)
        ? 0
        : polygonToSegmentDistance(building.polygon, p, p);
      if (!best || d < best.d) best = { building, d };
    }
    return best?.building ?? null;
  }

  /** Identifies what was clicked, from the event target. */
  function hitTest(target) {
    const handle = target.closest?.('[data-kind]');
    if (handle) {
      const kind = handle.dataset.kind;
      if (kind === 'edge') return { kind, id: Number(handle.dataset.index) };
      if (kind === 'vertex')
        return {
          kind,
          owner: handle.dataset.owner,
          id: handle.dataset.id,
          vi: Number(handle.dataset.vi),
        };
      return { kind, id: handle.dataset.id };
    }
    const poi = target.closest?.('.poi');
    if (poi)
      return { kind: poi.classList.contains('poi-gate') ? 'node' : 'poi', id: poi.dataset.id };
    const building = target.closest?.('.building');
    if (building) return { kind: 'building', id: building.dataset.id };
    const area = target.closest?.('.area');
    if (area?.dataset.id) return { kind: 'area', id: area.dataset.id };
    return null;
  }

  // ---------- Click handling per tool ----------

  svg.addEventListener('click', (event) => {
    const point = worldPoint(event);
    const hit = hitTest(event.target);
    const handlers = {
      select: () => {
        if (!hit) select(null);
        else if (hit.kind === 'vertex') select({ kind: hit.owner, id: hit.id });
        else select({ kind: hit.kind, id: hit.id });
      },
      'add-node': () => addNode(point, hit),
      'add-poi': () => addPoi(point),
      connect: () => connect(point, hit),
      draw: () => {
        editor.drawing.push(point);
        renderOverlay();
      },
      delete: () => hit && deleteItem(hit),
      calibrate: () => calibrate(point),
      move: () => {},
    };
    handlers[editor.mode]?.();
  });

  svg.addEventListener('dblclick', (event) => {
    if (editor.mode !== 'draw') return;
    event.preventDefault();
    finishDrawing();
  });

  function addNode(point, hit) {
    if (hit?.kind === 'node' || nodeNear(point)) return;
    const type = editor.nodeType;
    let building = null;
    if (type === 'entrance') {
      building = nearestBuilding(point);
      if (!building) {
        say(t('editor.needBuilding'));
        return;
      }
    }
    const prefix = {
      junction: 'j-',
      entrance: `e-${building?.id.replace(/^b-/, '') ?? ''}-`,
      gate: 'g-',
    }[type];
    const id = uniqueId(prefix, allIds());
    commit((c) => {
      const node = { id, x: point[0], y: point[1], type };
      if (building) {
        node.building = building.id;
        const target = c.buildings.find((b) => b.id === building.id);
        target.entrances = [...(target.entrances ?? []), id];
      }
      if (type === 'gate') node.name = { en: 'Gate', ko: '문' };
      c.nodes.push(node);
    });
    select({ kind: 'node', id });
  }

  function addPoi(point) {
    const id = uniqueId('p-', allIds());
    const type = editor.poiType;
    commit((c) => {
      c.pois.push({
        id,
        type,
        x: point[0],
        y: point[1],
        name: { en: t(`facility.${type}`), ko: t(`facility.${type}`) },
      });
    });
    select({ kind: 'poi', id });
  }

  function connect(point, hit) {
    if (hit?.kind === 'edge') {
      commit((c) => c.edges.splice(hit.id, 1));
      return;
    }
    let nodeId = hit?.kind === 'node' ? hit.id : nodeNear(point)?.id;
    if (!nodeId) {
      // Clicking empty space adds a junction on the way.
      nodeId = uniqueId('j-', allIds());
      const id = nodeId;
      commit((c) => c.nodes.push({ id, x: point[0], y: point[1], type: 'junction' }));
    }
    const from = editor.connectFrom;
    if (from && from !== nodeId) {
      const exists = campus.edges.some(
        (e) => (e.from === from && e.to === nodeId) || (e.from === nodeId && e.to === from),
      );
      if (!exists) {
        commit((c) =>
          c.edges.push({ from, to: nodeId, distance: null, stairs: false, covered: false }),
        );
      }
    }
    editor.connectFrom = nodeId;
    renderOverlay();
  }

  function finishDrawing() {
    // A double-click also produced two clicks at the same spot: drop duplicates.
    const points = editor.drawing.filter(
      (p, i, list) => i === 0 || p[0] !== list[i - 1][0] || p[1] !== list[i - 1][1],
    );
    editor.drawing = [];
    renderOverlay();
    if (points.length < 3) return;
    editor.pendingShape = points;
    panel.render();
  }

  /** Called by the panel form after a polygon was drawn. */
  function createShape({ kind, id, number, nameEn, nameKo, category, areaType }) {
    const points = editor.pendingShape;
    if (!points) return false;
    if (!id || allIds().has(id)) {
      say(t('editor.idTaken', { id }));
      return false;
    }
    const center = polygonCentroid(points);
    commit((c) => {
      if (kind === 'building') {
        c.buildings.push({
          id,
          number: number || String(c.buildings.length + 1),
          name: { en: nameEn || id, ko: nameKo || nameEn || id },
          shortName: { en: nameEn || id, ko: nameKo || nameEn || id },
          category,
          polygon: points,
          labelPosition: [Math.round(center.x), Math.round(center.y)],
          entrances: [],
          floors: 1,
          description: { en: '', ko: '' },
          departments: [],
          facilities: [],
          rooms: [],
          openingHours: { en: '', ko: '' },
        });
      } else {
        const area = { id, type: areaType, polygon: points };
        if (nameEn || nameKo) area.name = { en: nameEn || nameKo, ko: nameKo || nameEn };
        c.areas.push(area);
      }
    });
    editor.pendingShape = null;
    select({ kind, id });
    return true;
  }

  function deleteItem(hit) {
    commit((c) => {
      if (hit.kind === 'edge') c.edges.splice(hit.id, 1);
      if (hit.kind === 'node') {
        c.nodes = c.nodes.filter((n) => n.id !== hit.id);
        c.edges = c.edges.filter((e) => e.from !== hit.id && e.to !== hit.id);
        for (const b of c.buildings)
          b.entrances = (b.entrances ?? []).filter((id) => id !== hit.id);
      }
      if (hit.kind === 'building') {
        c.buildings = c.buildings.filter((b) => b.id !== hit.id);
        // Its entrances stay as plain junctions so the paths remain connected.
        for (const node of c.nodes) {
          if (node.building !== hit.id) continue;
          node.type = 'junction';
          delete node.building;
        }
      }
      if (hit.kind === 'poi') c.pois = c.pois.filter((p) => p.id !== hit.id);
      if (hit.kind === 'area') c.areas = c.areas.filter((a) => a.id !== hit.id);
      if (hit.kind === 'vertex') {
        const list = hit.owner === 'building' ? c.buildings : c.areas;
        const item = list.find((x) => x.id === hit.id);
        if (item && item.polygon.length > 3) item.polygon.splice(hit.vi, 1);
      }
    });
  }

  function calibrate(point) {
    editor.calibration.push(point);
    renderOverlay();
    if (editor.calibration.length < 2) return;
    const [a, b] = editor.calibration;
    const units = distance({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
    const answer = window.prompt(t('editor.calibratePrompt'));
    editor.calibration = [];
    const meters = parseFloat(answer ?? '');
    if (units > 0 && meters > 0) {
      const value = Math.round((meters / units) * 10000) / 10000;
      commit((c) => {
        c.meta.metersPerUnit = value;
      });
      say(t('editor.calibrated', { value }));
    } else {
      renderOverlay();
    }
  }

  // ---------- Dragging in Move mode ----------

  let dragging = null;

  /** Tells pan/zoom whether a press should pan the map. */
  function shouldStartPan(event) {
    if (event.type === 'dblclick') return editor.mode === 'select';
    if (editor.mode !== 'move') return true;
    const hit = hitTest(event.target);
    return !(hit && ['node', 'vertex', 'poi'].includes(hit.kind));
  }

  svg.addEventListener('pointerdown', (event) => {
    if (editor.mode !== 'move' || event.button !== 0) return;
    const hit = hitTest(event.target);
    if (!hit || !['node', 'vertex', 'poi'].includes(hit.kind)) return;
    dragging = { hit, before: JSON.stringify(campus), moved: false };
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', (event) => {
    if (!panZoom) return;
    const point = worldPoint(event);
    editor.cursor = point;
    coords.textContent = t('editor.coords', { x: point[0], y: point[1] });
    if (dragging) {
      dragging.moved = true;
      moveTarget(dragging.hit, point);
      renderBase();
    } else if (editor.drawing.length > 0 || editor.calibration.length === 1) {
      renderOverlay();
    }
  });

  svg.addEventListener('pointerup', () => {
    if (!dragging) return;
    const { before, moved } = dragging;
    dragging = null;
    if (!moved) return;
    undoStack.push(before);
    redoStack.length = 0;
    afterChange();
  });

  function moveTarget(hit, [x, y]) {
    if (hit.kind === 'node') {
      const node = campus.nodes.find((n) => n.id === hit.id);
      if (node) Object.assign(node, { x, y });
    } else if (hit.kind === 'poi') {
      const poi = campus.pois.find((p) => p.id === hit.id);
      if (poi) Object.assign(poi, { x, y });
    } else if (hit.kind === 'vertex') {
      const list = hit.owner === 'building' ? campus.buildings : campus.areas;
      const item = list.find((i) => i.id === hit.id);
      if (!item) return;
      item.polygon[hit.vi] = [x, y];
      if (hit.owner === 'building') {
        const c = polygonCentroid(item.polygon);
        item.labelPosition = [Math.round(c.x), Math.round(c.y)];
      }
    }
  }

  // ---------- Keyboard ----------

  document.addEventListener('keydown', (event) => {
    if (event.target.closest?.('input, textarea, select')) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === 'escape') {
      editor.connectFrom = null;
      editor.drawing = [];
      editor.calibration = [];
      editor.pendingShape = null;
      select(null);
      return;
    }
    if (key === 'enter' && editor.mode === 'draw') {
      finishDrawing();
      return;
    }
    if ((key === 'delete' || key === 'backspace') && editor.selection) {
      const { kind, id } = editor.selection;
      deleteItem({ kind, id });
      return;
    }
    const tool = TOOLS.find(([, , shortcut]) => shortcut === key);
    if (tool) setMode(tool[0]);
  });

  // ---------- Panel ----------

  const panel = createEditorPanel(panelEl, {
    getCampus: () => campus,
    getEditor: () => editor,
    findSelected,
    commit,
    select,
    setMode,
    notify: say,
    deleteSelected() {
      if (editor.selection) deleteItem({ ...editor.selection });
    },
    createShape,
    cancelShape() {
      editor.pendingShape = null;
      panel.render();
    },
    setNodeType(type) {
      editor.nodeType = type;
    },
    setPoiType(type) {
      editor.poiType = type;
    },
    replaceCampus(next) {
      undoStack.push(JSON.stringify(campus));
      campus = next;
      ensureShape(campus);
      editor.selection = null;
      setupCamera();
      afterChange();
    },
    validate() {
      editor.problems = validateCampus(campus);
      editor.flagged = new Set(editor.problems.flatMap((p) => p.ids));
      renderOverlay();
      panel.render({ keepForm: true });
    },
    focusIds(ids) {
      const points = [];
      for (const id of ids) {
        const node = campus.nodes.find((n) => n.id === id);
        if (node) points.push(node);
        const building = campus.buildings.find((b) => b.id === id);
        if (building) points.push(...building.polygon.map(([x, y]) => ({ x, y })));
      }
      if (points.length) panZoom.flyTo(boundsOf(points), { maxScale: 4 });
    },
    setImage(url, size) {
      editor.imageUrl = url;
      editor.imageSize = size;
      renderBase();
      panel.render({ keepForm: true });
    },
    setImageOpacity(value) {
      editor.imageOpacity = value;
      svg.style.setProperty('--reference-opacity', String(value));
    },
    fitToImage() {
      if (!editor.imageSize) return;
      const { width, height } = editor.imageSize;
      commit((c) => {
        c.meta.viewBox = [0, 0, width, height];
      });
      setupCamera();
    },
    previewInApp() {
      writeStorage(DRAFT_KEY, campus);
      const url = new URL(window.location.href);
      url.searchParams.delete('edit');
      url.searchParams.set('preview', '1');
      window.open(url.toString(), '_blank', 'noopener');
    },
  });

  setupCamera();
  renderAll();
}

/** Makes sure all arrays and meta fields the editor relies on exist. */
function ensureShape(campus) {
  campus.meta = campus.meta ?? {};
  campus.meta.viewBox = Array.isArray(campus.meta.viewBox)
    ? campus.meta.viewBox
    : [0, 0, 1600, 1000];
  campus.meta.metersPerUnit = campus.meta.metersPerUnit ?? 0.5;
  campus.meta.walkingSpeedMetersPerMin = campus.meta.walkingSpeedMetersPerMin ?? 75;
  if (!('backgroundImage' in campus.meta)) campus.meta.backgroundImage = null;
  for (const key of ['buildings', 'nodes', 'edges', 'pois', 'areas']) {
    if (!Array.isArray(campus[key])) campus[key] = [];
  }
}
