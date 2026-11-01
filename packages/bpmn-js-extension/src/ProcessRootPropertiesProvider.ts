import { h } from '@bpmn-io/properties-panel/preact';
import { TextAreaEntry, TextFieldEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { processOfRoot, RENAME_PROCESS } from './processRoot';
import { is, type BusinessObject, type DiagramElement } from './util';

const LOW_PRIORITY = 300;

/**
 * Die Kollaboration steht für den ganzen Vorgang. Das Panel zeigt Name und Beschreibung wie bei
 * einem Prozess. Bei einem Pool gehören sie zum Prozess, bei mehreren zur Kollaboration.
 */
export default class ProcessRootPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn'];

  private i18n: BestbpmnI18n;

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined) {
    this.i18n = resolveI18n(config);
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      if (!is(bo, 'bpmn:Collaboration')) {
        return groups;
      }
      const process = processOfRoot(bo) ?? bo;
      const general = groups.find((g) => g.id === 'general');
      general?.entries.unshift({ id: 'bestbpmn-process-name', component: ProcessNameEntry, process: bo, i18n: this.i18n });
      const documentation = groups.find((g) => g.id === 'documentation');
      if (documentation) {
        documentation.entries = [{ id: 'bestbpmn-process-documentation', component: ProcessDocumentationEntry, process, i18n: this.i18n }];
      }
      return groups;
    };
  }
}

function ProcessNameEntry(props: { element: DiagramElement; id: string; process: BusinessObject; i18n: BestbpmnI18n }) {
  const { element, id, process, i18n } = props;
  const commandStack = useService('commandStack');
  const debounce = useService('debounceInput');
  return h(TextFieldEntry, {
    element,
    id,
    label: i18n.t('panel.processName'),
    debounce,
    getValue: () => process.name ?? processOfRoot(process)?.name ?? '',
    setValue: (name: string) => commandStack.execute(RENAME_PROCESS, { element, name: name ?? '' }),
  });
}

function ProcessDocumentationEntry(props: { element: DiagramElement; id: string; process: BusinessObject; i18n: BestbpmnI18n }) {
  const { element, id, process, i18n } = props;
  const modeling = useService('modeling');
  const bpmnFactory = useService('bpmnFactory');
  const debounce = useService('debounceInput');
  return h(TextAreaEntry, {
    element,
    id,
    label: i18n.t('panel.processDocumentation'),
    debounce,
    rows: 4,
    getValue: () => ((process.documentation ?? []) as BusinessObject[]).map((d) => d.text ?? '').join('\n\n'),
    setValue: (text: string) => {
      const documentation = text
        ? [Object.assign(bpmnFactory.create('bpmn:Documentation', { text, textFormat: 'text/markdown' }), { $parent: process })]
        : [];
      modeling.updateModdleProperties(element, process, { documentation });
    },
  });
}
