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
