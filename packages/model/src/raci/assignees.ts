/**
 * Eine Zuordnung in RACI. Geschrieben wird sie in einer kurzen Schreibweise,
 * die im Modellierer und im `potentialOwner` gleich aussieht:
 *
 * | Schreibweise | Bedeutung |
 * | --- | --- |
 * | `user(mmeier)` | eine Person |
 * | `group(Autoren)` | eine Gruppe |
 * | `role(process_owner)` | eine Rolle aus der Rollen- und Gruppentabelle |
 * | `field(autor)` | die Person aus einem Feld des Vorgangs |
 * | `initiator()` | wer den Vorgang gestartet hat |
 * | `performerOf(Erstellen)` | wer eine frühere Aktivität bearbeitet hat |
 * | `notPerformerOf(Erstellen)` | Vier-Augen-Prinzip: nicht, wer diese Aktivität bearbeitet hat |
 * | `orgRole(Leitung, autor)` | eine Rolle in der Organisationseinheit der Person aus einem Feld |
 * | `firstOf(field(coach), field(responsible_person))` | der erste Eintrag, der jemanden ergibt |
 * | `approvalChain(field(responsible_person))` | die Freigabekette ab einer Person; mit Name `approvalChain(review, …)` |
 */
export type Assignee =
  | { kind: 'user'; ref: string }
  | { kind: 'group'; ref: string }
  | { kind: 'role'; ref: string }
  | { kind: 'field'; ref: string }
  | { kind: 'initiator' }
  | { kind: 'performerOf'; ref: string }
  | { kind: 'notPerformerOf'; ref: string }
  | { kind: 'orgRole'; ref: string; of?: string }
  | { kind: 'firstOf'; of: Assignee[] }
  | { kind: 'approvalChain'; start: Assignee; name?: string };

/** Was in `firstOf(…)` stehen darf: kein weiteres `firstOf(…)`, keine Kette. */
export const FIRST_OF_KINDS: AssigneeKind[] = ['field', 'role', 'group', 'initiator', 'performerOf'];
/** Womit eine Freigabekette beginnen kann. */
export const CHAIN_START_KINDS: AssigneeKind[] = ['field', 'initiator', 'performerOf', 'role'];
/** Was eine Swimlane als D annimmt. */
export const LANE_KINDS: AssigneeKind[] = ['role', 'group', 'field', 'firstOf', 'approvalChain'];

export type AssigneeKind = Assignee['kind'];

const CALL = /^\s*([A-Za-z]+)\s*\(([\s\S]*)\)\s*$/;
const NAME = /^[A-Za-z_][\w-]*$/;

/** Ergebnis von `parseAssignees`: erkannte Zuordnungen und nicht lesbare Teile. */
export interface ParsedAssignees {
  assignees: Assignee[];
  invalid: string[];
}

/** Liest eine kommagetrennte Liste wie `group(Autoren), field(autor)`. */
export function parseAssignees(text: string | undefined): ParsedAssignees {
  const assignees: Assignee[] = [];
  const invalid: string[] = [];
  for (const part of splitTopLevel(text ?? '')) {
    const parsed = parseAssignee(part);
    if (parsed) {
      assignees.push(parsed);
    } else if (part.trim()) {
      invalid.push(part.trim());
    }
  }
  return { assignees, invalid };
}

export function parseAssignee(text: string): Assignee | undefined {
  const match = CALL.exec(text);
  if (!match) {
    return undefined;
  }
  const kind = match[1]!;
  const inner = match[2]!;
  const args = splitTopLevel(inner)
    .map((a) => a.trim())
    .filter(Boolean);
  if (kind === 'firstOf') {
    const of = args.map(parseAssignee);
    return of.length && of.every((a): a is Assignee => !!a && FIRST_OF_KINDS.includes(a.kind)) ? { kind, of } : undefined;
  }
  if (kind === 'approvalChain') {
    const [name, startText] = args.length === 2 ? args : [undefined, args[0]];
    const start = args.length === 1 || args.length === 2 ? parseAssignee(startText ?? '') : undefined;
    if (!start || !CHAIN_START_KINDS.includes(start.kind) || (name !== undefined && !NAME.test(name))) {
      return undefined;
    }
    return name ? { kind, start, name } : { kind, start };
  }
  // Die übrigen Schreibweisen haben nur einfache Argumente.
  if (/[()]/.test(inner)) {
    return undefined;
  }
  const [first, second] = args;
  switch (kind) {
    case 'user':
    case 'group':
    case 'role':
    case 'field':
    case 'performerOf':
    case 'notPerformerOf':
      return first && args.length === 1 ? { kind, ref: first } : undefined;
    case 'initiator':
      return args.length === 0 ? { kind } : undefined;
    case 'orgRole':
      if (!first || args.length > 2) return undefined;
      return second ? { kind, ref: first, of: second } : { kind, ref: first };
    default:
      return undefined;
  }
}

export function formatAssignee(assignee: Assignee): string {
  switch (assignee.kind) {
    case 'initiator':
      return 'initiator()';
    case 'orgRole':
      return assignee.of ? `orgRole(${assignee.ref}, ${assignee.of})` : `orgRole(${assignee.ref})`;
    case 'firstOf':
      return `firstOf(${assignee.of.map(formatAssignee).join(', ')})`;
    case 'approvalChain':
      return `approvalChain(${assignee.name ? `${assignee.name}, ` : ''}${formatAssignee(assignee.start)})`;
    default:
      return `${assignee.kind}(${assignee.ref})`;
  }
}

export function formatAssignees(assignees: Assignee[]): string {
  return assignees.map(formatAssignee).join(', ');
}

/** Trennt an Kommas außerhalb von Klammern. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** Alle Felder, die eine Zuordnung liest, auch in `firstOf(…)` und `approvalChain(…)`, z. B. `['coach']`. */
export function fieldsOf(assignee: Assignee): string[] {
  switch (assignee.kind) {
    case 'field':
      return [assignee.ref];
    case 'orgRole':
      return assignee.of ? [assignee.of] : [];
    case 'firstOf':
      return assignee.of.flatMap(fieldsOf);
    case 'approvalChain':
      return fieldsOf(assignee.start);
    default:
      return [];
  }
}
