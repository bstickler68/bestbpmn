import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import {
  canonicalProcessObjectName,
  findStatus,
  formatStateLabel,
  isProcessObjectName,
  parseStateLabel,
  stateKey,
  type StatusDefinition,
} from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { findDataObjects, findProcess, findReferences, is, type BusinessObject, type DiagramElement } from './util';

/**
 * Status nur am Datenobjekt „Prozess“.
 *
 * - Eine Referenz mit der Beschriftung `Prozess [in_review]` zeigt immer auf das eine Datenobjekt
 *   „Prozess“ des Prozesses und bekommt einen echten `bpmn:dataState` mit der Status-ID.
 *   Steht in der Klammer ein Name aus der Statustabelle, wird er durch die ID ersetzt. Ein frei
 *   eingegebener Status bleibt als Name stehen und bekommt einen Schlüssel aus seinem Namen.
 * - Jede andere Beschriftung meint ein anderes Datenobjekt. Das ist erlaubt, hat aber keinen Status.
 * - Beim Löschen einer Referenz bleibt das Datenobjekt erhalten, solange andere Referenzen darauf zeigen.
 */
export default class ProcessObjectBehavior extends CommandInterceptor {
  static $inject = ['eventBus', 'modeling', 'bpmnFactory', 'config.bestbpmn'];

  constructor(eventBus: any, modeling: any, bpmnFactory: any, config: BestbpmnConfig | undefined) {
    super(eventBus);
    const states: StatusDefinition[] | undefined = config?.states;

    const onNameChanged = (target: DiagramElement) => {
      const element = target.labelTarget ?? target;
      const bo = element.businessObject;
      if (!is(bo, 'bpmn:DataObjectReference')) {
        return;
      }
      const label = parseStateLabel(bo.name);
      const canonical = canonicalProcessObjectName(label?.object);
      const process = findProcess(bo);
      const container = bo.$parent as BusinessObject;
      const current = bo.dataObjectRef as BusinessObject | undefined;
      const shared = () => !!current && findReferences(process, current).some((ref) => ref !== bo);

      const createDataObject = (name: string | undefined) => {
        const dataObject = bpmnFactory.create('bpmn:DataObject', name ? { name } : {});
        dataObject.$parent = container;
        modeling.updateModdleProperties(element, container, {
          flowElements: [...(container.flowElements ?? []), dataObject],
        });
        modeling.updateModdleProperties(element, bo, { dataObjectRef: dataObject });
      };

      if (!canonical) {
        // Weg vom Datenobjekt „Prozess“: Die Referenz bekommt ein eigenes Datenobjekt und verliert den Status.
        if (current && isProcessObjectName(current.name)) {
          if (shared()) {
            createDataObject(label?.object);
          } else {
            modeling.updateModdleProperties(element, current, { name: label?.object });
          }
        } else if (current && !current.name && label?.object) {
          modeling.updateModdleProperties(element, current, { name: label.object });
        }
        if (bo.dataState) {
          modeling.updateModdleProperties(element, bo, { dataState: undefined });
        }
        return;
      }

      const processObject = findDataObjects(process).find((d) => isProcessObjectName(d.name));
      if (processObject && processObject !== current) {
        modeling.updateModdleProperties(element, bo, { dataObjectRef: processObject });
        removeIfUnused(current);
      } else if (!processObject) {
        if (current && !shared()) {
          modeling.updateModdleProperties(element, current, { name: canonical });
        } else {
          createDataObject(canonical);
        }
      }

      // Ein Status aus dem Katalog steht mit seiner ID im Modell. Ein frei eingegebener Status behält seinen
      // Namen; sein Schlüssel wird daraus gebildet (`In Prüfung` → `in_pruefung`).
      const status = label?.state ? (findStatus(states, label.state)?.id ?? label.state) : undefined;
      const key = status && findStatus(states, status) ? status : status ? stateKey(status) || status : undefined;
      if (status && (bo.dataState?.name !== status || bo.dataState?.key !== key)) {
        modeling.updateModdleProperties(element, bo, {
          dataState: bpmnFactory.create('bpmn:DataState', { name: status, key }),
        });
      } else if (!status && bo.dataState) {
        modeling.updateModdleProperties(element, bo, { dataState: undefined });
      }

      // Einheitliche Schreibweise: `Prozess [ID]`. Der zweite Durchlauf ändert nichts mehr.
      const wanted = formatStateLabel(canonical, status);
      if (bo.name !== wanted) {
        modeling.updateLabel(element, wanted);
      }

      function removeIfUnused(dataObject: BusinessObject | undefined) {
        if (!dataObject || findReferences(process, dataObject).some((ref) => ref !== bo)) {
          return;
        }
        const owner = dataObject.$parent as BusinessObject;
        modeling.updateModdleProperties(element, owner, {
          flowElements: owner.flowElements.filter((el: BusinessObject) => el !== dataObject),
        });
      }
    };

    this.postExecute('element.updateLabel', (event: any) => onNameChanged(event.context.element));
    this.postExecute('element.updateProperties', (event: any) => {
      if ('name' in (event.context.properties ?? {})) {
        onNameChanged(event.context.element);
      }
    });

    // Beim Löschen entfernt bpmn-js auch das DataObject aus dem Prozess. Teilen sich
    // mehrere Referenzen das DataObject, lösen wir die gelöschte Referenz vorher davon.
    // Das läuft als eigener Befehl, damit Rückgängig die Verbindung wiederherstellt.
    this.preExecute('shape.delete', (event: any) => {
      const shape = event.context.shape as DiagramElement;
      const bo = shape.businessObject;
      if (!is(bo, 'bpmn:DataObjectReference') || shape.type === 'label' || !bo.dataObjectRef) {
        return;
      }
      const others = findReferences(findProcess(bo), bo.dataObjectRef).filter((ref) => ref !== bo);
      if (others.length > 0) {
        modeling.updateModdleProperties(shape, bo, { dataObjectRef: undefined });
      }
    });
  }
}
