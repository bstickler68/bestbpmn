import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import {
  catalogLabel,
  findParticipant,
  findRole,
  formatAssignees,
  isMultiInstance,
  laneAssignee,
  laneMap,
  modelLanguage,
  parseAssignee,
  readRaci,
  type RoleDefinition,
} from '@bestbpmn/model';
import type { PraxiqConfig } from './attributes';
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
 * Swimlanes bestimmen D (ADR 0013).
 *
 * - Liegt eine Aktivität in einer Lane oder einem Pool mit Rolle bzw. Gruppe, wird sie als D
 *   in den `potentialOwner` geschrieben. Nach jedem Verschieben, Anlegen oder Ändern der Lane erneut.
 *   `notPerformerOf(…)` bleibt als Einschränkung erhalten.
 * - Multi-Instanz-Aufgaben behalten ihre eigenen D; die Lane gilt nur, solange keins eingetragen ist.
 * - Lanes und Pools mit Rolle oder Gruppe aus der Tabelle heißen wie der Tabelleneintrag; Umbenennen
 *   wird zurückgesetzt.
 */
export default class LaneBehavior extends CommandInterceptor {
  static $inject = ['eventBus', 'modeling', 'commandStack', 'elementRegistry', 'bpmnjs', 'config.praxiq'];

  private syncing = false;

  constructor(
    eventBus: any,
    private modeling: any,
    private commandStack: any,
    private elementRegistry: any,
    private bpmnjs: any,
    config: PraxiqConfig | undefined,
  ) {
    super(eventBus);
    const roles = config?.roles;
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
      for (const [node, lane] of lanes) {
        if (!is(node, 'bpmn:Activity') || is(node, 'bpmn:SubProcess')) {
          continue;
        }
        this.syncResponsible(node, lane);
      }
    }
  }

  private syncResponsible(node: BusinessObject, lane: BusinessObject) {
    const fromLane = laneAssignee(lane);
    const element = this.elementRegistry.get(node.id);
    if (!fromLane || !element) {
      return;
    }
    const current = readRaci(node).responsible;
    const positive = current.filter((a) => a.kind !== 'notPerformerOf');
    if (isMultiInstance(node) && positive.length) {
      return;
    }
    const wanted = [fromLane, ...current.filter((a) => a.kind === 'notPerformerOf')];
    if (formatAssignees(wanted) !== formatAssignees(current)) {
      this.commandStack.execute(UPDATE_RACI, { element, role: 'responsible', assignees: wanted });
    }
  }

  private lockName(lane: BusinessObject, roles: RoleDefinition[] | undefined, language: string) {
    const role = findRole(roles, parseAssignee(lane.assignee ?? ''));
    const element = this.elementRegistry.get(lane.id);
    if (!role || !element) {
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
