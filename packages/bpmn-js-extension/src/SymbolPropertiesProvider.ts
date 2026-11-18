import { h } from '@bpmn-io/properties-panel/preact';
import { isSelectEntryEdited, isTextFieldEntryEdited, SelectEntry, TextFieldEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { INTERFACE_TYPES, symbolKind } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { sortByLabel } from './roleOptions';
import type { DiagramElement } from './util';

const LOW_PRIORITY = 600;

/**
 * Eigenschaften der Prozess- und Schnittstellensymbole: Name, beim Prozesssymbol eine freie Kennung des Prozesses,
 * bei der Schnittstelle der Typ. Die Gruppen für gewöhnliche Textanmerkungen bleiben unverändert.
 */
export default class SymbolPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn'];

  private i18n: BestbpmnI18n;

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined) {
    this.i18n = resolveI18n(config);
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const kind = symbolKind(element.businessObject as any);
      if (!kind) {
        return groups;
      }
      const i18n = this.i18n;
      const entries = [
        { id: 'bestbpmn-symbol-name', component: NameEntry, i18n, isEdited: isTextFieldEntryEdited },
        kind === 'process'
          ? { id: 'bestbpmn-symbol-process-ref', component: ProcessRefEntry, i18n, isEdited: isTextFieldEntryEdited }
          : { id: 'bestbpmn-symbol-interface-type', component: InterfaceTypeEntry, i18n, isEdited: isSelectEntryEdited },
      ];
      const general = groups.find((g) => g.id === 'general');
      const index = groups.indexOf(general);
      groups.splice(index >= 0 ? index + 1 : 0, 0, { id: 'bestbpmn-symbol', label: i18n.t(`symbol.${kind}`), entries });
      return groups;
    };
  }
}

function NameEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const modeling = useService('modeling');
  const debounce = useService('debounceInput');
  return h(TextFieldEntry, {
    element,
    id,
    label: i18n.t('symbol.name'),
    debounce,
    getValue: () => element.businessObject.text ?? '',
    setValue: (text: string) => modeling.updateProperties(element, { text: text || undefined }),
  });
}

function ProcessRefEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const modeling = useService('modeling');
  const debounce = useService('debounceInput');
  return h(TextFieldEntry, {
    element,
    id,
    label: i18n.t('symbol.processRef'),
    description: i18n.t('symbol.processRefHint'),
    debounce,
    getValue: () => element.businessObject.processRef ?? '',
    setValue: (value: string) => modeling.updateProperties(element, { processRef: value?.trim() || undefined }),
  });
}

function InterfaceTypeEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const modeling = useService('modeling');
  const current: string | undefined = element.businessObject.interfaceType;
  // Nach Anzeigenamen sortiert; „kein Typ“ bleibt vorn.
  const options = [
    { value: '', label: i18n.t('symbol.noType') },
    ...sortByLabel(
      INTERFACE_TYPES.map((type) => ({ value: type as string, label: i18n.t(`interfaceType.${type}`) })),
      i18n.language,
    ),
    ...(current && !(INTERFACE_TYPES as readonly string[]).includes(current) ? [{ value: current, label: i18n.t('symbol.unknownType', { type: current }) }] : []),
  ];
  return h(SelectEntry, {
    element,
    id,
    label: i18n.t('symbol.interfaceType'),
    getValue: () => current ?? '',
    setValue: (value: string) => modeling.updateProperties(element, { interfaceType: value || undefined }),
    getOptions: () => options,
  });
}
