import { readActions, readAttributes } from '../attributes/read.js';
import type { ModdleElement, ModelIssue } from '../states/types.js';

type El = ModdleElement & Record<string, any>;

/** Aufgabenarten, die immer mit einem IT-Service ausgeführt werden. */
const TASK_TYPES_WITH_SERVICE = ['bpmn:UserTask', 'bpmn:ServiceTask'];

/** Aufgaben, die das System ausführt. */
export const AUTOMATED_TASK_TYPES: readonly string[] = ['bpmn:ServiceTask', 'bpmn:SendTask', 'bpmn:BusinessRuleTask', 'bpmn:ScriptTask'];

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

/**
 * Aktionen: Eine Aktivität hat höchstens eine. Eine automatische Aufgabe braucht im
 * Profil „Vollständig“ eine, denn sonst weiß das System nicht, was es tun soll. Die Aktion steht als
 * `bestadd:actionRef` unter dem IT-Service; ob es sie gibt, prüft erst das ausführende System.
 */
export function checkTaskActions(elements: ModdleElement[]): ModelIssue[] {
  const issues: ModelIssue[] = [];
  for (const el of elements as El[]) {
    const actions = readActions(el);
    const internal = readInternalActions(el).length > 0;
    const element = el.name || el.id || el.$type;
    if (actions.length > 1 || (internal && actions.length > 0)) {
      issues.push({ code: 'multiple-actions', severity: 'error', elementId: el.id, params: { element } });
    }
    if (el.$type === 'bpmn:ScriptTask') {
      // Eine Skriptaufgabe führt eine interne Aktion aus, keine Aktion eines IT-Service.
      if (!internal) {
        issues.push({ code: 'script-task-without-action', severity: 'error', elementId: el.id, params: { element } });
      }
    } else if (internal) {
      issues.push({ code: 'internal-action-not-on-script-task', severity: 'error', elementId: el.id, params: { element } });
    } else if (AUTOMATED_TASK_TYPES.includes(el.$type) && actions.length === 0) {
      issues.push({ code: 'service-task-without-action', severity: 'error', elementId: el.id, params: { element } });
    }
  }
  return issues;
}

/** Schlüssel des Zusatzattributs, mit dem eine Skriptaufgabe ihren internen Aktionstyp nennt. */
export const INTERNAL_ACTION_ATTRIBUTE = 'internalAction';

/**
 * Interne Aktionstypen einer Skriptaufgabe in der Reihenfolge, in der sie laufen, z. B. `create_record
 * link_records`. Sie stehen als `<bestadd:attribute key="internalAction" value="…"/>`
 * im Modell, durch Leerzeichen getrennt; die Parameter kennt erst das ausführende System.
 */
export function readInternalActions(element: ModdleElement): string[] {
  const value = readAttributes(element).find((a) => a.key === INTERNAL_ACTION_ATTRIBUTE)?.value;
  return typeof value === 'string' ? parseInternalActions(value) : [];
}

/** Liste der Aktionstypen aus dem Wert des Attributs. */
export function parseInternalActions(value: string): string[] {
  return value.split(/[\s,]+/).filter(Boolean);
}
