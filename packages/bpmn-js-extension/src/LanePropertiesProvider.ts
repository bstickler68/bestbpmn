import { h } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';
import { findRole, formatAssignee, hasLanes, parseAssignee, type RoleDefinition } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { RolePicker } from './RolePicker';
import { pickerTexts, roleOptions } from './roleOptions';
import { is, type BusinessObject, type DiagramElement } from './util';

const LOW_PRIORITY = 600;

/**
 * Rolle oder Gruppe einer Swimlane oder eines Pools aus der Rollen- und Gruppentabelle.
 * Der Name wird aus der Tabelle übernommen; das Namensfeld entfällt dann.
 */
export default class LanePropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn'];

  private i18n: BestbpmnI18n;
  private roles: RoleDefinition[];

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined) {
    this.i18n = resolveI18n(config);
    this.roles = config?.roles ?? [];
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      if (!is(bo, 'bpmn:Lane') && !is(bo, 'bpmn:Participant')) {
        return groups;
      }
      const general = groups.find((g) => g.id === 'general');
      if (general && findRole(this.roles, parseAssignee(bo.assignee ?? ''))) {
        general.entries = general.entries.filter((e: any) => e.id !== 'name');
      }
      const index = groups.indexOf(general);
      groups.splice(index >= 0 ? index + 1 : groups.length, 0, {
        id: 'bestbpmn-lane',
        label: this.i18n.t('lane.title'),
        // Hat der Pool Lanes, kommt D immer aus den Lanes; der Pool braucht dann keine Zuordnung.
        entries:
          is(bo, 'bpmn:Participant') && bo.processRef && hasLanes(bo.processRef) && !bo.assignee
            ? [{ id: 'bestbpmn-lane-hint', component: Hint, text: this.i18n.t('lane.poolHasLanes') }]
            : [{ id: 'bestbpmn-lane-role', component: LaneRoleEntry, roles: this.roles, i18n: this.i18n }],
      });
      return groups;
    };
  }
}

function LaneRoleEntry(props: { element: DiagramElement; id: string; roles: RoleDefinition[]; i18n: BestbpmnI18n }) {
  const { element, id, roles, i18n } = props;
  const modeling = useService('modeling');
  const bo: BusinessObject = element.businessObject;
  const current = bo.assignee ? parseAssignee(bo.assignee) : undefined;
  return h(RolePicker, {
    id,
    label: i18n.t('lane.role'),
    description: i18n.t(is(bo, 'bpmn:Participant') ? 'lane.poolDescription' : 'lane.description'),
    options: roleOptions(roles, current ? [current] : [], i18n),
    values: current ? [formatAssignee(current)] : [],
    multiple: false,
    texts: pickerTexts(i18n),
    // Den Namen setzt LaneBehavior aus der Tabelle, in der Hauptsprache des Modells.
    onChange: (values: string[]) => modeling.updateModdleProperties(element, bo, { assignee: values[0] || undefined }),
  });
}

function Hint(props: { text: string }) {
  return h('div', { class: 'bio-properties-panel-description bestbpmn-empty' }, props.text);
}
