import type { TFunction } from '@bestbpmn/i18n';
import type { AttributeDefinition, IssueCode, RoleDefinition, Service, StatusDefinition } from '@bestbpmn/model';
import { DEFAULT_ATTRIBUTE_DEFINITIONS } from '@bestbpmn/model';
import { is, type BusinessObject, type DiagramElement } from './util';

/** Konfiguration des Modellierers unter `bestbpmn`. */
export interface BestbpmnConfig {
  /** Attributdefinitionen. Fehlt sie, gelten die Standardattribute. */
  attributes?: AttributeDefinition[];
  /** Service-Katalog. */
  services?: Service[];
  /** Statustabelle. Fehlt sie, sind Status Freitext. Beispiel: `templates/catalog/states.json`. */
  states?: StatusDefinition[];
  /** Rollen- und Gruppentabelle. Fehlt sie, sind Rollen und Gruppen Freitext. Beispiel: `templates/catalog/roles.json`. */
  roles?: RoleDefinition[];
  /** Abgeschaltete Prüfregeln, z. B. `disabledRulesOf('document')` aus `@bestbpmn/model`. */
  disabledRules?: IssueCode[];
  /** Sprache der Oberfläche, z. B. `de`. Standard ist Englisch. */
  language?: string;
  /** Übersetzungsfunktion aus `@bestbpmn/i18n`; fehlt sie, erzeugt der Modellierer eine eigene. */
  t?: TFunction;
}

export const UPDATE_ATTRIBUTE = 'bestbpmn.attribute.update';

export interface UpdateAttributeContext {
  element: DiagramElement;
  key: string;
  /** Neuer Textwert; `undefined` entfernt ihn. */
  value?: string;
  /** Neue Einträge (Links oder Service-Referenzen); `undefined` lässt sie unverändert. */
  items?: BusinessObject[];
}

export function findContainer(bo: BusinessObject): BusinessObject | undefined {
  return (bo.extensionElements?.values ?? []).find((v: BusinessObject) => is(v, 'bestadd:Attributes'));
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

export function resolveDefinitions(config: BestbpmnConfig | undefined): AttributeDefinition[] {
  return config?.attributes ?? DEFAULT_ATTRIBUTE_DEFINITIONS;
}

/**
 * Setzt ein Zusatzattribut in einem Schritt, der sich als Ganzes rückgängig machen lässt.
 * Legt `extensionElements`, `bestadd:attributes` und `bestadd:attribute` bei Bedarf an
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
      container = bpmnFactory.create('bestadd:Attributes', { attributes: [] }) as BusinessObject;
      container.$parent = extensionElements;
      modeling.updateModdleProperties(element, extensionElements, {
        values: [...extensionElements.values, container],
      });
    }

    let attribute = findAttribute(bo, key);
    if (!attribute) {
      attribute = bpmnFactory.create('bestadd:Attribute', { key }) as BusinessObject;
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
