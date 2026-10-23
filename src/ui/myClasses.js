/**
 * "My classes" card: the user's own timetable, kept only on this device.
 * Shows the next class with a one-tap route from the current start building
 * (or "Use my location"), the list of classes, and a small form to add one.
 * Room codes are checked with parseRoomCode() while typing.
 */
import { getState, subscribe } from '../state.js';
import { localize, t } from '../i18n/index.js';
import { el } from '../utils/dom.js';
import { buildPrefixTable, parseRoomCode } from '../utils/roomCode.js';
import {
  loadClasses,
  nextClass,
  saveClasses,
  sortClasses,
  validateClass,
} from '../utils/classes.js';
import { createIcon } from './icons.js';
import { showToast } from './toast.js';

/** Days in form order (Monday first); values match Date#getDay. */
const DAYS = [1, 2, 3, 4, 5, 6, 0];

/**
 * @param {Object} options
 * @param {HTMLElement} options.container
 * @param {object} options.campus
 * @param {(buildingId: string, room: object) => void} options.routeTo Route to a class's building.
 * @param {(buildingId: string, room: object) => void} options.openRoom Open the building at that room.
 */
export function createMyClasses({ container, campus, routeTo, openRoom }) {
  const buildingsById = new Map(campus.buildings.map((b) => [b.id, b]));
  const prefixes = buildPrefixTable(campus.buildings);
  let classes = loadClasses();
  let formOpen = false;
  let open = classes.length > 0;

  const parse = (room) => parseRoomCode(room, prefixes);

  function placeText(item) {
    const parsed = parse(item.room);
    const building = parsed && buildingsById.get(parsed.buildingId);
    return building
      ? `${item.room} · ${localize(building.name)}${parsed.floorLabel ? ` · ${parsed.floorLabel}` : ''}`
      : item.room;
  }

  function when(item) {
    return `${t(`classes.day.${item.day}`)} ${item.start}–${item.end}`;
  }

  function persist(next) {
    classes = sortClasses(next);
    if (!saveClasses(classes)) showToast(t('classes.notSaved'), { type: 'error' });
    render();
  }

  function nextCard() {
    const next = nextClass(classes);
    if (!next) return null;
    const { item } = next;
    const parsed = parse(item.room);
    const status = next.ongoing
      ? t('classes.now')
      : next.daysAhead === 0
        ? t('classes.inMinutes', {
            time:
              next.minutesUntil < 60
                ? t('classes.minutes', { n: next.minutesUntil })
                : t('classes.hours', { n: Math.round(next.minutesUntil / 6) / 10 }),
          })
        : t(`classes.day.${item.day}`);
    return el(
      'div',
      { class: 'next-class' },
      el(
        'div',
        { class: 'item-body' },
        el('span', { class: 'next-class-label', text: `${t('classes.next')} · ${status}` }),
        el('span', { class: 'item-title', text: item.name }),
        el('span', { class: 'item-meta', text: `${item.start}–${item.end} · ${placeText(item)}` }),
      ),
      parsed
        ? el(
            'button',
            {
              class: 'btn btn-primary btn-sm',
              type: 'button',
              onClick: () => routeTo(parsed.buildingId, parsed),
            },
            createIcon('walk', { size: 16 }),
            getState().from ? t('classes.route') : t('classes.show'),
          )
        : null,
    );
  }

  function list() {
    if (classes.length === 0) {
      return el('p', { class: 'muted', text: t('classes.empty') });
    }
    return el(
      'ul',
      { class: 'class-list' },
      classes.map((item) => {
        const parsed = parse(item.room);
        return el(
          'li',
          { class: 'class-item' },
          el(
            'button',
            {
              class: 'class-open',
              type: 'button',
              disabled: parsed ? null : '',
              onClick: () => parsed && openRoom(parsed.buildingId, parsed),
            },
            el('span', { class: 'item-title', text: item.name }),
            el('span', { class: 'item-meta', text: `${when(item)} · ${placeText(item)}` }),
            parsed
              ? null
              : el('span', { class: 'item-meta is-warning', text: t('classes.unknownRoom') }),
          ),
          el(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              'aria-label': t('classes.remove', { name: item.name }),
              title: t('classes.remove', { name: item.name }),
              onClick: () => persist(classes.filter((c) => c.id !== item.id)),
            },
            createIcon('trash', { size: 16 }),
          ),
        );
      }),
    );
  }

  function form() {
    const roomHint = el('span', { class: 'field-hint', 'aria-live': 'polite' });
    const errors = el('p', { class: 'field-error', role: 'alert', hidden: '' });
    const field = (label, input) =>
      el('label', { class: 'field' }, el('span', { text: label }), input);
    const name = el('input', { class: 'input', name: 'name', autocomplete: 'off', required: '' });
    const room = el('input', {
      class: 'input',
      name: 'room',
      autocomplete: 'off',
      placeholder: t('classes.roomPlaceholder'),
      required: '',
      onInput: () => {
        const parsed = parse(room.value);
        const building = parsed && buildingsById.get(parsed.buildingId);
        roomHint.textContent = !room.value.trim()
          ? t('classes.roomHelp')
          : building
            ? `✓ ${localize(building.name)}${parsed.floorLabel ? ` · ${parsed.floorLabel}` : ''}`
            : t('classes.unknownRoom');
        roomHint.classList.toggle('is-warning', Boolean(room.value.trim() && !building));
      },
    });
    roomHint.textContent = t('classes.roomHelp');
    const day = el(
      'select',
      { class: 'input', name: 'day' },
      DAYS.map((d) => el('option', { value: String(d), text: t(`classes.day.${d}`) })),
    );
    const start = el('input', { class: 'input', type: 'time', name: 'start', value: '09:00' });
    const end = el('input', { class: 'input', type: 'time', name: 'end', value: '10:15' });

    return el(
      'form',
      {
        class: 'class-form',
        onSubmit: (event) => {
          event.preventDefault();
          const item = {
            id: `c${Date.now().toString(36)}`,
            name: name.value.trim(),
            room: room.value.trim(),
            day: Number(day.value),
            start: start.value,
            end: end.value,
          };
          const problems = validateClass(item);
          if (problems.length) {
            errors.textContent = problems.map((key) => t(key)).join(' ');
            errors.hidden = false;
            return;
          }
          formOpen = false;
          persist([...classes, item]);
          showToast(t('classes.added', { name: item.name }), { type: 'success' });
        },
      },
      field(t('classes.name'), name),
      el('label', { class: 'field' }, el('span', { text: t('classes.room') }), room, roomHint),
      el(
        'div',
        { class: 'field-row' },
        field(t('classes.dayLabel'), day),
        field(t('classes.start'), start),
        field(t('classes.end'), end),
      ),
      errors,
      el(
        'div',
        { class: 'form-actions' },
        el(
          'button',
          {
            class: 'btn btn-secondary btn-sm',
            type: 'button',
            onClick: () => {
              formOpen = false;
              render();
            },
          },
          t('classes.cancel'),
        ),
        el('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, t('classes.save')),
      ),
      el('p', { class: 'field-hint', text: t('classes.privacy') }),
    );
  }

  function render() {
    const details = el(
      'details',
      {
        class: 'my-classes',
        open: open ? '' : null,
        onToggle: (event) => {
          open = event.currentTarget.open;
        },
      },
      el(
        'summary',
        { class: 'my-classes-summary' },
        createIcon('book', { size: 18 }),
        el('span', { text: t('classes.title') }),
        classes.length
          ? el('span', { class: 'building-list-count', text: String(classes.length) })
          : null,
      ),
      nextCard(),
      list(),
      formOpen
        ? form()
        : el(
            'button',
            {
              class: 'btn btn-ghost btn-sm class-add',
              type: 'button',
              onClick: () => {
                formOpen = true;
                open = true;
                render();
                container.querySelector('.class-form input')?.focus();
              },
            },
            createIcon('plus', { size: 16 }),
            t('classes.add'),
          ),
    );
    container.replaceChildren(details);
  }

  subscribe((state, changed) => {
    if (changed.includes('lang') || changed.includes('from')) render();
  });
  // Keep "in 20 min" current while the page stays open.
  setInterval(() => {
    if (classes.length && !formOpen) render();
  }, 60_000);

  render();
}
