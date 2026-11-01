import {
  formatAssignee,
  isProcessObjectName,
  parseAssignees,
  parseStateLabel,
  readRaci,
  type Assignee,
} from '@bestbpmn/model';

/** Ein bpmn-moddle-Element. Bewusst locker typisiert, weil bpmn-js hier `any` liefert. */
export type BusinessObject = {
  $type: string;
  $parent?: BusinessObject;
  id?: string;
  name?: string;
  [key: string]: any;
};

export type DiagramElement = {
  id: string;
  type: string;
  businessObject: BusinessObject;
  labelTarget?: DiagramElement;
  parent?: DiagramElement;
};

export function is(bo: BusinessObject | undefined, type: string): boolean {
  return !!bo && typeof bo.$instanceOf === 'function' ? bo.$instanceOf(type) : bo?.$type === type;
}

/** Sucht vom Element aus den Prozess, zu dem es semantisch gehört. */
export function findProcess(bo: BusinessObject | undefined): BusinessObject | undefined {
  let current = bo;
  while (current) {
    if (is(current, 'bpmn:Participant')) {
      return current.processRef;
    }
    if (is(current, 'bpmn:Process')) {
      return current;
    }
    current = current.$parent;
  }
  return undefined;
}

/** Alle DataObjects eines Prozesses, auch in Unterprozessen. */
export function findDataObjects(container: BusinessObject | undefined): BusinessObject[] {
  const result: BusinessObject[] = [];
  for (const el of (container?.flowElements ?? []) as BusinessObject[]) {
    if (is(el, 'bpmn:DataObject')) {
      result.push(el);
    }
    if (el.flowElements) {
      result.push(...findDataObjects(el));
    }
  }
  return result;
}

/** Alle Referenzen eines Prozesses auf ein bestimmtes DataObject. */
export function findReferences(container: BusinessObject | undefined, dataObject: BusinessObject): BusinessObject[] {
  const result: BusinessObject[] = [];
  for (const el of (container?.flowElements ?? []) as BusinessObject[]) {
    if (is(el, 'bpmn:DataObjectReference') && el.dataObjectRef === dataObject) {
      result.push(el);
    }
    if (el.flowElements) {
      result.push(...findReferences(el, dataObject));
    }
  }
  return result;
}

/** Alle Elemente eines Containers, auch in Unterprozessen. */
function allFlowElements(container: BusinessObject | undefined): BusinessObject[] {
  return ((container?.flowElements ?? []) as BusinessObject[]).flatMap((el) => [el, ...allFlowElements(el)]);
}

function allLanes(laneSets: BusinessObject[] | undefined): BusinessObject[] {
  return (laneSets ?? []).flatMap((set) =>
    ((set.lanes ?? []) as BusinessObject[]).flatMap((lane) => [lane, ...allLanes(lane.childLaneSet ? [lane.childLaneSet] : [])]),
  );
}

/** Alle Prozesse und Pools eines Modells. */
function processesAndPools(definitions: BusinessObject | undefined): { processes: BusinessObject[]; pools: BusinessObject[] } {
  const roots = (definitions?.rootElements ?? []) as BusinessObject[];
  return {
    processes: roots.filter((r) => is(r, 'bpmn:Process')),
    pools: roots.filter((r) => is(r, 'bpmn:Collaboration')).flatMap((c) => (c.participants ?? []) as BusinessObject[]),
  };
}

/** Status, die im Modell schon an einer Referenz auf „Prozess“ stehen, so wie sie in der Beschriftung stehen. */
export function usedStatuses(definitions: BusinessObject | undefined): string[] {
  const result: string[] = [];
  for (const process of processesAndPools(definitions).processes) {
    for (const el of allFlowElements(process)) {
      if (!is(el, 'bpmn:DataObjectReference')) {
        continue;
      }
      const label = parseStateLabel(el.name);
      const isProcess = isProcessObjectName(el.dataObjectRef?.name ?? label?.object);
      const state = isProcess ? (label?.state ?? (el.dataState?.name as string | undefined)) : undefined;
      if (state && !result.includes(state)) {
        result.push(state);
      }
    }
  }
  return result;
}

/** Rollen und Gruppen, die im Modell schon vorkommen: an Lanes, Pools und Aktivitäten. */
export function usedAssignees(definitions: BusinessObject | undefined): Assignee[] {
  const { processes, pools } = processesAndPools(definitions);
  const fromAttribute = (el: BusinessObject) => (el.assignee ? parseAssignees(el.assignee as string).assignees : []);
  const all = [
    ...pools.flatMap(fromAttribute),
    ...processes.flatMap((p) => allLanes(p.laneSets).flatMap(fromAttribute)),
    ...processes.flatMap((p) =>
      allFlowElements(p)
        .filter((el) => is(el, 'bpmn:Activity'))
        .flatMap((el) => Object.values(readRaci(el as any)).flat()),
    ),
  ].filter((a) => a.kind === 'group' || a.kind === 'role');
  return [...new Map(all.map((a) => [formatAssignee(a), a])).values()];
}
