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
  texts: { placeholder: string; noResults: string; remove: (label: string) => string };
  onChange: (values: string[]) => void;
}

/**
 * Suchfeld wie in Jira: Tippen zeigt passende Einträge, ein gewählter Eintrag steht als Kästchen
 * mit × im Feld. Bei Mehrfachauswahl sucht man daneben weiter, bei Einfachauswahl ist nur ein Eintrag möglich.
 * Hält auch Hunderte Rollen und Gruppen aus, weil nur die Treffer angezeigt werden.
 */
export function RolePicker(props: RolePickerProps) {
  const { id, label, description, options, values, multiple, disabled, texts, onChange } = props;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const labelOf = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  const needle = query.trim().toLowerCase();
  const results = options
    .filter((o) => !values.includes(o.value))
    .filter((o) => !needle || o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
    .slice(0, MAX_RESULTS);
  const canAdd = !disabled && (multiple || values.length === 0);

  const choose = (option: RoleOption) => {
    onChange(multiple ? [...values, option.value] : [option.value]);
    setQuery('');
    setActive(0);
    setOpen(multiple);
  };
  const remove = (value: string) => {
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
    } else if (event.key === 'Backspace' && !query && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  const inputId = `bio-properties-panel-${id}`;
  return h('div', { class: 'bio-properties-panel-entry praxiq-picker', 'data-entry-id': id }, [
    h('label', { class: 'bio-properties-panel-label', for: inputId }, label),
    h(
      'div',
      {
        class: `praxiq-picker-field${disabled ? ' praxiq-picker-disabled' : ''}`,
        onClick: () => input.current?.focus(),
      },
      [
        ...values.map((value) =>
          h('span', { class: 'praxiq-chip', 'data-value': value }, [
            h('span', { class: 'praxiq-chip-label' }, labelOf(value)),
            disabled
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'praxiq-chip-remove',
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
              class: 'praxiq-picker-input',
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
            { class: 'praxiq-picker-results', role: 'listbox' },
            results.map((option, index) =>
              h(
                'li',
                {
                  role: 'option',
                  class: index === active ? 'praxiq-picker-active' : undefined,
                  'aria-selected': String(index === active),
                  'data-value': option.value,
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
        : h('div', { class: 'praxiq-picker-empty' }, texts.noResults)
      : null,
    description ? h('div', { class: 'bio-properties-panel-description' }, description) : null,
  ]);
}
