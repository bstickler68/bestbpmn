import type { TFunction } from '@bestbpmn/i18n';
import type { AttributeDefinition, RoleDefinition, Service, StatusDefinition } from '@bestbpmn/model';
import { DEFAULT_ATTRIBUTE_DEFINITIONS } from '@bestbpmn/model';
import { is, type BusinessObject, type DiagramElement } from './util';

/** Konfiguration des Modellierers unter `praxiq` (ADR 0009). */
export interface PraxiqConfig {
  /** Vom Administrator gepflegte Attributdefinitionen. Fehlt sie, gelten die Standardattribute. */
  attributes?: AttributeDefinition[];
  /** Service-Katalog. Später aus der CMDB von PRAXIQ. */
  services?: Service[];
  /** Statustabelle (ADR 0012). Bis zum Backend aus `templates/catalog/states.json`. */
  states?: StatusDefinition[];
  /** Rollen- und Gruppentabelle (ADR 0013). Bis zum Backend aus `templates/catalog/roles.json`. */
  roles?: RoleDefinition[];
  /** Sprache der Oberfläche, z. B. `de`. Standard ist Englisch (ADR 0010). */
  language?: string;
  /** Übersetzungsfunktion aus `@bestbpmn/i18n`; fehlt sie, erzeugt der Modellierer eine eigene. */
  t?: TFunction;
}

export const UPDATE_ATTRIBUTE = 'praxiq.attribute.update';

export interface UpdateAttributeContext {
  element: DiagramElement;
  key: string;
  /** Neuer Textwert; `undefined` entfernt ihn. */
  value?: string;
  /** Neue Einträge (Links oder Service-Referenzen); `undefined` lässt sie unverändert. */
  items?: BusinessObject[];
}

export function findContainer(bo: BusinessObject): BusinessObject | undefined {
  return (bo.extensionElements?.values ?? []).find((v: BusinessObject) => is(v, 'praxiq:Attributes'));
}

export function findAttribute(bo: BusinessObject, key: string): BusinessObject | undefined {
  return (findContainer(bo)?.attributes ?? []).find((a: BusinessObject) => a.key === key);
}

/** Attributdefinitionen, die an diesem Element angeboten werden. */
export function definitionsFor(definitions: AttributeDefinition[], bo: BusinessObject): AttributeDefinition[] {
  return definitions.filter((def) =>
    def.appliesTo?.length ? def.appliesTo.some((type) => is(bo, type)) : is(bo, 'bpmn:Activity'),
  );
}

export function resolveDefinitions(config: PraxiqConfig | undefined): AttributeDefinition[] {
  return config?.attributes ?? DEFAULT_ATTRIBUTE_DEFINITIONS;
}

/**
 * Setzt ein Zusatzattribut in einem Schritt, der sich als Ganzes rückgängig machen lässt.
 * Legt `extensionElements`, `praxiq:attributes` und `praxiq:attribute` bei Bedarf an
 * und räumt leere Container wieder auf.
 */
export default class UpdateAttributeHandler {
  static $inject = ['modeling', 'bpmnFactory'];

  constructor(
    private modeling: any,
    private bpmnFactory: any,
  ) {}

  preExecute(context: UpdateAttributeContext) {
    const { element, key, value, items } = context;
    const { modeling, bpmnFactory } = this;
    const bo = element.businessObject;

    let extensionElements = bo.extensionElements;
    if (!extensionElements) {
      extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
      extensionElements.$parent = bo;
      modeling.updateModdleProperties(element, bo, { extensionElements });
    }

    let container = findContainer(bo);
    if (!container) {
      container = bpmnFactory.create('praxiq:Attributes', { attributes: [] }) as BusinessObject;
      container.$parent = extensionElements;
      modeling.updateModdleProperties(element, extensionElements, {
        values: [...extensionElements.values, container],
      });
    }

    let attribute = findAttribute(bo, key);
    if (!attribute) {
      attribute = bpmnFactory.create('praxiq:Attribute', { key }) as BusinessObject;
      attribute.$parent = container;
      modeling.updateModdleProperties(element, container, {
        attributes: [...container.attributes, attribute],
      });
    }

    const next = items ?? attribute.items ?? [];
    for (const item of next) {
      item.$parent = attribute;
    }
    modeling.updateModdleProperties(element, attribute, { value: value || undefined, items: next });

    if (!attribute.value && !attribute.items?.length) {
      const remaining = container.attributes.filter((a: BusinessObject) => a !== attribute);
      modeling.updateModdleProperties(element, container, { attributes: remaining });
      if (!remaining.length) {
        const values = extensionElements.values.filter((v: BusinessObject) => v !== container);
        modeling.updateModdleProperties(element, extensionElements, { values });
        if (!values.length) {
          modeling.updateModdleProperties(element, bo, { extensionElements: undefined });
        }
      }
    }
  }

  execute() {
    return [];
  }

  revert() {
    return [];
  }
}

/** Registriert den Befehl beim Start des Modellierers. */
export class AttributeCommands {
  static $inject = ['commandStack'];

  constructor(commandStack: any) {
    commandStack.registerHandler(UPDATE_ATTRIBUTE, UpdateAttributeHandler);
  }
}
