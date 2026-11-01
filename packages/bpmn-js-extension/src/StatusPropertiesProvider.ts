import { h } from '@bpmn-io/properties-panel/preact';
import { isSelectEntryEdited, SelectEntry, TextFieldEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import {
  canonicalProcessObjectName,
  catalogLabel,
  formatStateLabel,
  isProcessObjectName,
  modelLanguage,
  parseStateLabel,
  processObjectName,
  type StatusDefinition,
} from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { is, type BusinessObject, type DiagramElement } from './util';

const LOW_PRIORITY = 600;

/**
 * Status einer Referenz auf das Datenobjekt „Prozess“ als Auswahl aus der Statustabelle.
 * Die Auswahl schreibt die Beschriftung `Prozess [ID]`; daraus entsteht der dataState.
 */
export default class StatusPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn', 'bpmnjs'];

  private i18n: BestbpmnI18n;
  private states: StatusDefinition[];

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined, private bpmnjs: any) {
    this.i18n = resolveI18n(config);
    this.states = config?.states ?? [];
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      if (!is(bo, 'bpmn:DataObjectReference')) {
        return groups;
      }
      const { t } = this.i18n;
      const name = processObjectName(modelLanguage(this.bpmnjs.getDefinitions()));
      const isProcess = isProcessObjectName(bo.dataObjectRef?.name ?? parseStateLabel(bo.name)?.object);
      const entries = isProcess
        ? [
            {
              id: 'bestbpmn-status-state',
              component: StatusEntry,
              states: this.states,
              i18n: this.i18n,
              isEdited: isSelectEntryEdited,
            },
          ]
        : [{ id: 'bestbpmn-status-hint', component: Hint, text: t('panel.statusOnlyProcess', { name }) }];
      // Die ID unter „Allgemein“ gehört zur Referenz; alle Referenzen teilen sich ein Datenobjekt mit eigener ID.
      if (bo.dataObjectRef?.id) {
        entries.unshift({ id: 'bestbpmn-status-data-object', component: DataObjectIdEntry, i18n: this.i18n } as any);
      }
      const index = groups.findIndex((g) => g.id === 'general');
      groups.splice(index >= 0 ? index + 1 : groups.length, 0, {
        id: 'bestbpmn-status',
        label: t('panel.status'),
        entries,
      });
      return groups;
    };
  }
}

function StatusEntry(props: { element: DiagramElement; id: string; states: StatusDefinition[]; i18n: BestbpmnI18n }) {
  const { element, id, states, i18n } = props;
  const { t, language } = i18n;
  const modeling = useService('modeling');
  const bo: BusinessObject = element.businessObject;
  const current = (bo.dataState?.key as string | undefined) ?? bo.dataState?.name;
  return h(SelectEntry, {
    element,
    id,
    label: t('panel.status'),
    description: t('panel.statusDescription'),
    getValue: () => current ?? '',
    setValue: (value: string) => {
      const object =
        canonicalProcessObjectName(bo.dataObjectRef?.name) ?? canonicalProcessObjectName(parseStateLabel(bo.name)?.object);
      modeling.updateLabel(element, formatStateLabel(object ?? bo.dataObjectRef?.name, value || undefined));
    },
    getOptions: () => [
      { value: '', label: t('panel.noStatus') },
      ...states.map((s) => ({ value: s.id, label: `${catalogLabel(s, language)} (${s.id})` })),
      ...(current && !states.some((s) => s.id === current)
        ? [{ value: current, label: t('panel.notInCatalog', { name: current }) }]
        : []),
    ],
  });
}

function DataObjectIdEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const debounce = useService('debounceInput');
  return h(TextFieldEntry, {
    element,
    id,
    label: i18n.t('panel.dataObjectId'),
    description: i18n.t('panel.dataObjectIdDescription'),
    debounce,
    disabled: true,
    getValue: () => element.businessObject.dataObjectRef?.id ?? '',
    setValue: () => undefined,
  });
}

function Hint(props: { text: string }) {
  return h('div', { class: 'bio-properties-panel-description bestbpmn-empty' }, props.text);
}
