import { TextFieldEntry } from '@bpmn-io/properties-panel';
import { h } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';
import { is, type DiagramElement } from './util';

const LOW_PRIORITY = 300;

/**
 * IDs vergibt das System. Das Panel zeigt sie nur noch an (zum Kopieren), damit Verweise auf
 * Elemente und Prozesse stabil bleiben. Gilt für die ID jedes Elements und die Prozess-ID eines Pools.
 */
export default class ReadOnlyIdsProvider {
  static $inject = ['propertiesPanel'];

  constructor(propertiesPanel: any) {
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(_element: DiagramElement) {
    return (groups: any[]) => {
      for (const group of groups) {
        for (const entry of group.entries ?? []) {
          if (entry.id === 'id') {
            Object.assign(entry, { component: ElementIdEntry, isEdited: undefined });
          } else if (entry.id === 'processId') {
            Object.assign(entry, { component: ProcessIdEntry, isEdited: undefined });
          }
        }
      }
      return groups;
    };
  }
}

function ElementIdEntry(props: { element: DiagramElement; id: string }) {
  const { element, id } = props;
  const translate = useService('translate');
  return h(ReadOnlyEntry, {
    element,
    id,
    label: translate(is(element.businessObject, 'bpmn:Participant') ? 'Participant ID' : 'ID'),
    value: element.businessObject.id ?? '',
  });
}

function ProcessIdEntry(props: { element: DiagramElement; id: string }) {
  const { element, id } = props;
  const translate = useService('translate');
  return h(ReadOnlyEntry, { element, id, label: translate('Process ID'), value: element.businessObject.processRef?.id ?? '' });
}

function ReadOnlyEntry(props: { element: DiagramElement; id: string; label: string; value: string }) {
  const debounce = useService('debounceInput');
  return h(TextFieldEntry, {
    element: props.element,
    id: props.id,
    label: props.label,
    debounce,
    disabled: true,
    getValue: () => props.value,
    setValue: () => undefined,
  });
}
