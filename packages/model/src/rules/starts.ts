import type { ModdleElement, ModelIssue } from '../states/types.js';

type El = ModdleElement & Record<string, any>;

/**
 * Eine Engine startet einen Prozess nur über ein Startereignis ohne Auslöser eindeutig. Weitere Wege in
 * den Prozess beginnen mit einem Nachrichtenstartereignis. Gilt für die oberste Ebene jedes Prozesses;
 * Teilprozesse haben ihren eigenen Start.
 */
export function checkStartEvents(process: ModdleElement): ModelIssue[] {
  const noneStarts = (((process as El).flowElements ?? []) as El[]).filter(
    (el) => el.$type === 'bpmn:StartEvent' && !(el.eventDefinitions?.length),
  );
  return noneStarts.slice(1).map((el) => ({
    code: 'multiple-none-start-events' as const,
    severity: 'error' as const,
    elementId: el.id,
    params: { element: el.name || el.id || el.$type, first: noneStarts[0]!.name || noneStarts[0]!.id || '' },
  }));
}
