import type { TFunction } from '@bestbpmn/i18n';
import {
  isEmptyCatalog,
  parseCatalog,
  serializeCatalog,
  stateKey,
  type CatalogError,
  type CatalogFile,
  type CatalogTable,
} from '@bestbpmn/model';

/** Eine Zeile im Editor. `source` hält Felder, die der Editor nicht zeigt (z. B. Farbe), damit sie erhalten bleiben. */
interface Row {
  id: string;
  name: string;
  de: string;
  kind: string;
  source: Record<string, unknown>;
}

type Rows = Record<CatalogTable, Row[]>;

const TABLES: CatalogTable[] = ['states', 'roles', 'services'];
const COLUMNS: Record<CatalogTable, (keyof Row)[]> = {
  states: ['id', 'name', 'de'],
  roles: ['id', 'name', 'de', 'kind'],
  services: ['id', 'name', 'kind'],
};
const KINDS: Partial<Record<CatalogTable, string[]>> = {
  roles: ['group', 'role'],
  services: ['business', 'technical'],
};

export interface CatalogEditorOptions {
  t: TFunction;
  /** Der Katalog, der gerade gilt. */
  catalog: CatalogFile;
  /** Beispielkatalog zum Ausprobieren. */
  example: CatalogFile;
  /** Wird mit dem bereinigten Katalog aufgerufen, wenn er gelten soll. */
  onApply: (catalog: CatalogFile) => void;
}

function toRows(catalog: CatalogFile): Rows {
  const rows = (table: CatalogTable): Row[] =>
    ((catalog[table] ?? []) as any[]).map((entry) => ({
      id: entry.id ?? '',
      name: entry.name ?? '',
      de: entry.translations?.de ?? '',
      kind: entry.kind ?? KINDS[table]?.[0] ?? '',
      source: entry,
    }));
  return { states: rows('states'), roles: rows('roles'), services: rows('services') };
}

/** Macht aus den Zeilen wieder einen Katalog. Leere Zeilen entfallen, eine fehlende ID entsteht aus dem Namen. */
export function rowsToCatalog(rows: Rows): { catalog: CatalogFile; errors: CatalogError[] } {
  const file: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    file[table] = rows[table]
      .filter((row) => row.name.trim() || row.id.trim())
      .map((row) => {
        const entry: Record<string, unknown> = { ...row.source, id: row.id.trim() || stateKey(row.name), name: row.name.trim() };
        if (COLUMNS[table].includes('de')) {
          const translations = { ...(row.source.translations as Record<string, string> | undefined) };
          if (row.de.trim()) {
            translations.de = row.de.trim();
          } else {
            delete translations.de;
          }
          entry.translations = Object.keys(translations).length ? translations : undefined;
        }
        if (COLUMNS[table].includes('kind')) {
          entry.kind = row.kind;
        }
        return entry;
      });
  }
  return parseCatalog(JSON.stringify(file));
}

/**
 * Editor für den eigenen Katalog: drei Tabellen (Status, Rollen und Gruppen, IT-Services) zum Bearbeiten,
 * dazu Importieren, Exportieren, Beispielkatalog und Leeren. Änderungen gelten erst nach „Übernehmen“.
 */
export function renderCatalogEditor(container: HTMLElement, options: CatalogEditorOptions): void {
  const { t, example, onApply } = options;
  let current = options.catalog;
  let rows = toRows(current);
  let messages: string[] = [];

  const errorText = (e: CatalogError) =>
    t(`catalog.errors.${e.code}`, { ...e.params, table: e.params.table ? t(`catalog.tables.${e.params.table}`) : '' });

  const apply = (catalog: CatalogFile, errors: CatalogError[] = []) => {
    messages = [...errors.map(errorText), t('catalog.applied')];
    onApply(catalog);
    current = catalog;
    rows = toRows(catalog);
    render();
  };

  const button = (text: string, action: () => void, className = '') => {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = text;
    el.className = className;
    el.addEventListener('click', action);
    return el;
  };

  function renderTable(table: CatalogTable): HTMLElement {
    const section = document.createElement('section');
    section.className = 'catalog-table';
    section.dataset.table = table;
    const heading = document.createElement('h3');
    heading.textContent = t(`catalog.tables.${table}`);
    const grid = document.createElement('table');
    const head = grid.createTHead().insertRow();
    for (const column of COLUMNS[table]) {
      const th = document.createElement('th');
      th.textContent = t(`catalog.columns.${column}`);
      if (column === 'id') th.title = t('catalog.idHint');
      head.append(th);
    }
    head.append(document.createElement('th'));
    const body = grid.createTBody();
    rows[table].forEach((row, index) => {
      const tr = body.insertRow();
      for (const column of COLUMNS[table]) {
        const cell = tr.insertCell();
        const kinds = column === 'kind' ? KINDS[table] : undefined;
        if (kinds) {
          const select = document.createElement('select');
          for (const kind of kinds) {
            const label = table === 'roles' ? t(`lane.kind.${kind}`) : t(`catalog.serviceKind.${kind}`);
            select.add(new Option(label, kind, false, row.kind === kind));
          }
          select.dataset.column = column;
          select.addEventListener('change', () => {
            row.kind = select.value;
          });
          cell.append(select);
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = row[column] as string;
          input.dataset.column = column;
          input.setAttribute('aria-label', t(`catalog.columns.${column}`));
          if (column === 'id') input.placeholder = row.name ? stateKey(row.name) : '';
          input.addEventListener('input', () => {
            (row as any)[column] = input.value;
          });
          cell.append(input);
        }
      }
      const remove = button('×', () => {
        rows[table].splice(index, 1);
        render();
      });
      remove.title = t('catalog.removeRow');
      remove.setAttribute('aria-label', t('catalog.removeRow'));
      tr.insertCell().append(remove);
    });
    const add = button(t('catalog.addRow'), () => {
      rows[table].push({ id: '', name: '', de: '', kind: KINDS[table]?.[0] ?? '', source: {} });
      render();
      container.querySelector<HTMLInputElement>(`[data-table="${table}"] tbody tr:last-child input[data-column="name"]`)?.focus();
    }, 'add-row');
    section.append(heading, grid, add);
    return section;
  }

  function render() {
    container.innerHTML = '';
    const heading = document.createElement('h2');
    heading.textContent = t('catalog.title');
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = t('catalog.hint');

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) {
        const { catalog, errors } = parseCatalog(await file.text());
        if (errors.some((e) => e.code === 'invalid-json' || e.code === 'not-an-object')) {
          messages = errors.map(errorText);
          render();
        } else {
          apply(catalog, errors);
        }
      }
    });
    const actions = document.createElement('div');
    actions.className = 'settings-actions';
    actions.append(
      button(t('catalog.import'), () => fileInput.click(), 'import'),
      button(t('catalog.export'), () => {
        const { catalog } = rowsToCatalog(rows);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([serializeCatalog(catalog)], { type: 'application/json' }));
        link.download = 'bestbpmn-katalog.json';
        link.click();
        URL.revokeObjectURL(link.href);
      }, 'export'),
      button(t('catalog.example'), () => apply(example), 'example'),
      button(t('catalog.clear'), () => apply({}), 'clear'),
      fileInput,
    );

    const state = document.createElement('p');
    state.className = 'settings-hint';
    state.textContent = isEmptyCatalog(current) ? t('catalog.empty') : '';

    const footer = document.createElement('div');
    footer.className = 'settings-actions';
    footer.append(
      button(t('catalog.apply'), () => {
        const { catalog, errors } = rowsToCatalog(rows);
        apply(catalog, errors);
      }, 'apply primary'),
    );
    const applyHint = document.createElement('p');
    applyHint.className = 'settings-hint';
    applyHint.textContent = t('catalog.applyHint');

    const log = document.createElement('div');
    log.className = 'catalog-messages';
    log.setAttribute('aria-live', 'polite');
    for (const message of messages) {
      const p = document.createElement('p');
      p.textContent = message;
      log.append(p);
    }
    container.append(heading, hint, actions, state, ...TABLES.map(renderTable), footer, applyHint, log);
  }

  render();
}
