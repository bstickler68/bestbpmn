import type { ModdleElement } from '../states/types.js';
import { formatAssignee } from './assignees.js';
import { findParticipant, laneMap, resolveRaci } from './check.js';
import { RACI_ROLES, type Raci, type RaciRole } from './read.js';
import { positions, tableOrder } from '../report/elements.js';

type El = ModdleElement & Record<string, any>;

/** Eine Zeile der RACI-Matrix: eine Aktivität mit ihren Zuordnungen. */
export interface RaciRow {
  elementId: string;
  elementName?: string;
  raci: Raci;
  /** D kommt aus der Swimlane, nicht aus der Aktivität selbst. */
  responsibleFromLane: boolean;
  /** Die Spalte des D aus der Swimlane oder dem Pool; nur dieses D wird hervorgehoben. */
  laneColumn?: string;
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

/**
 * Fasst die Matrizen aller Prozesse (Pools) zu einer Tabelle zusammen: je Rolle oder Gruppe genau
 * eine Spalte, die Zeilen in der Reihenfolge der Pools.
 */
export function combineRaciMatrices(matrices: RaciMatrix[]): RaciMatrix {
  const columns: string[] = [];
  for (const column of matrices.flatMap((m) => m.columns)) {
    if (!columns.includes(column)) {
      columns.push(column);
    }
  }
  const first = matrices[0];
  return {
    processId: first?.processId ?? '',
    ...(matrices.length === 1 && first?.processName ? { processName: first.processName } : {}),
    columns,
    rows: matrices.flatMap((m) => m.rows),
  };
}

/** Leitet je Prozess die RACI-Matrix ab: Zeilen = Aktivitäten, Spalten = Zuordnungen. */
export function deriveRaciMatrices(definitions: ModdleElement): RaciMatrix[] {
  const roots = ((definitions as El).rootElements ?? []) as El[];
  const where = positions(definitions);
  return roots.filter((el) => el.$type === 'bpmn:Process').map((p) => deriveMatrix(p, where, findParticipant(definitions, p)));
}

function deriveMatrix(process: El, where: Map<string, { x: number; y: number }>, participant?: El): RaciMatrix {
  const columns: string[] = [];
  const rows: RaciRow[] = [];
  const lanes = laneMap(process, participant);
  for (const el of activities(process, where)) {
    const { responsibleFromLane, laneResponsible, ...raci } = resolveRaci(el, lanes);
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
      ...(laneResponsible ? { laneColumn: formatAssignee(laneResponsible) } : {}),
      cells,
    });
  }
  // Bei mehreren Pools haben die Prozesse oft keinen eigenen Namen; dann gilt der Name des Pools.
  const name = process.name || participant?.name;
  return { processId: process.id ?? '', ...(name ? { processName: name } : {}), columns, rows };
}

/**
 * Aktivitäten, die eine Person bearbeitet oder die RACI-Angaben tragen, auch in Unterprozessen.
 * Sie stehen in derselben Reihenfolge wie in der Elementtabelle des Berichts; Teilprozesse selbst nicht.
 */
function activities(process: El, where: Map<string, { x: number; y: number }>): El[] {
  const ordered = tableOrder(process, where);
  const all = allActivities(process);
  const rank = new Map(ordered.map((el, index) => [el, index]));
  // Aktivitäten, die die Tabelle nicht kennt, behalten ihren Platz am Ende.
  return all.sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));
}

function allActivities(container: El): El[] {
  const result: El[] = [];
  for (const el of (container.flowElements ?? []) as El[]) {
    if (el.$type === 'bpmn:SubProcess') {
      result.push(...allActivities(el));
    } else if (el.$instanceOf?.('bpmn:Activity')) {
      result.push(el);
    }
  }
  return result;
}
