/**
 * Side panel of the Map Editor: file actions (import, export, validate,
 * preview), the reference image controls, scale settings, tool options, the
 * "new shape" form, the properties form of the selected item, and the
 * validation results.
 *
 * Every edit goes through `api.commit`, so it can be undone. Sections are
 * rebuilt after each change, except a section that currently holds keyboard
 * focus, so typing and tabbing between fields is never interrupted.
 */
import { el } from '../utils/dom.js';
import { t } from '../i18n/index.js';
import { createIcon } from '../ui/icons.js';
import { CATEGORIES } from '../map/widgets.js';

const NODE_TYPES = ['junction', 'entrance', 'gate'];
const POI_TYPES = [
  'bus_stop',
  'cafe',
  'convenience_store',
  'restaurant',
  'atm',
  'parking',
  'restroom',
  'printer',
  'gate',
];
const AREA_TYPES = ['green', 'plaza', 'water', 'ground'];

/**
 * @param {HTMLElement} container
 * @param {Object} api Callbacks provided by mapEditor.js.
 * @returns {{ render: (options?: {keepForm?: boolean}) => void }}
 */
export function createEditorPanel(container, api) {
  const sections = {
    header: el('header', { class: 'ep-header' }),
    file: el('section', { class: 'ep-section' }),
    image: el('section', { class: 'ep-section' }),
    scale: el('section', { class: 'ep-section' }),
    tool: el('section', { class: 'ep-section' }),
    shape: el('section', { class: 'ep-section ep-highlight' }),
    selection: el('section', { class: 'ep-section' }),
    problems: el('section', { class: 'ep-section' }),
  };
  container.append(...Object.values(sections));
  let selectionKey = null;

  // ---------- Small form helpers ----------

  function heading(text) {
    return el('h2', { class: 'ep-title', text });
  }

  function button(label, icon, onClick, extra = {}) {
    return el(
      'button',
      { class: 'btn btn-secondary btn-sm', type: 'button', onClick, ...extra },
      icon ? createIcon(icon, { size: 16 }) : null,
      label,
    );
  }

  /** A labelled input that calls onChange(value) when the value is committed. */
  function input(label, value, onChange, { type = 'text', step, readOnly = false } = {}) {
    const field = el('input', {
      class: 'ep-input',
      type,
      step,
      value: value ?? '',
      readonly: readOnly,
      onChange: (event) => onChange(event.target.value),
    });
    return el('label', { class: 'ep-field' }, el('span', { text: label }), field);
  }

  function select(label, value, options, onChange) {
    return el(
      'label',
      { class: 'ep-field' },
      el('span', { text: label }),
      el(
        'select',
        { class: 'ep-input', onChange: (event) => onChange(event.target.value) },
        options.map(([optionValue, text]) =>
          el('option', { value: optionValue, selected: optionValue === value, text }),
        ),
      ),
    );
  }

  function checkbox(label, checked, onChange) {
    return el(
      'label',
      { class: 'ep-check' },
      el('input', {
        type: 'checkbox',
        checked,
        onChange: (event) => onChange(event.target.checked),
      }),
      el('span', { text: label }),
    );
  }

  /** A hidden file input opened by a button. */
  function filePicker(label, icon, accept, onFile) {
    const picker = el('input', {
      type: 'file',
      accept,
      hidden: true,
      onChange: (event) => {
        const file = event.target.files?.[0];
        if (file) onFile(file);
        event.target.value = '';
      },
    });
    return el(
      'span',
      {},
      picker,
      button(label, icon, () => picker.click()),
    );
  }

  /** Commits a change made in the properties form (keeps the form in place). */
  function edit(mutate) {
    api.commit(mutate, { keepForm: true });
  }

  // ---------- Sections ----------

  function renderHeader(campus) {
    const back = new URL(window.location.href);
    back.searchParams.delete('edit');
    sections.header.replaceChildren(
      el(
        'div',
        { class: 'ep-header-row' },
        el('h1', { class: 'ep-app-title' }, createIcon('edit', { size: 20 }), t('editor.title')),
        el(
          'a',
          { class: 'btn btn-ghost btn-sm', href: back.toString() },
          createIcon('back', { size: 16 }),
          t('editor.back'),
        ),
      ),
      el('p', {
        class: 'ep-muted',
        text: t('editor.stats', {
          buildings: campus.buildings.length,
          nodes: campus.nodes.length,
          edges: campus.edges.length,
          pois: campus.pois.length,
        }),
      }),
    );
  }

  function renderFile(campus) {
    sections.file.replaceChildren(
      heading(t('editor.file')),
      el(
        'div',
        { class: 'ep-buttons' },
        filePicker(t('editor.import'), 'upload', 'application/json,.json', importJson),
        button(t('editor.export'), 'download', () => exportJson(campus)),
        button(t('editor.validate'), 'check', api.validate),
        button(t('editor.preview'), 'link', api.previewInApp),
        button(t('editor.newCampus'), 'trash', () => {
          if (!window.confirm(t('editor.confirmNew'))) return;
          api.commit((c) => {
            c.buildings = [];
            c.nodes = [];
            c.edges = [];
            c.pois = [];
            c.areas = [];
          });
        }),
      ),
      checkbox(t('editor.placeholderFlag'), campus._placeholder === true, (checked) =>
        edit((c) => {
          c._placeholder = checked;
        }),
      ),
    );
  }

  function renderImage(campus, editor) {
    const name = campus.meta.backgroundImage;
    sections.image.replaceChildren(
      heading(t('editor.image')),
      el('p', {
        class: 'ep-muted',
        text: editor.imageUrl || name ? (name ?? '') : t('editor.noImage'),
      }),
      el(
        'div',
        { class: 'ep-buttons' },
        filePicker(t('editor.loadImage'), 'image', 'image/*', loadImage),
        button(t('editor.fitToImage'), 'reset', api.fitToImage, { disabled: !editor.imageSize }),
      ),
      el(
        'label',
        { class: 'ep-field' },
        el('span', { text: `${t('editor.opacity')}: ${Math.round(editor.imageOpacity * 100)}%` }),
        el('input', {
          type: 'range',
          min: 0,
          max: 1,
          step: 0.05,
          value: editor.imageOpacity,
          onInput: (event) => {
            api.setImageOpacity(Number(event.target.value));
            event.target.previousElementSibling.textContent = `${t('editor.opacity')}: ${Math.round(event.target.value * 100)}%`;
          },
        }),
      ),
      el('p', { class: 'ep-note', text: t('editor.imageNote') }),
    );
  }

  function renderScale(campus) {
    sections.scale.replaceChildren(
      heading(t('editor.scale')),
      el(
        'div',
        { class: 'ep-grid' },
        input(
          t('editor.metersPerUnit'),
          campus.meta.metersPerUnit,
          (value) => {
            const number = parseFloat(value);
            if (number > 0) edit((c) => (c.meta.metersPerUnit = number));
          },
          { type: 'number', step: 'any' },
        ),
        input(
          t('editor.walkingSpeed'),
          campus.meta.walkingSpeedMetersPerMin,
          (value) => {
            const number = parseFloat(value);
            if (number > 0) edit((c) => (c.meta.walkingSpeedMetersPerMin = number));
          },
          { type: 'number', step: 'any' },
        ),
      ),
      button(t('editor.calibrate'), 'ruler', () => api.setMode('calibrate')),
    );
  }

  function renderTool(editor) {
    const options = [];
    if (editor.mode === 'add-node') {
      options.push(
        select(
          t('editor.nodeType'),
          editor.nodeType,
          NODE_TYPES.map((type) => [type, t(`editor.type.${type}`)]),
          api.setNodeType,
        ),
      );
    }
    if (editor.mode === 'add-poi') {
      options.push(
        select(
          t('editor.poiType'),
          editor.poiType,
          POI_TYPES.map((type) => [type, t(`facility.${type}`)]),
          api.setPoiType,
        ),
      );
    }
    sections.tool.replaceChildren(
      heading(`${t('editor.tools')}: ${t(`editor.mode.${editor.mode}`)}`),
      el('p', { class: 'ep-muted', text: t(`editor.help.${editor.mode}`) }),
      ...options,
      el('p', { class: 'ep-note', text: t('editor.shortcuts') }),
    );
  }

  function renderShape(editor) {
    sections.shape.hidden = !editor.pendingShape;
    if (!editor.pendingShape) {
      sections.shape.replaceChildren();
      return;
    }
    const values = {
      kind: 'building',
      id: '',
      number: '',
      nameEn: '',
      nameKo: '',
      category: 'academic',
      areaType: 'green',
    };
    const set = (key) => (value) => (values[key] = value);
    const kindSelect = select(
      t('editor.shapeKind'),
      values.kind,
      [
        ['building', t('editor.kind.building')],
        ['area', t('editor.kind.area')],
      ],
      (value) => {
        values.kind = value;
        buildingFields.hidden = value !== 'building';
        areaFields.hidden = value !== 'area';
      },
    );
    const buildingFields = el(
      'div',
      { class: 'ep-grid' },
      input(t('editor.field.number'), '', set('number')),
      select(
        t('editor.field.category'),
        values.category,
        CATEGORIES.map((c) => [c, t(`category.${c}`)]),
        set('category'),
      ),
    );
    const areaFields = el(
      'div',
      { hidden: true },
      select(
        t('editor.field.type'),
        values.areaType,
        AREA_TYPES.map((a) => [a, t(`editor.area.${a}`)]),
        set('areaType'),
      ),
    );
    const idInput = input(t('editor.field.id'), '', set('id'));
    sections.shape.replaceChildren(
      heading(t('editor.newShape')),
      kindSelect,
      idInput,
      input(t('editor.field.nameEn'), '', set('nameEn')),
      input(t('editor.field.nameKo'), '', set('nameKo')),
      buildingFields,
      areaFields,
      el(
        'div',
        { class: 'ep-buttons' },
        el(
          'button',
          {
            class: 'btn btn-primary btn-sm',
            type: 'button',
            onClick: () => {
              // Read the latest typed values even if "change" hasn't fired yet.
              for (const field of sections.shape.querySelectorAll('input'))
                field.dispatchEvent(new Event('change'));
              api.createShape(values);
            },
          },
          t('editor.create'),
        ),
        button(t('editor.cancel'), null, api.cancelShape),
      ),
    );
    idInput.querySelector('input').focus();
  }

  function renderSelection(campus, editor) {
    const item = api.findSelected();
    const sel = editor.selection;
    const content = [
      heading(
        sel ? `${t('editor.selection')}: ${t(`editor.kind.${sel.kind}`)}` : t('editor.selection'),
      ),
    ];
    if (!item) {
      content.push(el('p', { class: 'ep-muted', text: t('editor.nothingSelected') }));
      sections.selection.replaceChildren(...content);
      return;
    }

    const names = (target) => [
      input(t('editor.field.nameEn'), target.name?.en, (value) =>
        edit(() => setName(api.findSelected(), 'name', 'en', value)),
      ),
      input(t('editor.field.nameKo'), target.name?.ko, (value) =>
        edit(() => setName(api.findSelected(), 'name', 'ko', value)),
      ),
    ];
    const idField = input(t('editor.field.id'), item.id, (value) => renameSelected(value.trim()));
    const position = (target) =>
      el(
        'div',
        { class: 'ep-grid' },
        input('X', target.x, (value) => edit(() => (api.findSelected().x = Number(value))), {
          type: 'number',
        }),
        input('Y', target.y, (value) => edit(() => (api.findSelected().y = Number(value))), {
          type: 'number',
        }),
      );

    if (sel.kind === 'building') {
      content.push(
        idField,
        el(
          'div',
          { class: 'ep-grid' },
          input(t('editor.field.number'), item.number, (value) =>
            edit(() => (api.findSelected().number = value)),
          ),
          input(
            t('editor.field.floors'),
            item.floors,
            (value) => edit(() => (api.findSelected().floors = Number(value) || 1)),
            { type: 'number' },
          ),
        ),
        ...names(item),
        input(t('editor.field.shortEn'), item.shortName?.en, (value) =>
          edit(() => setName(api.findSelected(), 'shortName', 'en', value)),
        ),
        input(t('editor.field.shortKo'), item.shortName?.ko, (value) =>
          edit(() => setName(api.findSelected(), 'shortName', 'ko', value)),
        ),
        select(
          t('editor.field.category'),
          item.category,
          CATEGORIES.map((c) => [c, t(`category.${c}`)]),
          (value) => edit(() => (api.findSelected().category = value)),
        ),
        el(
          'div',
          { class: 'ep-grid' },
          input(
            t('editor.field.labelX'),
            item.labelPosition?.[0],
            (value) => edit(() => setLabel(0, value)),
            { type: 'number' },
          ),
          input(
            t('editor.field.labelY'),
            item.labelPosition?.[1],
            (value) => edit(() => setLabel(1, value)),
            { type: 'number' },
          ),
        ),
        el(
          'p',
          { class: 'ep-muted' },
          `${t('editor.field.entrances')}: ${(item.entrances ?? []).join(', ') || t('editor.field.none')}`,
        ),
      );
    } else if (sel.kind === 'node') {
      content.push(
        idField,
        select(
          t('editor.field.type'),
          item.type,
          NODE_TYPES.map((type) => [type, t(`editor.type.${type}`)]),
          (value) =>
            api.commit((c) => setNodeType(c, api.findSelected(), value), { keepForm: false }),
        ),
      );
      if (item.type === 'entrance') {
        content.push(
          select(
            t('editor.field.building'),
            item.building ?? '',
            [
              ['', t('editor.field.none')],
              ...campus.buildings.map((b) => [b.id, `${b.number ?? ''} ${b.name?.en ?? b.id}`]),
            ],
            (value) => edit((c) => setEntranceBuilding(c, api.findSelected(), value)),
          ),
        );
      } else {
        content.push(...names(item));
      }
      content.push(position(item));
    } else if (sel.kind === 'edge') {
      content.push(
        el('p', {
          class: 'ep-muted',
          text: `${t('editor.field.from')}: ${item.from} · ${t('editor.field.to')}: ${item.to}`,
        }),
        input(
          t('editor.field.distance'),
          item.distance ?? '',
          (value) =>
            edit(() => {
              const number = parseFloat(value);
              api.findSelected().distance = number >= 0 ? number : null;
            }),
          { type: 'number', step: 'any' },
        ),
        checkbox(t('editor.field.stairs'), Boolean(item.stairs), (checked) =>
          edit(() => (api.findSelected().stairs = checked)),
        ),
        checkbox(t('editor.field.covered'), Boolean(item.covered), (checked) =>
          edit(() => (api.findSelected().covered = checked)),
        ),
      );
    } else if (sel.kind === 'poi') {
      content.push(
        idField,
        select(
          t('editor.field.type'),
          item.type,
          POI_TYPES.map((type) => [type, t(`facility.${type}`)]),
          (value) => edit(() => (api.findSelected().type = value)),
        ),
        ...names(item),
        position(item),
      );
    } else if (sel.kind === 'area') {
      content.push(
        idField,
        select(
          t('editor.field.type'),
          item.type,
          AREA_TYPES.map((a) => [a, t(`editor.area.${a}`)]),
          (value) => edit(() => (api.findSelected().type = value)),
        ),
        ...names(item),
      );
    }

    content.push(
      el(
        'button',
        {
          class: 'btn btn-secondary btn-sm ep-danger',
          type: 'button',
          onClick: () => api.deleteSelected(),
        },
        createIcon('trash', { size: 16 }),
        t('editor.delete'),
      ),
    );
    sections.selection.replaceChildren(...content);

    function setLabel(index, value) {
      const building = api.findSelected();
      const label = building.labelPosition ? [...building.labelPosition] : [0, 0];
      label[index] = Number(value);
      building.labelPosition = label;
    }
  }

  function renderProblems(editor) {
    const content = [heading(t('editor.problems'))];
    if (editor.problems === null) {
      content.push(el('p', { class: 'ep-muted', text: t('editor.notValidated') }));
    } else if (editor.problems.length === 0) {
      content.push(
        el('p', { class: 'ep-success' }, createIcon('check', { size: 16 }), t('editor.noProblems')),
      );
    } else {
      content.push(
        el(
          'ul',
          { class: 'ep-problems' },
          editor.problems.map((problem) =>
            el(
              'li',
              {},
              el(
                'button',
                {
                  class: `ep-problem is-${problem.level}`,
                  type: 'button',
                  onClick: () => api.focusIds(problem.ids),
                },
                createIcon(problem.level === 'error' ? 'warning' : 'info', { size: 16 }),
                el('span', { text: problem.message }),
              ),
            ),
          ),
        ),
      );
    }
    sections.problems.replaceChildren(...content);
  }

  // ---------- Actions ----------

  function renameSelected(newId) {
    const sel = api.getEditor().selection;
    const campus = api.getCampus();
    if (!newId || newId === sel.id) return;
    const taken = new Set([
      ...campus.nodes.map((n) => n.id),
      ...campus.buildings.map((b) => b.id),
      ...campus.pois.map((p) => p.id),
      ...campus.areas.map((a) => a.id),
    ]);
    if (taken.has(newId)) {
      api.notify(t('editor.idTaken', { id: newId }));
      render();
      return;
    }
    const oldId = sel.id;
    api.commit((c) => {
      if (sel.kind === 'node') {
        c.nodes.find((n) => n.id === oldId).id = newId;
        for (const e of c.edges) {
          if (e.from === oldId) e.from = newId;
          if (e.to === oldId) e.to = newId;
        }
        for (const b of c.buildings)
          b.entrances = (b.entrances ?? []).map((id) => (id === oldId ? newId : id));
      } else if (sel.kind === 'building') {
        c.buildings.find((b) => b.id === oldId).id = newId;
        for (const n of c.nodes) if (n.building === oldId) n.building = newId;
      } else {
        const list = sel.kind === 'poi' ? c.pois : c.areas;
        list.find((x) => x.id === oldId).id = newId;
      }
    });
    api.select({ kind: sel.kind, id: newId });
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || typeof data !== 'object' || !data.meta || !Array.isArray(data.nodes)) {
          throw new Error('missing "meta" or "nodes"');
        }
        api.replaceCampus(data);
        api.notify(t('editor.imported'));
      } catch (error) {
        api.notify(t('editor.importFailed', { error: error.message }));
      }
    };
    reader.readAsText(file);
  }

  function exportJson(campus) {
    // Areas are optional: drop the key when empty to keep the file tidy.
    const data = { ...campus };
    if (Array.isArray(data.areas) && data.areas.length === 0) delete data.areas;
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: 'campus.json' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    api.notify(t('editor.exported'));
  }

  function loadImage(file) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      api.commit(
        (c) => {
          // Remember the file name; the app looks for it in /public.
          c.meta.backgroundImage = file.name;
        },
        { keepForm: true },
      );
      api.setImage(url, { width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = url;
  }

  // ---------- Render ----------

  function render({ keepForm = false } = {}) {
    const campus = api.getCampus();
    const editor = api.getEditor();
    // Leave alone a section the user is typing in.
    const busy = (section) =>
      keepForm &&
      section.contains(document.activeElement) &&
      document.activeElement !== document.body;

    renderHeader(campus);
    if (!busy(sections.file)) renderFile(campus);
    if (!busy(sections.image)) renderImage(campus, editor);
    if (!busy(sections.scale)) renderScale(campus);
    renderTool(editor);
    // The new-shape form is built once per drawn shape, so typed values survive re-renders.
    if (!editor.pendingShape || sections.shape.childElementCount === 0) renderShape(editor);

    // Edits made in the properties form keep the form as it is.
    const key = editor.selection ? `${editor.selection.kind}:${editor.selection.id}` : '';
    const sameForm = keepForm && key === selectionKey;
    if (!sameForm && !busy(sections.selection)) renderSelection(campus, editor);
    selectionKey = key;
    renderProblems(editor);
  }

  return { render };
}

/** Sets one language of a bilingual field, removing the field when both are empty. */
function setName(target, field, lang, value) {
  const current = { en: '', ko: '', ...(target[field] ?? {}) };
  current[lang] = value.trim();
  if (!current.en && !current.ko) delete target[field];
  else target[field] = current;
}

/** Changes a node's type, keeping building entrance lists consistent. */
function setNodeType(campus, node, type) {
  if (node.type === 'entrance' && type !== 'entrance') {
    setEntranceBuilding(campus, node, '');
  }
  node.type = type;
}

/** Moves an entrance node to another building (or none). */
function setEntranceBuilding(campus, node, buildingId) {
  for (const b of campus.buildings)
    b.entrances = (b.entrances ?? []).filter((id) => id !== node.id);
  if (buildingId) {
    node.building = buildingId;
    const building = campus.buildings.find((b) => b.id === buildingId);
    building.entrances = [...(building.entrances ?? []), node.id];
  } else {
    delete node.building;
  }
}
