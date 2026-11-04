import { readAttributes } from '../attributes/read.js';
import type { ModdleElement, ModelIssue } from '../states/types.js';

type El = ModdleElement & Record<string, any>;

/** Aufgabenarten, die immer mit einem IT-Service ausgeführt werden. */
const TASK_TYPES_WITH_SERVICE = ['bpmn:UserTask', 'bpmn:ServiceTask'];

/**
 * Jede Benutzer- und Serviceaufgabe braucht mindestens einen IT-Service. Gezählt wird jeder Service
 * im Modell, egal ob er aus einem Katalog stammt oder frei eingegeben wurde. Ein fehlender Service ist
 * nur eine Warnung (gelb markiert), kein Fehler.
 */
export function checkTaskServices(elements: ModdleElement[]): ModelIssue[] {
  return (elements as El[])
    .filter((el) => TASK_TYPES_WITH_SERVICE.includes(el.$type))
    .filter((el) => !readAttributes(el).some((attribute) => attribute.services.length > 0))
    .map((el) => ({
      code: 'task-without-service' as const,
      severity: 'warning' as const,
      elementId: el.id,
      params: { element: el.name || el.id || el.$type },
    }));
}
