import { h } from '@bpmn-io/properties-panel/preact';
import { TextFieldEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import {
  canonicalProcessObjectName,
  catalogLabel,
  findStatus,
  formatStateLabel,
  isProcessObjectName,
  modelLanguage,
  parseStateLabel,
  processObjectName,
  type StatusDefinition,
} from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { RolePicker } from './RolePicker';
import { pickerTexts, type RoleOption } from './roleOptions';
import { is, usedStatuses, type BusinessObject, type DiagramElement } from './util';

const LOW_PRIORITY = 600;

/**
 * Status einer Referenz auf das Datenobjekt „Prozess“ als Suchfeld: Status aus dem Katalog,
 * Status, die im Modell schon vorkommen, oder ein frei eingegebener Name.
 * Die Auswahl schreibt die Beschriftung `Prozess [Status]`; daraus entsteht der dataState.
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
  const bpmnjs = useService('bpmnjs');
  const bo: BusinessObject = element.businessObject;
  // Der Wert ist der Text in der Klammer: die ID eines Katalogstatus oder der frei eingegebene Name.
  const current = parseStateLabel(bo.name)?.state ?? (bo.dataState?.name as string | undefined);
  const options: RoleOption[] = states.map((s) => ({ value: s.id, label: `${catalogLabel(s, language)} (${s.id})` }));
  for (const used of [...usedStatuses(bpmnjs.getDefinitions()), ...(current ? [current] : [])]) {
    if (!findStatus(states, used) && !options.some((o) => o.value === used)) {
      options.push({ value: used, label: states.length ? t('panel.notInCatalog', { name: used }) : used });
    }
  }
  return h(RolePicker, {
    id,
    label: t('panel.status'),
    description: t(states.length ? 'panel.statusDescription' : 'panel.statusDescriptionFree'),
    options,
    values: current ? [current] : [],
    multiple: false,
    texts: pickerTexts(i18n, 'status'),
    custom: (query: string) => {
      const name = query.replace(/[\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
      return name ? [{ value: name, label: t('picker.add.status', { name }) }] : [];
    },
    onChange: (values: string[]) => {
      const object =
        canonicalProcessObjectName(bo.dataObjectRef?.name) ?? canonicalProcessObjectName(parseStateLabel(bo.name)?.object);
      modeling.updateLabel(element, formatStateLabel(object ?? bo.dataObjectRef?.name, values[0] || undefined));
    },
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
