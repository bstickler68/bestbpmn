import { RULE_KINDS, type RuleKind } from '@bestbpmn/model';
import { is, type BusinessObject, type DiagramElement } from './util';

export const UPDATE_RULES = 'bestbpmn.rules.update';

export interface UpdateRulesContext {
  element: DiagramElement;
  /** Neue Kennzeichen; `undefined` lässt sie unverändert. */
  kinds?: RuleKind[];
  /** Neue Beschreibung; `undefined` lässt sie unverändert, `''` entfernt sie. */
  description?: string;
}

export function findRules(bo: BusinessObject): BusinessObject | undefined {
  return (bo.extensionElements?.values ?? []).find((v: BusinessObject) => is(v, 'bestadd:Rules'));
}

/** Gesetzte Kennzeichen in fester Reihenfolge; unbekannte bleiben in `kinds` erhalten. */
export function ruleKindsOf(bo: BusinessObject): RuleKind[] {
  const tokens = String(findRules(bo)?.kinds ?? '').split(/\s+/);
  return RULE_KINDS.filter((kind) => tokens.includes(kind));
}

/**
 * Setzt Kennzeichen und Beschreibung der Regeln in einem Schritt, der sich als Ganzes rückgängig
 * machen lässt. Legt `extensionElements` und `bestadd:rules` bei Bedarf an und räumt leere
 * Container wieder auf.
 */
export default class UpdateRulesHandler {
  static $inject = ['modeling', 'bpmnFactory'];

  constructor(
    private modeling: any,
    private bpmnFactory: any,
  ) {}

  preExecute(context: UpdateRulesContext) {
    const { element, kinds, description } = context;
    const { modeling, bpmnFactory } = this;
    const bo = element.businessObject;

    let extensionElements = bo.extensionElements;
    if (!extensionElements) {
      extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
      extensionElements.$parent = bo;
      modeling.updateModdleProperties(element, bo, { extensionElements });
    }

    let rules = findRules(bo);
    if (!rules) {
      rules = bpmnFactory.create('bestadd:Rules', {}) as BusinessObject;
      rules.$parent = extensionElements;
      modeling.updateModdleProperties(element, extensionElements, { values: [...extensionElements.values, rules] });
    }

    const unknown = String(rules.kinds ?? '')
      .split(/\s+/)
      .filter((t) => t && !(RULE_KINDS as readonly string[]).includes(t));
    const nextKinds = kinds ? [...RULE_KINDS.filter((k) => kinds.includes(k)), ...unknown].join(' ') : rules.kinds;
    const nextDescription = description === undefined ? rules.description : description.trim() ? description : undefined;
    modeling.updateModdleProperties(element, rules, { kinds: nextKinds || undefined, description: nextDescription });

    if (!rules.kinds && !rules.description) {
      const values = extensionElements.values.filter((v: BusinessObject) => v !== rules);
      modeling.updateModdleProperties(element, extensionElements, { values });
      if (!values.length) {
        modeling.updateModdleProperties(element, bo, { extensionElements: undefined });
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
export class RuleCommands {
  static $inject = ['commandStack'];

  constructor(commandStack: any) {
    commandStack.registerHandler(UPDATE_RULES, UpdateRulesHandler);
  }
}
