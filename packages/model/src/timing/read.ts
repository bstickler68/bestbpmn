import type { ModdleElement, ModelIssue } from '../states/types.js';

/**
 * Planwerte im Modell: Aufwand und Dauer an Aktivitäten und wartenden
 * Ereignissen (`bestadd:timing`), Wahrscheinlichkeiten an Sequenzflüssen (`bestadd:probability`).
 * Die Werte beschreiben nur; sie steuern weder Ablauf noch Status noch Zuständigkeit.
 *
 * Zeiten stehen als ISO-8601-Dauer im Modell, wie bei Zeitgebern: `PT30M`, `PT1H30M`, `P2D`.
 * Tage sind Arbeitstage; wie lang einer ist, sagt erst der Kalender bei der Rechnung.
 */

type El = ModdleElement & Record<string, any>;

/** Eine Dauer, aufgeteilt in Arbeitstage und Minuten. */
export interface TimeSpan {
  days: number;
  minutes: number;
}

export interface Timing {
  /** Aufwand des D je Ausführung. */
  effort?: TimeSpan;
  /** Aufwand des E je Ausführung (Entscheidung oder Freigabe F1). */
  accountableEffort?: TimeSpan;
  /** Aufwand einzelner M; Schlüssel ist der Zuständige im Format des Modells, z. B. `role(clerk)`. */
  consultedEfforts: { assignee: string; effort: TimeSpan }[];
  /** Dauer vom Bereitstellen bis zum Abschluss, einschließlich Liegezeit; bei Ereignissen die Wartezeit. */
  duration?: TimeSpan;
  /** Erwartete Zahl der Instanzen einer Mehrfachinstanz, wenn sie nicht aus der Zahl der D folgt. */
  instances?: number;
  /** Wert der Aufgabe für die Wertschöpfungsanalyse. */
  valueClass?: ValueClass;
  /** Werte, die sich nicht lesen ließen: Attribut → Text. */
  invalid: Record<string, string>;
}

/** Bewertung einer Aufgabe in der Wertschöpfungsanalyse, in dieser Reihenfolge angezeigt. */
export const VALUE_CLASSES = ['value_adding', 'supporting', 'non_value_adding'] as const;
export type ValueClass = (typeof VALUE_CLASSES)[number];

/** Aufgaben, die in der Wertschöpfungsanalyse als Tätigkeit zählen und eine Bewertung bekommen. */
export const VALUE_TYPES = new Set([
  'bpmn:Task',
  'bpmn:UserTask',
  'bpmn:ManualTask',
  'bpmn:ServiceTask',
  'bpmn:SendTask',
  'bpmn:ReceiveTask',
  'bpmn:ScriptTask',
  'bpmn:BusinessRuleTask',
]);

/** Elementtypen, an denen Planwerte stehen können. */
export const TIMING_TYPES = new Set([
  'bpmn:Task',
  'bpmn:UserTask',
  'bpmn:ManualTask',
  'bpmn:ServiceTask',
  'bpmn:SendTask',
  'bpmn:ReceiveTask',
  'bpmn:ScriptTask',
  'bpmn:BusinessRuleTask',
  'bpmn:IntermediateCatchEvent',
]);

/** Gateways, deren Ausgänge Wahrscheinlichkeiten brauchen; bei `exclusive` und `eventBased` zusammen 100 %. */
const EITHER_OR = new Set(['bpmn:ExclusiveGateway', 'bpmn:EventBasedGateway']);
const INCLUSIVE = 'bpmn:InclusiveGateway';

const ISO = /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?)?$/;

/** Liest `PT1H30M`, `P2D` oder `P1DT4H`; Wochen, Monate und Sekunden gibt es hier nicht. */
export function parseTimeSpan(text: string | undefined): TimeSpan | undefined {
  const value = text?.trim().toUpperCase();
  const match = value ? ISO.exec(value) : null;
  if (!value || !match || value === 'P' || value.endsWith('T')) {
    return undefined;
  }
  const num = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0);
  return { days: num(match[1]), minutes: num(match[2]) * 60 + num(match[3]) };
}

/** Schreibt eine Dauer als ISO 8601, z. B. `{ days: 0, minutes: 90 }` → `PT1H30M`. */
export function formatTimeSpan(span: TimeSpan): string {
  const hours = Math.floor(span.minutes / 60);
  const minutes = Math.round((span.minutes - hours * 60) * 100) / 100;
  const time = `${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}`;
  const days = span.days ? `${span.days}D` : '';
  if (!days && !time) {
    return 'PT0M';
  }
  return `P${days}${time ? `T${time}` : ''}`;
}

/**
 * Liest eine Eingabe wie `30`, `30m`, `1,5h`, `1h30m`, `2d` oder `2d 4h` (Zahl ohne Einheit = Minuten)
 * oder eine ISO-Dauer. `undefined`, wenn das keine Dauer ist.
 */
export function parseTimeInput(text: string): TimeSpan | undefined {
  const value = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!value) {
    return undefined;
  }
  if (value.startsWith('p')) {
    return parseTimeSpan(value);
  }
  if (/^\d+(?:[.,]\d+)?$/.test(value)) {
    return { days: 0, minutes: Number(value.replace(',', '.')) };
  }
  const match = /^(?:(\d+(?:[.,]\d+)?)(?:d|at|t))?(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+(?:[.,]\d+)?)(?:m|min))?$/.exec(value);
  if (!match || (match[1] === undefined && match[2] === undefined && match[3] === undefined)) {
    return undefined;
  }
  const num = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0);
  return { days: num(match[1]), minutes: num(match[2]) * 60 + num(match[3]) };
}

/** Lesbare Kurzform für Panel und Einblendung, z. B. `1 h 30 min` oder `2 AT`. */
export function describeTimeSpan(span: TimeSpan, unit: { days: string; hours: string; minutes: string } = { days: 'AT', hours: 'h', minutes: 'min' }): string {
  const hours = Math.floor(span.minutes / 60);
  const minutes = Math.round((span.minutes - hours * 60) * 100) / 100;
  const parts = [
    span.days ? `${String(span.days).replace('.', ',')} ${unit.days}` : '',
    hours ? `${hours} ${unit.hours}` : '',
    minutes ? `${String(minutes).replace('.', ',')} ${unit.minutes}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : `0 ${unit.minutes}`;
}

export function findTiming(el: ModdleElement): El | undefined {
  return (((el as El).extensionElements?.values ?? []) as El[]).find((v) => v.$type === 'bestadd:Timing');
}

/** Planwerte eines Elements; `undefined`, wenn es keine hat. */
export function readTiming(el: ModdleElement): Timing | undefined {
  const container = findTiming(el);
  if (!container) {
    return undefined;
  }
  const invalid: Record<string, string> = {};
  const span = (name: string, text: string | undefined): TimeSpan | undefined => {
    if (text === undefined || text === '') {
      return undefined;
    }
    const parsed = parseTimeSpan(text);
    if (!parsed) {
      invalid[name] = text;
    }
    return parsed;
  };
  const timing: Timing = { consultedEfforts: [], invalid };
  const effort = span('effort', container.effort);
  const accountableEffort = span('accountableEffort', container.accountableEffort);
  const duration = span('duration', container.duration);
  if (effort) timing.effort = effort;
  if (accountableEffort) timing.accountableEffort = accountableEffort;
  if (duration) timing.duration = duration;
  if (container.instances !== undefined && container.instances !== '') {
    const instances = Number(String(container.instances).replace(',', '.'));
    if (Number.isFinite(instances) && instances > 0) {
      timing.instances = instances;
    } else {
      invalid.instances = String(container.instances);
    }
  }
  if (container.valueClass !== undefined && container.valueClass !== '') {
    if ((VALUE_CLASSES as readonly string[]).includes(String(container.valueClass))) {
      timing.valueClass = container.valueClass as ValueClass;
    } else {
      invalid.valueClass = String(container.valueClass);
    }
  }
  for (const entry of (container.consultedEfforts ?? []) as El[]) {
    const value = span(`consultedEffort:${entry.assignee ?? ''}`, entry.effort);
    if (entry.assignee && value) {
      timing.consultedEfforts.push({ assignee: String(entry.assignee), effort: value });
    }
  }
  return timing;
}

/** Wahrscheinlichkeit eines Sequenzflusses in Prozent; `NaN`, wenn der Wert keine Zahl von 0 bis 100 ist. */
export function readProbability(flow: ModdleElement): number | undefined {
  const raw = (flow as El).probability;
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const value = Number(String(raw).replace(',', '.').replace('%', '').trim());
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : Number.NaN;
}

/** Nutzt das Modell überhaupt Planwerte? Erst dann meldet die Prüfung fehlende Wahrscheinlichkeiten. */
export function usesPlanningValues(elements: ModdleElement[]): boolean {
  return (elements as El[]).some((el) => findTiming(el) || (el.$type === 'bpmn:SequenceFlow' && readProbability(el) !== undefined));
}

/**
 * Prüft die Planwerte. Alles sind Hinweise: Fehlende oder widersprüchliche Planwerte
 * verhindern das Veröffentlichen nicht, die Rechnung meldet dann „unvollständig“.
 * - Werte, die sich nicht lesen lassen.
 * - An Entweder-oder- und ereignisbasierten Gateways mit mehreren Ausgängen braucht jeder Ausgang eine
 *   Wahrscheinlichkeit, und zusammen ergeben sie 100 %. An Oder-Gateways gilt jede für sich.
 * - Grenzereignisse brauchen eine Wahrscheinlichkeit an ihrem ausgehenden Sequenzfluss: wie oft sie je
 *   Ausführung der Aktivität eintreten.
 * - Hat eine Aufgabe ein E und schon einen Aufwand des D, gehört auch der Aufwand des E dazu (F1).
 */
export function checkTiming(elements: ModdleElement[], accountableOf: (el: ModdleElement) => boolean = () => false): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const name = (el: El) => el.name || el.id || el.$type;
  for (const el of elements as El[]) {
    const timing = readTiming(el);
    if (timing) {
      for (const [attribute, value] of Object.entries(timing.invalid)) {
        issues.push({ code: 'invalid-planning-value', severity: 'warning', elementId: el.id, params: { element: name(el), attribute, value } });
      }
      if (timing.effort && !timing.accountableEffort && accountableOf(el)) {
        issues.push({ code: 'accountable-without-effort', severity: 'warning', elementId: el.id, params: { element: name(el) } });
      }
    }
    if (el.$type === 'bpmn:SequenceFlow') {
      const probability = readProbability(el);
      if (Number.isNaN(probability)) {
        issues.push({ code: 'invalid-planning-value', severity: 'warning', elementId: el.id, params: { element: name(el), attribute: 'probability', value: String(el.probability) } });
      }
    }
  }
  // Wertschöpfungsanalyse: Ist eine Aufgabe bewertet, sollen es alle sein.
  const tasks = (elements as El[]).filter((el) => VALUE_TYPES.has(el.$type));
  if (tasks.some((el) => readTiming(el)?.valueClass)) {
    for (const el of tasks.filter((t) => !readTiming(t)?.valueClass)) {
      issues.push({ code: 'task-without-value-class', severity: 'warning', elementId: el.id, params: { element: name(el) } });
    }
  }
  if (!usesPlanningValues(elements)) {
    return issues;
  }
  for (const gateway of (elements as El[]).filter((el) => EITHER_OR.has(el.$type) || el.$type === INCLUSIVE)) {
    // Aus den Sequenzflüssen, weil `outgoing` im XML fehlen darf.
    const outgoing = (elements as El[]).filter((f) => f.$type === 'bpmn:SequenceFlow' && f.sourceRef === gateway);
    if (outgoing.length < 2) {
      continue;
    }
    const values = outgoing.map(readProbability);
    if (values.some((v) => v === undefined)) {
      issues.push({ code: 'gateway-without-probabilities', severity: 'warning', elementId: gateway.id, params: { element: name(gateway) } });
      continue;
    }
    if (EITHER_OR.has(gateway.$type) && !values.some(Number.isNaN)) {
      const sum = (values as number[]).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.001) {
        issues.push({ code: 'probabilities-not-100', severity: 'warning', elementId: gateway.id, params: { element: name(gateway), sum: String(Math.round(sum * 100) / 100) } });
      }
    }
  }
  // Grenzereignisse: Die Wahrscheinlichkeit, dass sie eintreten, steht an ihrem ausgehenden Sequenzfluss.
  for (const boundary of (elements as El[]).filter((el) => el.$type === 'bpmn:BoundaryEvent')) {
    const outgoing = (elements as El[]).filter((f) => f.$type === 'bpmn:SequenceFlow' && f.sourceRef === boundary);
    if (outgoing.length && outgoing.every((f) => readProbability(f) === undefined)) {
      issues.push({ code: 'boundary-without-probability', severity: 'warning', elementId: boundary.id, params: { element: name(boundary) } });
    }
  }
  return issues;
}
