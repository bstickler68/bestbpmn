import { LEGACY_LINKS_ATTRIBUTE, legacyLinksOf } from '@bestbpmn/model';
import { findAttribute, UPDATE_ATTRIBUTE } from './attributes';
import { is, type BusinessObject, type DiagramElement } from './util';

export const SET_DOCUMENT = 'bestbpmn.document.set';
export const CONVERT_LEGACY_LINKS = 'bestbpmn.document.convertLinks';

export interface SetDocumentContext {
  /** Die Referenz im Diagramm; der Verweis steht am Datenobjekt dahinter. */
  element: DiagramElement;
  /** Schlüssel eines Dokument-Records aus einem anderen Werkzeug, z. B. `DOC-12`. bestbpmn setzt ihn nicht neu. */
  documentRef?: string;
  href?: string;
}

/**
 * Setzt den Verweis eines Datenobjekts: entweder ein Dokument-Record oder eine Web-Adresse.
 * Wer das eine setzt, löscht das andere. Ohne beides entfällt der Verweis.
 */
class SetDocumentHandler {
  static $inject = ['modeling'];

  constructor(private modeling: any) {}

  preExecute(context: SetDocumentContext) {
    const dataObject = context.element.businessObject.dataObjectRef as BusinessObject | undefined;
    if (!dataObject) {
      return;
    }
    const documentRef = context.documentRef?.trim() || undefined;
    const href = documentRef ? undefined : context.href?.trim() || undefined;
    this.modeling.updateModdleProperties(context.element, dataObject, { documentRef, href });
  }

  execute() {
    return [];
  }

  revert() {
    return [];
  }
}

/**
 * Wandelt die Links im alten Attribut „Weiterführende Dokumentation“ in Datenobjekte mit Eingabe um:
 * je Link ein Datenobjekt über der Aufgabe, benannt nach dem Titel, mit der Web-Adresse als Verweis.
 * Läuft als ein Befehl und lässt sich als Ganzes rückgängig machen.
 */
class ConvertLegacyLinksHandler {
  static $inject = ['modeling', 'commandStack'];

  constructor(
    private modeling: any,
    private commandStack: any,
  ) {}

  preExecute(context: { tasks: DiagramElement[]; converted?: number }) {
    let converted = 0;
    for (const task of context.tasks) {
      const links = legacyLinksOf(task.businessObject);
      const shape = task as DiagramElement & { x: number; y: number; width: number; parent: DiagramElement };
      links.forEach((link, index) => {
        const x = shape.x + shape.width / 2 + (index - (links.length - 1) / 2) * 60;
        const reference = this.modeling.createShape({ type: 'bpmn:DataObjectReference' }, { x, y: shape.y - 60 }, shape.parent);
        this.modeling.updateLabel(reference, link.title || link.href);
        this.commandStack.execute(SET_DOCUMENT, { element: reference, href: link.href });
        this.modeling.connect(reference, task);
        converted++;
      });
      const attribute = findAttribute(task.businessObject, LEGACY_LINKS_ATTRIBUTE);
      const others = ((attribute?.items ?? []) as BusinessObject[]).filter((item) => !is(item, 'bestadd:Link'));
      this.commandStack.execute(UPDATE_ATTRIBUTE, { element: task, key: LEGACY_LINKS_ATTRIBUTE, value: attribute?.value, items: others });
    }
    context.converted = converted;
  }

  execute() {
    return [];
  }

  revert() {
    return [];
  }
}

/** Registriert die Befehle und bietet die Umwandlung alter Links an. */
export class DocumentCommands {
  static $inject = ['commandStack', 'elementRegistry'];

  constructor(
    private commandStack: any,
    private elementRegistry: any,
  ) {
    commandStack.registerHandler(SET_DOCUMENT, SetDocumentHandler);
    commandStack.registerHandler(CONVERT_LEGACY_LINKS, ConvertLegacyLinksHandler);
  }

  /** Aufgaben mit Links im alten Attribut. */
  legacyTasks(): DiagramElement[] {
    return (this.elementRegistry.getAll() as DiagramElement[]).filter(
      (el) => el.type !== 'label' && is(el.businessObject, 'bpmn:Activity') && legacyLinksOf(el.businessObject).length > 0,
    );
  }

  /** Wandelt alle alten Links um und meldet, wie viele Datenobjekte entstanden sind. */
  convertLegacyLinks(): number {
    const tasks = this.legacyTasks();
    if (!tasks.length) {
      return 0;
    }
    const context: { tasks: DiagramElement[]; converted?: number } = { tasks };
    this.commandStack.execute(CONVERT_LEGACY_LINKS, context);
    return context.converted ?? 0;
  }
}
