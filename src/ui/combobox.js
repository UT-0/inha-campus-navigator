/**
 * Reusable, accessible searchable dropdown (ARIA 1.2 "combobox with listbox
 * popup" pattern).
 *
 *  - Type to filter; the list opens automatically.
 *  - Arrow Up / Down move the active option, Home / End jump, Enter selects,
 *    Escape closes (a second Escape clears the text), Tab closes.
 *  - The active option is announced through aria-activedescendant, so focus
 *    stays in the text field the whole time.
 *  - Options can be grouped (each option may have a `group` heading).
 *
 * Used for the From/To building pickers and the global search box.
 */
import { el } from '../utils/dom.js';
import { createIcon } from './icons.js';

let instanceCount = 0;

/**
 * @typedef {Object} ComboOption
 * @property {string} id
 * @property {string} label           Main text (also written into the field when selected).
 * @property {string} [sublabel]      Secondary text.
 * @property {string} [group]         Group heading this option belongs to.
 * @property {string} [number]        Building number badge.
 * @property {string} [category]      Category, used for the colored dot/badge.
 * @property {string} [icon]          Icon name shown instead of a number badge.
 * @property {any} [data]             Anything the caller wants back on select.
 */

/**
 * Creates a combobox.
 * @param {Object} options
 * @param {string} options.label                    Visible label text.
 * @param {string} [options.placeholder]
 * @param {boolean} [options.hideLabel=false]       Keep the label for screen readers only.
 * @param {string} [options.leadingIcon]            Icon inside the field (e.g. "search").
 * @param {(query: string) => ComboOption[]} options.getOptions Options for the current text.
 * @param {(option: ComboOption|null) => void} options.onSelect Called on selection or clear.
 * @param {(query: string) => string} [options.emptyText] Message when nothing matches.
 * @param {boolean} [options.keepTextOnSelect=true] Write the option label into the field.
 * @param {string} [options.clearLabel='Clear'] Accessible name of the clear button.
 * @param {string} [options.className]
 * @returns {{
 *   element: HTMLElement, input: HTMLInputElement,
 *   setSelected: (option: ComboOption|null) => void,
 *   setText: (labels: {label: string, placeholder?: string, clearLabel?: string}) => void,
 *   focus: () => void, close: () => void
 * }}
 */
export function createCombobox({
  label,
  placeholder = '',
  hideLabel = false,
  leadingIcon = null,
  getOptions,
  onSelect,
  emptyText = () => '',
  keepTextOnSelect = true,
  clearLabel = 'Clear',
  className = '',
}) {
  const uid = `combo-${++instanceCount}`;
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;

  /** @type {ComboOption|null} */
  let selected = null;
  /** @type {ComboOption[]} */
  let options = [];
  let activeIndex = -1;
  let open = false;

  const labelEl = el('label', {
    class: hideLabel ? 'sr-only' : 'field-label',
    for: inputId,
    text: label,
  });
  const input = /** @type {HTMLInputElement} */ (
    el('input', {
      id: inputId,
      class: 'combo-input',
      type: 'text',
      role: 'combobox',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder,
      'aria-autocomplete': 'list',
      'aria-expanded': 'false',
      'aria-controls': listId,
    })
  );
  const clearButton = el(
    'button',
    {
      class: 'combo-clear',
      type: 'button',
      tabindex: '-1',
      hidden: true,
      'aria-label': clearLabel,
    },
    createIcon('close', { size: 16 }),
  );
  const list = el('ul', {
    class: 'combo-list',
    id: listId,
    role: 'listbox',
    hidden: true,
    'aria-label': label,
  });
  const field = el(
    'div',
    { class: `combo-field${leadingIcon ? ' has-icon' : ''}` },
    leadingIcon ? createIcon(leadingIcon, { size: 18, className: 'combo-leading' }) : null,
    input,
    clearButton,
  );
  const element = el('div', { class: `combo ${className}` }, labelEl, field, list);

  // ---------- Rendering ----------

  function optionId(index) {
    return `${uid}-opt-${index}`;
  }

  function renderList() {
    list.replaceChildren();
    if (options.length === 0) {
      const message = emptyText(input.value);
      if (message)
        list.append(el('li', { class: 'combo-empty', role: 'presentation', text: message }));
    }
    let currentGroup = null;
    options.forEach((option, index) => {
      if (option.group && option.group !== currentGroup) {
        currentGroup = option.group;
        list.append(el('li', { class: 'combo-group', role: 'presentation', text: option.group }));
      }
      const badge = option.icon
        ? el(
            'span',
            { class: 'combo-icon', 'aria-hidden': 'true' },
            createIcon(option.icon, { size: 16 }),
          )
        : option.number !== undefined
          ? el('span', {
              class: 'combo-number',
              'data-category': option.category ?? 'other',
              'aria-hidden': 'true',
              text: option.number,
            })
          : null;
      list.append(
        el(
          'li',
          {
            id: optionId(index),
            class: `combo-option${index === activeIndex ? ' is-active' : ''}`,
            role: 'option',
            'aria-selected': String(selected?.id === option.id),
            dataset: { index: String(index) },
          },
          badge,
          el(
            'span',
            { class: 'combo-text' },
            el('span', { class: 'combo-label', text: option.label }),
            option.sublabel ? el('span', { class: 'combo-sublabel', text: option.sublabel }) : null,
          ),
          selected?.id === option.id
            ? createIcon('check', { size: 16, className: 'combo-check' })
            : null,
        ),
      );
    });
  }

  function setActive(index) {
    activeIndex = options.length === 0 ? -1 : (index + options.length) % options.length;
    for (const item of list.querySelectorAll('.combo-option')) {
      item.classList.toggle('is-active', Number(item.dataset.index) === activeIndex);
    }
    if (activeIndex >= 0) {
      input.setAttribute('aria-activedescendant', optionId(activeIndex));
      list.querySelector(`#${optionId(activeIndex)}`)?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function openList() {
    // When the field still shows the selected value, show every option.
    const query = selected && input.value === selected.label ? '' : input.value;
    options = getOptions(query);
    const selectedIndex = options.findIndex((o) => o.id === selected?.id);
    activeIndex = query ? (options.length ? 0 : -1) : selectedIndex;
    renderList();
    setActive(activeIndex);
    open = true;
    list.hidden = list.childElementCount === 0;
    input.setAttribute('aria-expanded', String(!list.hidden));
    element.classList.toggle('is-open', !list.hidden);
  }

  function close() {
    open = false;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    element.classList.remove('is-open');
  }

  function updateClear() {
    clearButton.hidden = input.value === '';
  }

  function choose(option) {
    selected = option;
    input.value = keepTextOnSelect && option ? option.label : '';
    updateClear();
    close();
    onSelect(option);
  }

  // ---------- Events ----------

  input.addEventListener('input', () => {
    updateClear();
    openList();
  });

  input.addEventListener('focus', () => {
    if (!open) openList();
  });

  input.addEventListener('click', () => {
    if (!open) openList();
  });

  input.addEventListener('blur', () => {
    // Give option clicks a moment to register before closing.
    setTimeout(() => {
      if (document.activeElement === input) return;
      close();
      // Restore the selected value if the text was edited but nothing chosen.
      // Text that doesn't match a choice would look like a selection, so drop it.
      if (keepTextOnSelect) input.value = selected ? selected.label : '';
      updateClear();
    }, 120);
  });

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList();
        else setActive(activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList();
        else setActive(activeIndex - 1);
        break;
      case 'Home':
        if (open && options.length) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open && options.length) {
          event.preventDefault();
          setActive(options.length - 1);
        }
        break;
      case 'Enter':
        if (open && activeIndex >= 0) {
          event.preventDefault();
          choose(options[activeIndex]);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          close();
        } else if (input.value) {
          event.preventDefault();
          input.value = '';
          updateClear();
          if (selected) choose(null);
        }
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  });

  // mousedown (not click) keeps focus in the input while choosing.
  list.addEventListener('mousedown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const item = event.target.closest('.combo-option');
    if (item) choose(options[Number(item.dataset.index)]);
  });
  list.addEventListener('pointermove', (event) => {
    const item = event.target.closest('.combo-option');
    if (item && Number(item.dataset.index) !== activeIndex) setActive(Number(item.dataset.index));
  });

  clearButton.addEventListener('mousedown', (event) => event.preventDefault());
  clearButton.addEventListener('click', () => {
    input.value = '';
    updateClear();
    if (selected) choose(null);
    input.focus();
    openList();
  });

  return {
    element,
    input,
    /** Sets the selected option without firing onSelect. */
    setSelected(option) {
      selected = option;
      input.value = keepTextOnSelect && option ? option.label : '';
      updateClear();
      if (open) openList();
    },
    /** Updates visible texts (after a language change). */
    setText({ label: newLabel, placeholder: newPlaceholder, clearLabel }) {
      labelEl.textContent = newLabel;
      list.setAttribute('aria-label', newLabel);
      if (newPlaceholder !== undefined) input.placeholder = newPlaceholder;
      if (clearLabel) clearButton.setAttribute('aria-label', clearLabel);
    },
    focus() {
      input.focus();
    },
    close,
  };
}
