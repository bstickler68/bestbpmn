import { is, type BusinessObject } from './util';

export const RENAME_PROCESS = 'praxiq.process.rename';

/**
 * Lanes gibt es in BPMN nur in einem Pool, und ein Pool steht immer in einer Collaboration.
 * PRAXIQ nutzt davon nur den einfachen Fall: genau ein Pool, der den Prozess darstellt (ADR 0013).
 * Dann ist die Collaboration nur die Hülle, und der Prozess wird genauso behandelt wie ohne Lanes.
 */
export function singleParticipant(collaboration: BusinessObject | undefined): BusinessObject | undefined {
  if (!is(collaboration, 'bpmn:Collaboration')) {
    return undefined;
  }
  const participants = ((collaboration!.participants ?? []) as BusinessObject[]).filter((p) => p.processRef);
  return participants.length === 1 ? participants[0] : undefined;
}

/** Der Prozess hinter der Collaboration, wenn es genau einen Pool gibt. */
export function processOfRoot(bo: BusinessObject | undefined): BusinessObject | undefined {
  return singleParticipant(bo)?.processRef;
}

/**
 * Benennt das Modell um. Der Name der Kollaboration ist der des Haupttasks (ADR 0014). Bei nur einem Pool
 * heißt der Prozess gleich. Pools behalten ihren eigenen Namen, z. B. die Organisation oder Abteilung.
 */
export class RenameProcessHandler {
  static $inject = ['modeling'];

  constructor(private modeling: any) {}

  preExecute({ element, name }: { element: any; name: string }) {
    const collaboration = element.businessObject as BusinessObject;
    if (!is(collaboration, 'bpmn:Collaboration')) {
      return;
    }
    const value = name || undefined;
    const participant = singleParticipant(collaboration);
    if (participant) {
      this.modeling.updateModdleProperties(element, participant.processRef, { name: value });
    }
    this.modeling.updateModdleProperties(element, collaboration, { name: value });
  }

  execute() {
    return [];
  }

  revert() {
    return [];
  }
}

/** Registriert das gemeinsame Umbenennen von Kollaboration und Prozess. */
export class ProcessNameBehavior {
  static $inject = ['commandStack'];

  constructor(commandStack: any) {
    commandStack.registerHandler(RENAME_PROCESS, RenameProcessHandler);
  }
}

/**
 * Name des Modells für Fenstertitel, Werkzeugleiste und Dateiname: der Name der Kollaboration,
 * sonst der des (ersten) Prozesses.
 */
export function modelName(definitions: BusinessObject | undefined): string | undefined {
  const roots = (definitions?.rootElements ?? []) as BusinessObject[];
  const named = (type: string) => roots.find((root) => is(root, type) && (root.name as string | undefined)?.trim());
  return ((named('bpmn:Collaboration') ?? named('bpmn:Process'))?.name as string | undefined)?.trim();
}

/** Dateiname aus dem Modellnamen, z. B. „Incident bearbeiten“ → `Incident bearbeiten.bpmn`. */
export function fileNameFor(name: string | undefined): string {
  const safe = (name ?? '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${safe || 'process'}.bpmn`;
}
