import { formatAssignees, fromAssignee, raciElementType, type Assignee, type RaciRole } from '@bestbpmn/model';
import { is, type BusinessObject, type DiagramElement } from './util';

export const UPDATE_RACI = 'bestbpmn.raci.update';

export interface UpdateRaciContext {
  element: DiagramElement;
  role: RaciRole;
  assignees: Assignee[];
}

/**
 * Setzt eine RACI-Rolle einer Aktivität in einem Schritt, der sich als Ganzes rückgängig machen lässt.
 * R landet im BPMN-Standard `potentialOwner`, A/C/I im `raci`-Namensraum.
 */
export class UpdateRaciHandler {
  static $inject = ['modeling', 'bpmnFactory'];

  constructor(
    private modeling: any,
    private bpmnFactory: any,
  ) {}

  preExecute({ element, role, assignees }: UpdateRaciContext) {
    if (role === 'responsible') {
      this.updateResponsible(element, assignees);
    } else {
      this.updateExtension(element, raciElementType(role), assignees);
    }
  }

  private updateResponsible(element: DiagramElement, assignees: Assignee[]) {
    const { modeling, bpmnFactory } = this;
    const bo = element.businessObject;
    const resources: BusinessObject[] = bo.resources ?? [];
    const owners = resources.filter((r) => is(r, 'bpmn:PotentialOwner'));
    const others = resources.filter((r) => !is(r, 'bpmn:PotentialOwner'));

    if (!assignees.length) {
      if (owners.length) {
        modeling.updateModdleProperties(element, bo, { resources: others });
      }
      return;
    }

    const body = formatAssignees(assignees);
    const expression = owners[0]?.resourceAssignmentExpression?.expression;
    if (owners.length === 1 && expression) {
      modeling.updateModdleProperties(element, expression, { body });
      return;
    }
    const formal = bpmnFactory.create('bpmn:FormalExpression', { body });
    const assignment = bpmnFactory.create('bpmn:ResourceAssignmentExpression', { expression: formal });
    const owner = bpmnFactory.create('bpmn:PotentialOwner', { resourceAssignmentExpression: assignment });
    formal.$parent = assignment;
    assignment.$parent = owner;
    owner.$parent = bo;
    modeling.updateModdleProperties(element, bo, { resources: [...others, owner] });
  }

  private updateExtension(element: DiagramElement, type: string, assignees: Assignee[]) {
    const { modeling, bpmnFactory } = this;
    const bo = element.businessObject;

    let extensionElements = bo.extensionElements;
    const existing = (extensionElements?.values ?? []).filter((v: BusinessObject) => is(v, type));
    if (!assignees.length && !existing.length) {
      return;
    }
    if (!extensionElements) {
      extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
      extensionElements.$parent = bo;
      modeling.updateModdleProperties(element, bo, { extensionElements });
    }

    const rest = extensionElements.values.filter((v: BusinessObject) => !existing.includes(v));
    let values = rest;
    if (assignees.length) {
      const container = bpmnFactory.create(type, {});
      container.$parent = extensionElements;
      container.assignees = assignees.map((assignee) => {
        const { type: assigneeType, attrs } = fromAssignee(assignee);
        const el = bpmnFactory.create(assigneeType, attrs);
        el.$parent = container;
        return el;
      });
      // An der Stelle des alten Eintrags einsetzen, damit die Reihenfolge stabil bleibt.
      const index = existing.length ? extensionElements.values.indexOf(existing[0]) : rest.length;
      values = [...rest];
      values.splice(Math.min(index, values.length), 0, container);
    }
    modeling.updateModdleProperties(element, extensionElements, { values });
    if (!values.length) {
      modeling.updateModdleProperties(element, bo, { extensionElements: undefined });
    }
  }

  execute() {
    return [];
  }

  revert() {
    return [];
  }
}

export class RaciCommands {
  static $inject = ['commandStack'];
  constructor(commandStack: any) {
    commandStack.registerHandler(UPDATE_RACI, UpdateRaciHandler);
  }
}
