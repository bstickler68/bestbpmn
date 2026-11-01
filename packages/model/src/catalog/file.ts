import type { Service } from '../attributes/types.js';
import type { Catalog, RoleDefinition, StatusDefinition } from './types.js';

/**
 * Inhalt einer Katalog-Datei: eine JSON-Datei mit den Tabellen, die der Modellierer kennt.
 * Jede Tabelle ist freiwillig. Fehlt eine, gilt dafür Freitext.
 *
 * ```json
 * { "states": [{ "id": "in_review", "name": "In review", "translations": { "de": "In Prüfung" } }],
 *   "roles": [{ "id": "service_desk", "name": "Service desk", "kind": "group" }],
 *   "services": [{ "id": "svc-mail", "name": "E-Mail", "kind": "business" }] }
 * ```
 */
export interface CatalogFile extends Catalog {
  services?: Service[];
}

/** Fehler beim Lesen einer Katalog-Datei: Schlüssel des Textes und Platzhalter. */
export interface CatalogError {
  code: 'invalid-json' | 'not-an-object' | 'not-a-list' | 'invalid-entry' | 'duplicate-id';
  params: Record<string, string>;
}

export type CatalogTable = 'states' | 'roles' | 'services';

const TABLES: CatalogTable[] = ['states', 'roles', 'services'];

/** Liest eine Katalog-Datei. Ungültige Einträge werden übersprungen und als Fehler gemeldet. */
export function parseCatalog(text: string): { catalog: CatalogFile; errors: CatalogError[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { catalog: {}, errors: [{ code: 'invalid-json', params: { message: (error as Error).message } }] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { catalog: {}, errors: [{ code: 'not-an-object', params: {} }] };
  }
  const errors: CatalogError[] = [];
  const catalog: CatalogFile = {};
  for (const table of TABLES) {
    const raw = (data as Record<string, unknown>)[table];
    if (raw === undefined) {
      continue;
    }
    if (!Array.isArray(raw)) {
      errors.push({ code: 'not-a-list', params: { table } });
      continue;
    }
    const entries: any[] = [];
    raw.forEach((entry, index) => {
      const clean = cleanEntry(table, entry);
      if (!clean) {
        errors.push({ code: 'invalid-entry', params: { table, index: String(index + 1) } });
      } else if (entries.some((e) => e.id === clean.id && (table !== 'roles' || e.kind === (clean as RoleDefinition).kind))) {
        errors.push({ code: 'duplicate-id', params: { table, id: clean.id } });
      } else {
        entries.push(clean);
      }
    });
    (catalog as any)[table] = entries;
  }
  return { catalog: normalizeCatalog(catalog), errors };
}

/** Schreibt den Katalog als formatierte JSON-Datei. Leere Tabellen entfallen. */
export function serializeCatalog(catalog: CatalogFile): string {
  return `${JSON.stringify(normalizeCatalog(catalog), null, 2)}\n`;
}

/**
 * Leere Tabellen gelten als nicht vorhanden. Wichtig für die Prüfung: Ohne Statustabelle ist jeder Status
 * erlaubt, mit einer leeren wäre jeder unbekannt.
 */
export function normalizeCatalog(catalog: CatalogFile): CatalogFile {
  const result: CatalogFile = {};
  for (const table of TABLES) {
    const entries = catalog[table];
    if (entries?.length) {
      (result as any)[table] = entries;
    }
  }
  return result;
}

/** Ist der Katalog leer, arbeitet der Modellierer nur mit Freitext. */
export function isEmptyCatalog(catalog: CatalogFile | undefined): boolean {
  return !TABLES.some((table) => catalog?.[table]?.length);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function translations(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [language, name] of Object.entries(value)) {
    const clean = text(name);
    if (clean) {
      result[language] = clean;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function cleanEntry(table: CatalogTable, entry: any): StatusDefinition | RoleDefinition | Service | undefined {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }
  const id = text(entry.id);
  const name = text(entry.name);
  if (!id || !name) {
    return undefined;
  }
  const t = translations(entry.translations);
  if (table === 'states') {
    const state: StatusDefinition = { id, name };
    if (t) state.translations = t;
    for (const key of ['icon', 'color'] as const) {
      const value = text(entry[key]);
      if (value) state[key] = value;
    }
    if (['todo', 'in_progress', 'done'].includes(entry.category)) state.category = entry.category;
    return state;
  }
  if (table === 'roles') {
    const kind = entry.kind === 'role' ? 'role' : entry.kind === 'group' ? 'group' : undefined;
    if (!kind) return undefined;
    const role: RoleDefinition = { id, name, kind };
    if (t) role.translations = t;
    const description = text(entry.description);
    if (description) role.description = description;
    return role;
  }
  const service: Service = { id, name, kind: text(entry.kind) ?? 'business' };
  const description = text(entry.description);
  if (description) service.description = description;
  return service;
}
