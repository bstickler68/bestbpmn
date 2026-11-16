import type { ModdleElement } from '../states/types.js';
import { formatAssignee } from './assignees.js';
import { findParticipant, laneMap, resolveRaci } from './check.js';
import { RACI_ROLES, type Raci, type RaciRole } from './read.js';
import { flowGroups, groupOrder, positions, type FlowGroup } from '../report/elements.js';

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
 * Fasst die Matrizen mehrerer Abläufe zu einer Tabelle zusammen: je Rolle oder Gruppe genau
 * eine Spalte, die Zeilen in der Reihenfolge der Abläufe.
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

/**
 * Leitet je Ablauf die RACI-Matrix ab: Zeilen = Aktivitäten, Spalten = Zuordnungen. Alle Pools einer
 * Kollaboration bilden einen Ablauf; die Zeilen folgen dem Prozessverlauf, nicht den Pools oder Lanes.
 */
export function deriveRaciMatrices(definitions: ModdleElement): RaciMatrix[] {
  const where = positions(definitions);
  return flowGroups(definitions).map((group) => deriveMatrix(definitions, group, where));
}

function deriveMatrix(definitions: ModdleElement, group: FlowGroup, where: Map<string, { x: number; y: number }>): RaciMatrix {
  const columns: string[] = [];
  const rows: RaciRow[] = [];
  // Die Lanes gelten je Pool: jede Aktivität bekommt die ihres eigenen Prozesses.
  const lanesOf = new Map<El, ReturnType<typeof laneMap>>();
  for (const process of group.processes) {
    const lanes = laneMap(process, findParticipant(definitions, process));
    for (const el of allActivities(process)) {
      lanesOf.set(el, lanes);
    }
  }
  for (const el of activities(group, where)) {
    const { responsibleFromLane, laneResponsible, ...raci } = resolveRaci(el, lanesOf.get(el)!);
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
  return { processId: group.id, ...(group.name ? { processName: group.name } : {}), columns, rows };
}

/**
 * Aktivitäten, die eine Person bearbeitet oder die RACI-Angaben tragen, auch in Unterprozessen.
 * Sie stehen in derselben Reihenfolge wie in der Elementtabelle des Berichts; Teilprozesse selbst nicht.
 */
function activities(group: FlowGroup, where: Map<string, { x: number; y: number }>): El[] {
  const ordered = groupOrder(group, where);
  const all = group.processes.flatMap(allActivities);
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
