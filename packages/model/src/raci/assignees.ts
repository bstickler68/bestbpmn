/**
 * Eine Zuordnung in RACI (ADR 0003). Geschrieben wird sie in einer kurzen Schreibweise,
 * die im Modellierer und im `potentialOwner` gleich aussieht:
 *
 * | Schreibweise | Bedeutung |
 * | --- | --- |
 * | `user(mmeier)` | eine Person |
 * | `group(Autoren)` | eine Gruppe |
 * | `role(process_owner)` | eine Rolle aus der Rollen- und Gruppentabelle (ADR 0013) |
 * | `field(autor)` | die Person aus einem Feld des Vorgangs |
 * | `initiator()` | wer den Vorgang gestartet hat |
 * | `performerOf(Erstellen)` | wer eine frühere Aktivität bearbeitet hat |
 * | `notPerformerOf(Erstellen)` | Vier-Augen-Prinzip: nicht, wer diese Aktivität bearbeitet hat |
 * | `orgRole(Leitung, autor)` | eine Rolle in der Organisationseinheit der Person aus einem Feld |
 */
export type Assignee =
  | { kind: 'user'; ref: string }
  | { kind: 'group'; ref: string }
  | { kind: 'role'; ref: string }
  | { kind: 'field'; ref: string }
  | { kind: 'initiator' }
  | { kind: 'performerOf'; ref: string }
  | { kind: 'notPerformerOf'; ref: string }
  | { kind: 'orgRole'; ref: string; of?: string };

export type AssigneeKind = Assignee['kind'];

const CALL = /^\s*([A-Za-z]+)\s*\(\s*([^()]*)\s*\)\s*$/;

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
  const args = match[2]!
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
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
