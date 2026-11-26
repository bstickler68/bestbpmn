import type { ModdleElement } from '../states/types.js';
import { elementOrder } from '../report/elements.js';
import { calculateProcess, type CalculationOptions, type MissingValue } from './calc.js';
import { readAnnualOccurrence } from './read.js';

/**
 * Personalbedarf je Durchführungsverantwortung: Für jede Aufgabe mit Aufwand des D
 * gilt Aufwand je Ausführung × erwartete Ausführungen je Durchlauf × jährliches Vorkommen des Prozesses.
 * Ohne Gateways und Schleifen läuft jede Aufgabe einmal je Durchlauf; dann ist das genau
 * „Aufwand D je Ausführung × jährliches Vorkommen“. Wege, die nur manchmal genommen werden, und
 * Wiederholungen zählen mit ihrer Wahrscheinlichkeit.
 *
 * Stunden und VZÄ werden aus den ungerundeten Minuten gerechnet und erst am Ende auf zwei
 * Nachkommastellen gerundet, auch die Summen. Aufwand von E und M zählt hier nicht mit.
 */

type El = ModdleElement & Record<string, any> & { id: string };

/** Vorgabe für die Arbeitstage pro Jahr. */
export const DEFAULT_WORKING_DAYS_PER_YEAR = 220;

/**
 * Jahresarbeitszeit eines VZÄ in Stunden: Wochenarbeitszeit × Arbeitstage pro Jahr ÷ Arbeitstage
 * pro Woche, aufgerundet auf ganze Stunden. 38,5 h × 220 ÷ 5 = 1694 h.
 */
export function hoursPerFte(weeklyHours: number, workingDaysPerYear: number, workingDaysPerWeek: number): number {
  if (!(weeklyHours > 0 && workingDaysPerYear > 0 && workingDaysPerWeek > 0)) {
    throw new RangeError('Wochenarbeitszeit, Arbeitstage pro Jahr und Arbeitstage pro Woche müssen größer als 0 sein');
  }
  // Auf sechs Stellen runden, damit Gleitkommareste wie 1694,0000001 nicht eine Stunde mehr ergeben.
  return Math.ceil(Math.round(((weeklyHours * workingDaysPerYear) / workingDaysPerWeek) * 1e6) / 1e6);
}

/** Jahresarbeitszeit eines VZÄ ohne eigene Einstellung: 38,5-Stunden-Woche, 220 Arbeitstage, 5 Tage je Woche = 1694 h. */
export const DEFAULT_HOURS_PER_FTE = hoursPerFte(38.5, DEFAULT_WORKING_DAYS_PER_YEAR, 5);

export interface StaffingOptions extends Pick<CalculationOptions, 'minutesPerDay' | 'resolveProcess'> {
  /** Stunden je Vollzeitäquivalent und Jahr; Vorgabe 1694. */
  hoursPerFte?: number;
}

export interface StaffingTask {
  processId: string;
  elementId: string;
  name?: string;
  /** Bei Aufgaben aus Teilprozessen und aufgerufenen Prozessen der Weg dorthin. */
  path?: string;
  /** Aufwand des D je Ausführung in Minuten. */
  effortPerExecution: number;
  /** Erwartete Ausführungen je Jahr (Ausführungen je Durchlauf × jährliches Vorkommen), zwei Nachkommastellen. */
  executionsPerYear: number;
  hours: number;
  fte: number;
}

export interface StaffingHolder {
  /** Durchführungsverantwortung (D) im Format des Modells; `null` für Aufgaben ohne D. */
  holder: string | null;
  tasks: StaffingTask[];
  hours: number;
  fte: number;
}

export interface StaffingProcess {
  processId: string;
  name?: string;
  /** Jährliches Vorkommen; fehlt, wenn keines oder ein unlesbares eingetragen ist. */
  annualOccurrence?: number;
  /** Eingetragen, aber keine Zahl über 0. */
  invalidOccurrence?: boolean;
  hours: number;
  fte: number;
}

export interface StaffingReport {
  hoursPerFte: number;
  processes: StaffingProcess[];
  holders: StaffingHolder[];
  hours: number;
  fte: number;
  /** Aufgaben ohne Aufwand des D in Prozessen mit jährlichem Vorkommen; sie zählen nicht mit. */
  missingEffort: MissingValue[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Rechnet den Personalbedarf aller Prozesse einer Datei. Mit zählen nur Prozesse mit jährlichem
 * Vorkommen; ein Prozess, der nur aufgerufen wird, zählt über die aufrufende Aktivität mit.
 */
export function calculateStaffing(definitions: ModdleElement, options: StaffingOptions = {}): StaffingReport {
  const hoursPerFte = options.hoursPerFte && options.hoursPerFte > 0 ? options.hoursPerFte : DEFAULT_HOURS_PER_FTE;
  const roots = (((definitions as El).rootElements ?? []) as El[]).filter((r) => r.$type === 'bpmn:Process');
  const resolveProcess = options.resolveProcess ?? ((id: string) => roots.find((p) => p.id === id));
  const order = new Map(elementOrder(definitions).map((id, i) => [id, i] as const));
  const position = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;

  const minutesByHolder = new Map<string | null, { minutes: number; tasks: (StaffingTask & { minutes: number })[] }>();
  const processes: StaffingProcess[] = [];
  const missingEffort: MissingValue[] = [];

  for (const process of roots) {
    if (!((process.flowElements ?? []) as El[]).some((f) => f.$type === 'bpmn:StartEvent')) {
      continue;
    }
    const occurrence = readAnnualOccurrence(process);
    const entry: StaffingProcess = { processId: process.id, ...(process.name ? { name: process.name } : {}), hours: 0, fte: 0 };
    processes.push(entry);
    if (occurrence === undefined || Number.isNaN(occurrence)) {
      if (Number.isNaN(occurrence)) {
        entry.invalidOccurrence = true;
      }
      continue;
    }
    entry.annualOccurrence = occurrence;
    const calc = calculateProcess(process, { minutesPerDay: options.minutesPerDay ?? 480, runs: 0, resolveProcess }, definitions);
    missingEffort.push(...calc.missing.filter((m) => m.code === 'effort'));
    let processMinutes = 0;
    for (const task of calc.responsibleTasks) {
      const executions = task.executions * occurrence;
      const minutes = task.effortPerExecution * executions;
      processMinutes += minutes;
      const bucket = minutesByHolder.get(task.holder) ?? { minutes: 0, tasks: [] };
      bucket.minutes += minutes;
      bucket.tasks.push({
        processId: process.id,
        elementId: task.elementId,
        ...(task.name ? { name: task.name } : {}),
        ...(task.path ? { path: task.path } : {}),
        effortPerExecution: round2(task.effortPerExecution),
        executionsPerYear: round2(executions),
        hours: round2(minutes / 60),
        fte: round2(minutes / 60 / hoursPerFte),
        minutes,
      });
      minutesByHolder.set(task.holder, bucket);
    }
    entry.hours = round2(processMinutes / 60);
    entry.fte = round2(processMinutes / 60 / hoursPerFte);
  }

  const holders: StaffingHolder[] = [...minutesByHolder.entries()]
    .map(([holder, { minutes, tasks }]) => ({
      holder,
      // Aufgaben in der Reihenfolge der Prozessschritte; Aufgaben aufgerufener Prozesse nach der aufrufenden Aktivität.
      tasks: tasks
        .sort((a, b) => position(a.path?.split('/')[0] ?? a.elementId) - position(b.path?.split('/')[0] ?? b.elementId) || position(a.elementId) - position(b.elementId))
        .map(({ minutes: _minutes, ...task }) => task),
      hours: round2(minutes / 60),
      fte: round2(minutes / 60 / hoursPerFte),
      minutes,
    }))
    // Größter Bedarf zuerst; Aufgaben ohne D am Ende.
    .sort((a, b) => (a.holder === null ? 1 : 0) - (b.holder === null ? 1 : 0) || b.minutes - a.minutes || String(a.holder).localeCompare(String(b.holder)))
    .map(({ minutes: _minutes, ...holder }) => holder);
  const total = [...minutesByHolder.values()].reduce((sum, h) => sum + h.minutes, 0);
  return { hoursPerFte, processes, holders, hours: round2(total / 60), fte: round2(total / 60 / hoursPerFte), missingEffort };
}
