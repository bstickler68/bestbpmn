import { h } from '@bpmn-io/properties-panel/preact';
import { useRef, useState } from '@bpmn-io/properties-panel/preact/hooks';
import type { RoleOption } from './roleOptions';

const MAX_RESULTS = 20;

export interface RolePickerProps {
  id: string;
  label: string;
  description?: string;
  /** Alle wählbaren Einträge, z. B. die ganze Rollen- und Gruppentabelle. */
  options: RoleOption[];
  /** Die gewählten Werte in ihrer Reihenfolge. */
  values: string[];
  multiple: boolean;
  disabled?: boolean;
  /** Werte, die angezeigt, aber nicht entfernt werden können, z. B. das D aus der Swimlane. */
  locked?: string[];
  texts: { placeholder: string; noResults: string; remove: (label: string) => string };
  /**
   * Freitext: Einträge, die aus dem getippten Text entstehen, z. B. „Einkauf“ als Gruppe.
   * Sie erscheinen nach den Treffern, sofern es den Wert nicht schon gibt.
   */
  custom?: (query: string) => RoleOption[];
  onChange: (values: string[]) => void;
}

/**
 * Suchfeld wie in Jira: Tippen zeigt passende Einträge, ein gewählter Eintrag steht als Kästchen
 * mit × im Feld. Bei Mehrfachauswahl sucht man daneben weiter, bei Einfachauswahl ist nur ein Eintrag möglich.
 * Hält auch Hunderte Rollen und Gruppen aus, weil nur die Treffer angezeigt werden.
 */
export function RolePicker(props: RolePickerProps) {
  const { id, label, description, options, values, multiple, disabled, locked = [], texts, custom, onChange } = props;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const labelOf = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  const needle = query.trim().toLowerCase();
  const matches = options
    .filter((o) => !values.includes(o.value))
    .filter((o) => !needle || o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
    .slice(0, MAX_RESULTS);
  const extra =
    needle && custom
      ? custom(query.trim()).filter((c) => !values.includes(c.value) && !options.some((o) => o.value === c.value))
      : [];
  const results = [...matches, ...extra];
  const canAdd = !disabled && (multiple || values.length === 0);

  const choose = (option: RoleOption) => {
    onChange(multiple ? [...values, option.value] : [option.value]);
    setQuery('');
    setActive(0);
    setOpen(multiple);
  };
  const remove = (value: string) => {
    if (locked.includes(value)) {
      return;
    }
    onChange(values.filter((v) => v !== value));
    // Bei Einfachauswahl erscheint das Suchfeld erst nach dem Neuzeichnen wieder.
    setTimeout(() => input.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive(Math.min(active + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = results[active];
      if (open && option) {
        choose(option);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && !query && values.length && !locked.includes(values[values.length - 1]!)) {
      onChange(values.slice(0, -1));
    }
  };

  const inputId = `bio-properties-panel-${id}`;
  return h('div', { class: 'bio-properties-panel-entry bestbpmn-picker', 'data-entry-id': id }, [
    h('label', { class: 'bio-properties-panel-label', for: inputId }, label),
    h(
      'div',
      {
        class: `bestbpmn-picker-field${disabled ? ' bestbpmn-picker-disabled' : ''}`,
        onClick: () => input.current?.focus(),
      },
      [
        ...values.map((value) =>
          h('span', { class: `bestbpmn-chip${locked.includes(value) ? ' bestbpmn-chip-locked' : ''}`, 'data-value': value }, [
            h('span', { class: 'bestbpmn-chip-label' }, labelOf(value)),
            disabled || locked.includes(value)
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'bestbpmn-chip-remove',
                    title: texts.remove(labelOf(value)),
                    'aria-label': texts.remove(labelOf(value)),
                    onClick: (event: Event) => {
                      event.stopPropagation();
                      remove(value);
                    },
                  },
                  '×',
                ),
          ]),
        ),
        canAdd
          ? h('input', {
              id: inputId,
              ref: input,
              class: 'bestbpmn-picker-input',
              type: 'text',
              autocomplete: 'off',
              role: 'combobox',
              'aria-expanded': String(open),
              placeholder: values.length ? '' : texts.placeholder,
              value: query,
              onInput: (event: Event) => {
                setQuery((event.target as HTMLInputElement).value);
                setActive(0);
                setOpen(true);
              },
              onFocus: () => setOpen(true),
              onBlur: () => setOpen(false),
              onKeyDown,
            })
          : null,
      ],
    ),
    open && canAdd
      ? results.length
        ? h(
            'ul',
            { class: 'bestbpmn-picker-results', role: 'listbox' },
            results.map((option, index) =>
              h(
                'li',
                {
                  role: 'option',
                  class: index === active ? 'bestbpmn-picker-active' : undefined,
                  'aria-selected': String(index === active),
                  'data-value': option.value,
                  'data-custom': extra.includes(option) ? 'true' : undefined,
                  // mousedown statt click, damit das Feld den Fokus nicht vorher verliert
                  onMouseDown: (event: Event) => {
                    event.preventDefault();
                    choose(option);
                  },
                  onMouseEnter: () => setActive(index),
                },
                option.label,
              ),
            ),
          )
        : h('div', { class: 'bestbpmn-picker-empty' }, texts.noResults)
      : null,
    description ? h('div', { class: 'bio-properties-panel-description' }, description) : null,
  ]);
}
