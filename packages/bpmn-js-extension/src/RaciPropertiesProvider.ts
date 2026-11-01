import { h } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';
import {
  findParticipant,
  formatAssignee,
  isMultiInstance,
  laneMap,
  parseAssignee,
  RACI_ROLES,
  readRaci,
  resolveRaci,
  type Assignee,
  type RaciRole,
  type RoleDefinition,
} from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { UPDATE_RACI } from './raci';
import { RolePicker } from './RolePicker';
import { pickerTexts, roleOptions } from './roleOptions';
import { findProcess, is, type DiagramElement } from './util';

const LOW_PRIORITY = 500;

/**
 * Bereich „Verantwortlichkeiten (DEMI)“ im Eigenschaftenpanel. Alle Rollen kommen aus der
 * Rollen- und Gruppentabelle, als Suchfeld wie in Jira: D und E mit einem Eintrag, M und I mit mehreren.
 * Liegt die Aufgabe in einer Swimlane mit Rolle oder Gruppe, kommt D aus der Lane und ist gesperrt.
 * Multi-Instanz-Aufgaben dürfen mehrere D haben.
 */
export default class RaciPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn', 'bpmnjs'];

  private i18n: BestbpmnI18n;
  private roles: RoleDefinition[];

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined, private bpmnjs: any) {
    this.i18n = resolveI18n(config);
    this.roles = config?.roles ?? [];
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      if (!is(bo, 'bpmn:Activity') || is(bo, 'bpmn:SubProcess')) {
        return groups;
      }
      const definitions = this.bpmnjs.getDefinitions();
      const process = findProcess(bo);
      const resolved = process ? resolveRaci(bo as any, laneMap(process as any, findParticipant(definitions, process as any))) : undefined;
      const fromLane = resolved?.responsibleFromLane ? resolved.responsible[0] : undefined;
      const multi = isMultiInstance(bo as any);

      const entries = RACI_ROLES.map((role) => ({
        id: `bestbpmn-raci-${role}`,
        component: RoleEntry,
        role,
        roles: this.roles,
        i18n: this.i18n,
        multiple: role === 'consulted' || role === 'informed' || (role === 'responsible' && multi),
        fromLane: role === 'responsible' && !multi ? fromLane : undefined,
      }));
      // Direkt nach „Allgemein“ und „Beschreibung“, vor Übersetzungen und Zusatzattributen.
      const index = groups.findIndex((g) => g.id === 'documentation');
      groups.splice(index >= 0 ? index + 1 : groups.length, 0, {
        id: 'bestbpmn-raci',
        label: this.i18n.t('raci.title'),
        entries,
      });
      return groups;
    };
  }
}

interface RoleEntryProps {
  element: DiagramElement;
  id: string;
  role: RaciRole;
  roles: RoleDefinition[];
  i18n: BestbpmnI18n;
  multiple: boolean;
  fromLane?: Assignee;
}

/** `notPerformerOf(…)` am D ist eine Einschränkung, keine Auswahl; sie bleibt bei jeder Änderung erhalten. */
function split(role: RaciRole, assignees: Assignee[]) {
  const restrictions: Assignee[] = role === 'responsible' ? assignees.filter((a) => a.kind === 'notPerformerOf') : [];
  return { selected: assignees.filter((a) => !restrictions.includes(a)), restrictions };
}

/** Eine DEMI-Rolle als Suchfeld: D und E mit einem Eintrag, M und I (und D bei Multi-Instanz) mit mehreren. */
function RoleEntry(props: RoleEntryProps) {
  const { element, id, role, roles, i18n, multiple, fromLane } = props;
  const { t } = i18n;
  const commandStack = useService('commandStack');
  const { selected, restrictions } = split(role, readRaci(element.businessObject)[role]);
  const shown = fromLane ? [fromLane] : selected;
  return h(RolePicker, {
    id,
    label: t(`raci.${role}`),
    description: fromLane ? t('raci.fromLane') : role === 'responsible' && multiple ? t('raci.multiInstance') : undefined,
    options: roleOptions(roles, shown, i18n),
    values: shown.map(formatAssignee),
    multiple,
    disabled: !!fromLane,
    texts: pickerTexts(i18n),
    onChange: (values: string[]) => {
      const assignees = values.map((v) => parseAssignee(v)).filter((a): a is Assignee => !!a);
      commandStack.execute(UPDATE_RACI, { element, role, assignees: [...assignees, ...restrictions] });
    },
  });
}
