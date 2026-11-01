import type { Language } from '../i18n/translations.js';

/**
 * Ein Eintrag der Statustabelle. Der Katalog enthält ID, englischen Namen und Übersetzungen;
 * im Modell steht nur die ID. Symbol, Farbe und Kategorie braucht erst der Ablauf.
 */
export interface StatusDefinition {
  /** Technische ID, z. B. `in_review`. Steht im Modell in eckigen Klammern: `Prozess [in_review]`. */
  id: string;
  /** Name auf Englisch, der Standardsprache. */
  name: string;
  /** Übersetzte Namen je Sprache, z. B. `{ de: 'In Prüfung' }`. */
  translations?: Partial<Record<Language, string>>;
  /** Symbol für Boards und Listen, z. B. ein Emoji oder ein Icon-Name. */
  icon?: string;
  /** Farbe als CSS-Wert, z. B. `#2f80ed`. */
  color?: string;
  /** Art des Status wie die Statuskategorie in Jira: `todo`, `in_progress` oder `done`. */
  category?: 'todo' | 'in_progress' | 'done';
}

/**
 * Ein Eintrag der Rollen- und Gruppentabelle. Im Modell steht nur die ID,
 * geschrieben als `group(id)` oder `role(id)`.
 */
export interface RoleDefinition {
  id: string;
  /** Name auf Englisch, der Standardsprache. */
  name: string;
  /** `group`: Personen wie der Service-Desk. `role`: eine Funktion wie Prozessverantwortlicher. */
  kind: 'group' | 'role';
  translations?: Partial<Record<Language, string>>;
  description?: string;
}

/** Die Zuordnung zu einem Eintrag der Rollen- und Gruppentabelle, z. B. `{ kind: 'group', ref: 'service_desk' }`. */
export function roleAssignee(role: RoleDefinition): { kind: 'group' | 'role'; ref: string } {
  return { kind: role.kind, ref: role.id };
}

/** Sucht den Tabelleneintrag zu einer Zuordnung `group(id)` oder `role(id)`. */
export function findRole(
  roles: RoleDefinition[] | undefined,
  assignee: { kind: string; ref?: string } | undefined,
): RoleDefinition | undefined {
  return assignee && (assignee.kind === 'group' || assignee.kind === 'role')
    ? roles?.find((r) => r.kind === assignee.kind && r.id === assignee.ref)
    : undefined;
}

/**
 * Die zentralen Tabellen, die der Modellierer und die Modellprüfung kennen. Beispiele liegen
 * unter `templates/catalog/`.
 */
export interface Catalog {
  states?: StatusDefinition[];
  roles?: RoleDefinition[];
}

/** Name eines Tabelleneintrags in einer Sprache; ohne Übersetzung der englische Name. */
export function catalogLabel(entry: { name: string; translations?: Partial<Record<string, string>> }, language: string): string {
  return entry.translations?.[language] || entry.name;
}

/** Sucht einen Status nach ID oder, als Komfort bei der Eingabe, nach seinem Namen in irgendeiner Sprache. */
export function findStatus(states: StatusDefinition[] | undefined, text: string | undefined): StatusDefinition | undefined {
  const wanted = text?.trim();
  if (!wanted || !states) {
    return undefined;
  }
  const lower = wanted.toLowerCase();
  return (
    states.find((s) => s.id === wanted) ??
    states.find((s) => [s.name, ...Object.values(s.translations ?? {})].some((n) => n?.toLowerCase() === lower))
  );
}
