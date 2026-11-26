import { findTiming } from '@bestbpmn/model';
import type { BusinessObject, DiagramElement } from './util';

export const UPDATE_TIMING = 'bestbpmn.timing.update';
export const SET_ANNUAL_OCCURRENCE = 'bestbpmn.timing.annualOccurrence';

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

/**
 * Liest eine Eingabe für das jährliche Vorkommen: `1200`, `1.200`, `1 200` oder `0,5`.
 * `undefined`, wenn das keine Zahl über 0 ist.
 */
export function parseOccurrenceInput(text: string): number | undefined {
  const value = text.trim().replace(/[\s\u00a0\u202f']+/g, '');
  // Punkte als Tausendertrennzeichen nur in der Form 1.200 oder 12.000.000.
  const normalized = /^\d{1,3}(\.\d{3})+$/.test(value) ? value.replace(/\./g, '') : value.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return undefined;
  }
  const number = Number(normalized);
  return number > 0 ? number : undefined;
}

export interface SetAnnualOccurrenceContext {
  element: DiagramElement;
  /** Die Prozesse, die den Wert bekommen: der Prozess selbst, der eines Pools oder alle Pools einer Kollaboration. */
  processes: BusinessObject[];
  /** Zahl als Text, z. B. `1200` oder `0.5`; leer entfernt das Attribut. */
  value?: string;
}

/** Setzt das jährliche Vorkommen an einem oder mehreren Prozessen in einem Schritt, der sich rückgängig machen lässt. */
export class SetAnnualOccurrenceHandler {
  static $inject = ['modeling'];

  constructor(private modeling: any) {}

  preExecute({ element, processes, value }: SetAnnualOccurrenceContext) {
    const next = value?.trim() || undefined;
    for (const process of processes) {
      if ((process.annualOccurrence || undefined) !== next) {
        this.modeling.updateModdleProperties(element, process, { annualOccurrence: next });
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

/** Registriert die Befehle beim Start des Modellierers. */
export class TimingCommands {
  static $inject = ['commandStack'];

  constructor(commandStack: any) {
    commandStack.registerHandler(UPDATE_TIMING, UpdateTimingHandler);
    commandStack.registerHandler(SET_ANNUAL_OCCURRENCE, SetAnnualOccurrenceHandler);
  }
}
