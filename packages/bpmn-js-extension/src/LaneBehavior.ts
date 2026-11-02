import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import {
  catalogLabel,
  findParticipant,
  findRole,
  formatAssignee,
  formatAssignees,
  isMultiInstance,
  laneAssignee,
  laneMap,
  modelLanguage,
  parseAssignee,
  readRaci,
  type RoleDefinition,
} from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { UPDATE_RACI } from './raci';
import { is, type BusinessObject } from './util';

/** Befehle, nach denen D und Lane-Namen abgeglichen werden. */
const COMMANDS = [
  'lane.updateRefs',
  'shape.create',
  'shape.replace',
  'element.updateProperties',
  'element.updateModdleProperties',
  'element.updateLabel',
];

/**
 * Swimlanes bestimmen D.
 *
 * - Liegt eine Aktivität in einer Lane oder einem Pool mit Rolle bzw. Gruppe, wird sie als D
 *   in den `potentialOwner` geschrieben. Nach jedem Verschieben, Anlegen oder Ändern der Lane erneut.
 *   `notPerformerOf(…)` bleibt als Einschränkung erhalten.
 * - Multi-Instanz-Aufgaben haben das D aus der Lane immer vorn und dürfen weitere D haben. Wechselt die
 *   Aufgabe den Typ oder ist sie keine Multi-Instanz mehr, bleibt nur das erste D.
 * - Lanes und Pools mit Rolle oder Gruppe aus der Tabelle heißen wie der Tabelleneintrag; Umbenennen
 *   wird zurückgesetzt. Eine frei eingegebene Rolle oder Gruppe gibt nur einer Lane ohne Namen den Namen.
 */
export default class LaneBehavior extends CommandInterceptor {
  static $inject = ['eventBus', 'modeling', 'commandStack', 'elementRegistry', 'bpmnjs', 'config.bestbpmn'];

  private syncing = false;

  constructor(
    eventBus: any,
    private modeling: any,
    private commandStack: any,
    private elementRegistry: any,
    private bpmnjs: any,
    config: BestbpmnConfig | undefined,
  ) {
    super(eventBus);
    const roles = config?.roles;
    // Wechselt eine Multi-Instanz-Aufgabe den Typ, bleibt nur das erste D, ebenso wenn sie keine Multi-Instanz mehr ist.
    this.postExecuted('shape.replace', ({ context }: any) => {
      if (context.oldShape?.businessObject && isMultiInstance(context.oldShape.businessObject)) {
        this.keepFirstResponsible(context.newShape);
      }
    });
    this.postExecuted('element.updateProperties', ({ context }: any) => {
      if (context.properties && 'loopCharacteristics' in context.properties && !isMultiInstance(context.element.businessObject)) {
        this.keepFirstResponsible(context.element);
      }
    });
    this.postExecuted(COMMANDS, () => {
      if (this.syncing) {
        return;
      }
      this.syncing = true;
      try {
        this.sync(roles);
      } finally {
        this.syncing = false;
      }
    });
  }

  /** Lässt nur das erste D stehen (bei einer Lane deren D); `notPerformerOf(…)` bleibt. */
  private keepFirstResponsible(element: any) {
    const bo = element?.businessObject;
    if (!bo || !is(bo, 'bpmn:Activity')) {
      return;
    }
    const current = readRaci(bo).responsible;
    const positive = current.filter((a) => a.kind !== 'notPerformerOf');
    if (positive.length > 1) {
      const restrictions = current.filter((a) => a.kind === 'notPerformerOf');
      this.commandStack.execute(UPDATE_RACI, { element, role: 'responsible', assignees: [positive[0]!, ...restrictions] });
    }
  }

  private sync(roles: RoleDefinition[] | undefined) {
    const definitions = this.bpmnjs.getDefinitions();
    if (!definitions) {
      return;
    }
    const language = modelLanguage(definitions);
    for (const process of (definitions.rootElements ?? []) as BusinessObject[]) {
      if (!is(process, 'bpmn:Process')) {
        continue;
      }
      const participant = findParticipant(definitions, process);
      if (participant) {
        this.lockName(participant, roles, language);
      }
      const lanes = laneMap(process, participant);
      for (const lane of allLanes(process.laneSets)) {
        this.lockName(lane, roles, language);
      }
      const laneAssignees = new Set(
        [...new Set(lanes.values())].map((lane) => laneAssignee(lane)).filter((a) => !!a).map((a) => formatAssignee(a!)),
      );
      for (const [node, lane] of lanes) {
        if (!is(node, 'bpmn:Activity') || is(node, 'bpmn:SubProcess')) {
          continue;
        }
        this.syncResponsible(node, lane, laneAssignees);
      }
    }
  }

  /**
   * Schreibt das D aus der Lane an die erste Stelle. Multi-Instanz-Aufgaben behalten weitere D;
   * stand vorn noch das D einer anderen Lane (Aufgabe verschoben), fällt es weg.
   */
  private syncResponsible(node: BusinessObject, lane: BusinessObject, laneAssignees: Set<string>) {
    const fromLane = laneAssignee(lane);
    const element = this.elementRegistry.get(node.id);
    if (!fromLane || !element) {
      return;
    }
    const current = readRaci(node).responsible;
    const restrictions = current.filter((a) => a.kind === 'notPerformerOf');
    let others: typeof current = [];
    if (isMultiInstance(node)) {
      const lead = formatAssignee(fromLane);
      others = current.filter((a) => a.kind !== 'notPerformerOf');
      if (others[0] && formatAssignee(others[0]) !== lead && laneAssignees.has(formatAssignee(others[0]))) {
        others = others.slice(1);
      }
      others = others.filter((a) => formatAssignee(a) !== lead);
    }
    const wanted = [fromLane, ...others, ...restrictions];
    if (formatAssignees(wanted) !== formatAssignees(current)) {
      this.commandStack.execute(UPDATE_RACI, { element, role: 'responsible', assignees: wanted });
    }
  }

  private lockName(lane: BusinessObject, roles: RoleDefinition[] | undefined, language: string) {
    const assignee = parseAssignee(lane.assignee ?? '');
    const role = findRole(roles, assignee);
    const element = this.elementRegistry.get(lane.id);
    if (!element) {
      return;
    }
    if (!role) {
      if ((assignee?.kind === 'group' || assignee?.kind === 'role') && !lane.name?.trim()) {
        this.modeling.updateLabel(element, assignee.ref);
      }
      return;
    }
    const name = catalogLabel(role, language);
    if (lane.name !== name) {
      this.modeling.updateLabel(element, name);
    }
  }
}

function allLanes(laneSets: BusinessObject[] | undefined): BusinessObject[] {
  return (laneSets ?? []).flatMap((set) =>
    ((set.lanes ?? []) as BusinessObject[]).flatMap((lane) => [lane, ...allLanes(lane.childLaneSet ? [lane.childLaneSet] : [])]),
  );
}
