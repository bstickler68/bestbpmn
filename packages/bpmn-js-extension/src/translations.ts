import { is, type BusinessObject, type DiagramElement } from './util';

export const UPDATE_TRANSLATION = 'praxiq.translation.update';

export interface UpdateTranslationContext {
  element: DiagramElement;
  /** Das BPMN-Element, dessen Text übersetzt wird (Prozess, Aktivität, Ereignis …). */
  target: BusinessObject;
  lang: string;
  name?: string;
  documentation?: string;
}

const extensionValue = (bo: BusinessObject | undefined, type: string): BusinessObject | undefined =>
  (bo?.extensionElements?.values ?? []).find((v: BusinessObject) => is(v, type));

export const findTranslations = (bo: BusinessObject) => extensionValue(bo, 'praxiq:Translations');

export function findTranslation(list: BusinessObject[] | undefined, lang: string): BusinessObject | undefined {
  return (list ?? []).find((t) => t.lang === lang);
}

/** Gemeinsame Bausteine: Container anlegen und leere wieder entfernen, alles als Teilbefehle. */
class Base {
  static $inject = ['modeling', 'bpmnFactory'];
  constructor(
    protected modeling: any,
    protected bpmnFactory: any,
  ) {}

  protected ensureExtension(element: DiagramElement, bo: BusinessObject, type: string, listProperty: string) {
    let extensionElements = bo.extensionElements;
    if (!extensionElements) {
      extensionElements = this.bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
      extensionElements.$parent = bo;
      this.modeling.updateModdleProperties(element, bo, { extensionElements });
    }
    let container = extensionValue(bo, type);
    if (!container) {
      container = this.bpmnFactory.create(type, { [listProperty]: [] }) as BusinessObject;
      container.$parent = extensionElements;
      this.modeling.updateModdleProperties(element, extensionElements, {
        values: [...extensionElements.values, container],
      });
    }
    return container;
  }

  protected removeIfEmpty(element: DiagramElement, bo: BusinessObject, container: BusinessObject, listProperty: string) {
    if (container[listProperty]?.length) {
      return;
    }
    const extensionElements = bo.extensionElements;
    const values = extensionElements.values.filter((v: BusinessObject) => v !== container);
    this.modeling.updateModdleProperties(element, extensionElements, { values });
    if (!values.length) {
      this.modeling.updateModdleProperties(element, bo, { extensionElements: undefined });
    }
  }

  /** Setzt Name und Text einer Übersetzung in `list` und entfernt sie, wenn beides leer ist. */
  protected upsertTranslation(
    element: DiagramElement,
    owner: BusinessObject,
    listProperty: string,
    lang: string,
    values: { name?: string; documentation?: string },
  ) {
    let translation = findTranslation(owner[listProperty], lang);
    if (!translation) {
      translation = this.bpmnFactory.create('praxiq:Translation', { lang }) as BusinessObject;
      translation.$parent = owner;
      this.modeling.updateModdleProperties(element, owner, { [listProperty]: [...(owner[listProperty] ?? []), translation] });
    }
    const update: Record<string, string | undefined> = {};
    if ('name' in values) update.name = values.name || undefined;
    if ('documentation' in values) update.documentation = values.documentation || undefined;
    this.modeling.updateModdleProperties(element, translation, update);
    if (!translation.name && !translation.documentation) {
      this.modeling.updateModdleProperties(element, owner, {
        [listProperty]: owner[listProperty].filter((t: BusinessObject) => t !== translation),
      });
    }
  }

  execute() {
    return [];
  }

  revert() {
    return [];
  }
}

/** Übersetzt Name und Beschreibung eines Elements in eine weitere Sprache. */
export class UpdateTranslationHandler extends Base {
  preExecute({ element, target, lang, name, documentation }: UpdateTranslationContext) {
    const container = this.ensureExtension(element, target, 'praxiq:Translations', 'translations');
    const values: { name?: string; documentation?: string } = {};
    if (name !== undefined) values.name = name;
    if (documentation !== undefined) values.documentation = documentation;
    this.upsertTranslation(element, container, 'translations', lang, values);
    this.removeIfEmpty(element, target, container, 'translations');
  }
}

/** Registriert die Übersetzungsbefehle beim Start. */
export class TranslationCommands {
  static $inject = ['commandStack'];
  constructor(commandStack: any) {
    commandStack.registerHandler(UPDATE_TRANSLATION, UpdateTranslationHandler);
  }
}
