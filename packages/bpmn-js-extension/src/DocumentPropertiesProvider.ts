import { h } from '@bpmn-io/properties-panel/preact';
import { isTextFieldEntryEdited, TextFieldEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { isProcessObjectName, parseStateLabel, readDocumentRef } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { SET_DOCUMENT } from './documents';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { is, type DiagramElement } from './util';

const LOW_PRIORITY = 590;

/**
 * Gruppe „Unterlage“ an Datenobjekten außer „Prozess“: Verweis auf eine Web-Adresse. Hängt das Datenobjekt per
 * Eingabe an einer Aufgabe, ist es eine Unterlage dieses Schritts.
 *
 * Dokument-Records gibt es in bestbpmn nicht. Kommt ein Modell mit `bestadd:documentRef` aus einem anderen Werkzeug,
 * zeigt die Gruppe den Schlüssel nur an; er bleibt beim Speichern erhalten und lässt sich entfernen.
 */
export default class DocumentPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn'];

  private i18n: BestbpmnI18n;

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined) {
    this.i18n = resolveI18n(config);
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      if (!is(bo, 'bpmn:DataObjectReference') || !bo.dataObjectRef) {
        return groups;
      }
      if (isProcessObjectName(bo.dataObjectRef.name ?? parseStateLabel(bo.name)?.object)) {
        return groups;
      }
      const { t } = this.i18n;
      const entries: any[] = [{ id: 'bestbpmn-document-hint', component: Hint, text: t('document.hint') }];
      if (readDocumentRef(bo.dataObjectRef).documentRef) {
        entries.push({ id: 'bestbpmn-document-record', component: RecordEntry, i18n: this.i18n });
      }
      entries.push({ id: 'bestbpmn-document-href', component: HrefEntry, i18n: this.i18n, isEdited: isTextFieldEntryEdited });
      const index = groups.findIndex((g) => g.id === 'bestbpmn-status');
      groups.splice(index >= 0 ? index + 1 : groups.length, 0, {
        id: 'bestbpmn-document',
        label: t('document.group'),
        entries,
      });
      return groups;
    };
  }
}

function Hint(props: { text: string }) {
  return h('div', { class: 'bio-properties-panel-description bestbpmn-empty' }, props.text);
}

/** Ein Dokument-Record aus einem anderen Werkzeug: nur anzeigen und auf Wunsch entfernen. */
function RecordEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const { t } = i18n;
  const commandStack = useService('commandStack');
  const { documentRef, href } = readDocumentRef(element.businessObject.dataObjectRef);
  if (!documentRef) {
    return null;
  }
  return h('div', { class: 'bio-properties-panel-entry', 'data-entry-id': id }, [
    h('div', { class: 'bio-properties-panel-label' }, t('document.record')),
    h('div', { class: 'bio-properties-panel-description' }, t('document.recordKept', { key: documentRef })),
    h(
      'button',
      {
        type: 'button',
        class: 'bestbpmn-document-remove',
        onClick: () => commandStack.execute(SET_DOCUMENT, href ? { element, href } : { element }),
      },
      t('document.removeRecord'),
    ),
  ]);
}

function HrefEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const commandStack = useService('commandStack');
  const debounce = useService('debounceInput');
  return h(TextFieldEntry, {
    element,
    id,
    label: i18n.t('document.href'),
    description: i18n.t('document.hrefDescription'),
    placeholder: 'https://',
    debounce,
    // Ein Dokument-Record gilt vor der Web-Adresse; erst nach dem Entfernen ist das Feld frei.
    disabled: !!readDocumentRef(element.businessObject.dataObjectRef).documentRef,
    getValue: () => readDocumentRef(element.businessObject.dataObjectRef).href ?? '',
    setValue: (value: string) => commandStack.execute(SET_DOCUMENT, { element, href: value }),
  });
}
