import type { ModdleElement, ModelIssue } from '../states/types.js';
import { findRole, type RoleDefinition } from '../catalog/types.js';
import { formatAssignee, formatAssignees, parseAssignee, type Assignee } from './assignees.js';
import { readRaci, type Raci } from './read.js';

type El = ModdleElement & Record<string, any>;

/**
 * D aus einer Swimlane oder einem Pool:
 * - Ist eine Rolle oder Gruppe ausgewählt, steht sie in `raci:assignee`, z. B. `group(service_desk)`.
 * - Sonst gilt der Name als Gruppe (`Autoren` → `group(Autoren)`) oder er steht selbst in der
 *   RACI-Schreibweise, z. B. `field(autor)`. Das hält Modelle aus anderen Werkzeugen lesbar.
 * - Ein Pool ohne Lanes wird wie eine Lane behandelt: Auch sein Name gilt als Rolle oder Gruppe.
 *   Hat der Pool Lanes, zählt er nicht (siehe `laneMap`).
 */
export function laneAssignee(lane: El): Assignee | undefined {
  const explicit = (lane.assignee as string | undefined)?.trim();
  if (explicit) {
    return parseAssignee(explicit);
  }
  const name = (lane.name as string | undefined)?.trim();
  if (!name) {
    return undefined;
  }
  return parseAssignee(name) ?? { kind: 'group', ref: name };
}

/** Der Pool (`bpmn:Participant`), der einen Prozess darstellt, falls es einen gibt. */
export function findParticipant(definitions: ModdleElement | undefined, process: ModdleElement): El | undefined {
  for (const root of ((definitions as El | undefined)?.rootElements ?? []) as El[]) {
    if (root.$type === 'bpmn:Collaboration') {
      const participant = ((root.participants ?? []) as El[]).find((p) => p.processRef === process);
      if (participant) {
        return participant;
      }
    }
  }
  return undefined;
}

/** Hat der Prozess Swimlanes? */
export function hasLanes(process: El): boolean {
  return ((process.laneSets ?? []) as El[]).some((set) => ((set.lanes ?? []) as El[]).length > 0);
}

/**
 * Ordnet jedem Element die Swimlane zu, aus der sein D kommt:
 * - Gibt es Lanes im Pool, gilt immer die innerste Lane der Aufgabe. Der Pool zählt dann nicht.
 * - Nur ein Pool ohne Lanes (der Pool ist dann selbst die einzige Lane) gibt seine Rolle oder Gruppe weiter.
 */
export function laneMap(process: El, participant?: El): Map<El, El> {
  const result = new Map<El, El>();
  if (!hasLanes(process)) {
    if (participant && laneAssignee(participant)) {
      for (const node of (process.flowElements ?? []) as El[]) {
        result.set(node, participant);
      }
    }
    return result;
  }
  const visit = (laneSets: El[] | undefined) => {
    for (const laneSet of laneSets ?? []) {
      for (const lane of (laneSet.lanes ?? []) as El[]) {
        for (const node of (lane.flowNodeRef ?? []) as El[]) {
          result.set(node, lane);
        }
        // Innere Lanes kommen danach und überschreiben die äußere.
        visit(lane.childLaneSet ? [lane.childLaneSet] : undefined);
      }
    }
  };
  visit(process.laneSets);
  return result;
}

/**
 * Jede Swimlane braucht eine Rolle oder Gruppe aus der Tabelle (`raci:assignee`). Geprüft werden
 * die innersten Lanes, denn aus ihnen kommt D; eine Lane, die nur weitere Lanes enthält, braucht keine.
 * Ein Pool ohne Lanes ist selbst die Lane und wird genauso geprüft.
 */
export function checkLanes(process: El, participant?: El): ModelIssue[] {
  const issues: ModelIssue[] = [];
  if (!hasLanes(process)) {
    if (participant && !(participant.assignee as string | undefined)?.trim()) {
      issues.push({
        code: 'lane-without-role',
        severity: 'error',
        elementId: participant.id,
        params: { element: participant.name || participant.id || participant.$type },
      });
    }
    return issues;
  }
  const visit = (laneSets: El[] | undefined) => {
    for (const laneSet of laneSets ?? []) {
      for (const lane of (laneSet.lanes ?? []) as El[]) {
        const children = (lane.childLaneSet?.lanes ?? []) as El[];
        if (children.length) {
          visit([lane.childLaneSet]);
        } else if (!(lane.assignee as string | undefined)?.trim()) {
          issues.push({
            code: 'lane-without-role',
            severity: 'error',
            elementId: lane.id,
            params: { element: lane.name || lane.id || lane.$type },
          });
        }
      }
    }
  };
  visit(process.laneSets);
  return issues;
}

/** Multi-Instanz-Aufgabe (parallel oder sequenziell): Hier darf es mehrere D geben, je D eine eigene Bearbeitung. */
export function isMultiInstance(element: ModdleElement): boolean {
  return (element as El).loopCharacteristics?.$type === 'bpmn:MultiInstanceLoopCharacteristics';
}

/**
 * RACI eines Elements mit D aus der Swimlane. Liegt die Aktivität in einer Lane mit Zuordnung,
 * ist das ihr D; `notPerformerOf(…)` an der Aktivität bleibt als Einschränkung erhalten.
 * Ausnahme Multi-Instanz-Aufgaben: Sie behalten ihre eigenen D, die Lane gilt nur, wenn keins eingetragen ist.
 */
export function resolveRaci(element: El, lanes: Map<El, El>): Raci & { responsibleFromLane: boolean } {
  const raci = readRaci(element);
  const lane = lanes.get(element);
  const fromLane = lane ? laneAssignee(lane) : undefined;
  if (!fromLane) {
    return { ...raci, responsibleFromLane: false };
  }
  const positive = raci.responsible.filter((a) => a.kind !== 'notPerformerOf');
  if (isMultiInstance(element) && positive.length) {
    return { ...raci, responsibleFromLane: false };
  }
  const restrictions = raci.responsible.filter((a) => a.kind === 'notPerformerOf');
  return { ...raci, responsible: [fromLane, ...restrictions], responsibleFromLane: true };
}

/**
 * Prüfregeln für RACI/DEMI:
 * - Jede Benutzeraufgabe hat genau ein D, an der Aufgabe oder über ihre Swimlane.
 *   Multi-Instanz-Aufgaben dürfen mehrere D haben. `notPerformerOf(…)` schränkt nur ein und zählt nicht mit.
 * - Höchstens ein E je Aktivität. M und I dürfen mehrfach vorkommen.
 * - Mit Rollen- und Gruppentabelle: unbekannte `group(…)` und `role(…)` sind eine Warnung.
 */
export function checkRaci(elements: El[], lanes: Map<El, El>, roles?: RoleDefinition[]): ModelIssue[] {
  const issues: ModelIssue[] = [];
  for (const el of elements) {
    if (!el.$instanceOf?.('bpmn:Activity')) {
      continue;
    }
    const raci = resolveRaci(el, lanes);
    const element = el.name || el.id || el.$type;
    const responsible = raci.responsible.filter((a) => a.kind !== 'notPerformerOf');

    if (el.$type === 'bpmn:UserTask') {
      if (responsible.length === 0) {
        issues.push({ code: 'raci-missing-responsible', severity: 'error', elementId: el.id, params: { element } });
      } else if (responsible.length > 1 && !isMultiInstance(el)) {
        issues.push({
          code: 'raci-multiple-responsible',
          severity: 'error',
          elementId: el.id,
          params: { element, assignees: formatAssignees(responsible) },
        });
      }
    }
    if (raci.accountable.length > 1) {
      issues.push({
        code: 'raci-multiple-accountable',
        severity: 'error',
        elementId: el.id,
        params: { element, assignees: formatAssignees(raci.accountable) },
      });
    }
    if (roles) {
      const all = [...raci.responsible, ...raci.accountable, ...raci.consulted, ...raci.informed];
      const unknown = all.filter((a) => (a.kind === 'group' || a.kind === 'role') && !findRole(roles, a));
      for (const assignee of new Map(unknown.map((a) => [formatAssignee(a), a])).values()) {
        issues.push({
          code: 'raci-unknown-assignee',
          severity: 'warning',
          elementId: el.id,
          params: { element, assignee: formatAssignee(assignee) },
        });
      }
    }
  }
  return issues;
}
