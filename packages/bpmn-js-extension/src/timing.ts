import { findTiming } from '@bestbpmn/model';
import type { BusinessObject, DiagramElement } from './util';

export const UPDATE_TIMING = 'bestbpmn.timing.update';

/** Attribute von `bestadd:timing`; Zeiten als ISO-8601-Dauer, `instances` als Zahl, `valueClass` als Schlüssel. */
export type TimingAttribute = 'effort' | 'accountableEffort' | 'duration' | 'instances' | 'valueClass';

export interface UpdateTimingContext {
  element: DiagramElement;
  /** Attribut oder Aufwand eines M (`consulted:<zuständig>`). */
  attribute: TimingAttribute | `consulted:${string}`;
  /** Neuer Wert; leer entfernt ihn. */
  value?: string;
}

/**
 * Setzt einen Planwert in einem Schritt, der sich als Ganzes rückgängig machen lässt.
 * Legt `extensionElements` und `bestadd:timing` bei Bedarf an und räumt leere Container wieder auf.
 */
export default class UpdateTimingHandler {
  static $inject = ['modeling', 'bpmnFactory'];

  constructor(
    private modeling: any,
    private bpmnFactory: any,
  ) {}

  preExecute(context: UpdateTimingContext) {
    const { element, attribute } = context;
    const value = context.value?.trim() || undefined;
    const { modeling, bpmnFactory } = this;
    const bo = element.businessObject;

    let extensionElements = bo.extensionElements;
    let timing = findTiming(bo as any) as BusinessObject | undefined;
    if (!timing && !value) {
      return;
    }
    if (!extensionElements) {
      extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
      extensionElements.$parent = bo;
      modeling.updateModdleProperties(element, bo, { extensionElements });
    }
    if (!timing) {
      timing = bpmnFactory.create('bestadd:Timing', {}) as BusinessObject;
      timing.$parent = extensionElements;
      modeling.updateModdleProperties(element, extensionElements, { values: [...extensionElements.values, timing] });
    }

    if (attribute.startsWith('consulted:')) {
      const assignee = attribute.slice('consulted:'.length);
      const others = ((timing.consultedEfforts ?? []) as BusinessObject[]).filter((c) => c.assignee !== assignee);
      let next = others;
      if (value) {
        const entry = bpmnFactory.create('bestadd:ConsultedEffort', { assignee, effort: value }) as BusinessObject;
        entry.$parent = timing;
        next = [...others, entry];
      }
      modeling.updateModdleProperties(element, timing, { consultedEfforts: next });
    } else {
      modeling.updateModdleProperties(element, timing, { [attribute]: value });
    }

    const empty =
      !timing.effort && !timing.accountableEffort && !timing.duration && !timing.instances && !timing.valueClass && !((timing.consultedEfforts ?? []) as unknown[]).length;
    if (empty) {
      const values = extensionElements.values.filter((v: BusinessObject) => v !== timing);
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
export class TimingCommands {
  static $inject = ['commandStack'];

  constructor(commandStack: any) {
    commandStack.registerHandler(UPDATE_TIMING, UpdateTimingHandler);
  }
}
