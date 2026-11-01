import type { ModdleElement } from '../states/types.js';
import { formatAssignee } from './assignees.js';
import { findParticipant, laneMap, resolveRaci } from './check.js';
import { RACI_ROLES, type Raci, type RaciRole } from './read.js';

type El = ModdleElement & Record<string, any>;

/** Eine Zeile der RACI-Matrix: eine Aktivität mit ihren Zuordnungen. */
export interface RaciRow {
  elementId: string;
  elementName?: string;
  raci: Raci;
  /** D kommt aus der Swimlane, nicht aus der Aktivität selbst. */
  responsibleFromLane: boolean;
  /**
   * Rollen je Spalte, z. B. `{ 'group(Autoren)': ['responsible'] }`. Die Buchstaben (R/A/C/I bzw.
   * auf Deutsch D/E/M/I) setzt erst die Anzeige.
   */
  cells: Record<string, RaciRole[]>;
}

export interface RaciMatrix {
  processId: string;
  processName?: string;
  /** Spalten in der Reihenfolge ihres ersten Auftretens. */
  columns: string[];
  rows: RaciRow[];
}

/** Leitet je Prozess die RACI-Matrix ab: Zeilen = Aktivitäten, Spalten = Zuordnungen. */
export function deriveRaciMatrices(definitions: ModdleElement): RaciMatrix[] {
  const roots = ((definitions as El).rootElements ?? []) as El[];
  return roots.filter((el) => el.$type === 'bpmn:Process').map((p) => deriveMatrix(p, findParticipant(definitions, p)));
}

function deriveMatrix(process: El, participant?: El): RaciMatrix {
  const columns: string[] = [];
  const rows: RaciRow[] = [];
  const lanes = laneMap(process, participant);
  for (const el of activities(process)) {
    const { responsibleFromLane, ...raci } = resolveRaci(el, lanes);
    const cells: Record<string, RaciRole[]> = {};
    for (const role of RACI_ROLES) {
      for (const assignee of raci[role]) {
        const column = formatAssignee(assignee);
        if (!columns.includes(column)) {
          columns.push(column);
        }
        cells[column] = [...(cells[column] ?? []), role];
      }
    }
    rows.push({
      elementId: el.id ?? '',
      ...(el.name ? { elementName: el.name } : {}),
      raci,
      responsibleFromLane,
      cells,
    });
  }
  // Bei mehreren Pools haben die Prozesse oft keinen eigenen Namen; dann gilt der Name des Pools.
  const name = process.name || participant?.name;
  return { processId: process.id ?? '', ...(name ? { processName: name } : {}), columns, rows };
}

/** Aktivitäten, die eine Person bearbeitet oder die RACI-Angaben tragen, auch in Unterprozessen. */
function activities(container: El): El[] {
  const result: El[] = [];
  for (const el of (container.flowElements ?? []) as El[]) {
    if (el.$type === 'bpmn:SubProcess') {
      result.push(...activities(el));
    } else if (el.$instanceOf?.('bpmn:Activity')) {
      result.push(el);
    }
  }
  return result;
}
