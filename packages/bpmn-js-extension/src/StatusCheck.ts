import { deriveFromDefinitions, type ModelIssue, type StatusModel } from '@bestbpmn/model';
import type { PraxiqConfig } from './attributes';

export const STATUS_CHANGED = 'praxiq.status.changed';
const ERROR_MARKER = 'praxiq-error';
const WARNING_MARKER = 'praxiq-warning';

/**
 * Prüft das Modell nach jeder Änderung mit denselben Regeln wie später das Deployment
 * und markiert betroffene Elemente. Ergebnis: Event `praxiq.status.changed` mit den
 * Statusmodellen aller Prozesse.
 */
export default class StatusCheck {
  static $inject = ['eventBus', 'bpmnjs', 'canvas', 'elementRegistry', 'config.praxiq'];

  private models: StatusModel[] = [];
  private marked: string[] = [];

  constructor(
    private eventBus: any,
    private bpmnjs: any,
    private canvas: any,
    private elementRegistry: any,
    private config: PraxiqConfig | undefined,
  ) {
    // Kein Rückgabewert: diagram-js bricht sonst die Weitergabe an spätere Listener ab.
    eventBus.on(['import.done', 'commandStack.changed'], () => {
      this.check();
    });
  }

  /** Das Ergebnis der letzten Prüfung. */
  getModels(): StatusModel[] {
    return this.models;
  }

  check(): StatusModel[] {
    const definitions = this.bpmnjs.getDefinitions();
    this.models = definitions ? deriveFromDefinitions(definitions, { states: this.config?.states, roles: this.config?.roles }) : [];
    this.mark(this.models.flatMap((m) => m.issues));
    this.eventBus.fire(STATUS_CHANGED, { models: this.models });
    return this.models;
  }

  private mark(issues: ModelIssue[]) {
    for (const id of this.marked) {
      if (this.elementRegistry.get(id)) {
        this.canvas.removeMarker(id, ERROR_MARKER);
        this.canvas.removeMarker(id, WARNING_MARKER);
      }
    }
    this.marked = [];
    for (const issue of issues) {
      if (issue.elementId && this.elementRegistry.get(issue.elementId)) {
        this.canvas.addMarker(issue.elementId, issue.severity === 'error' ? ERROR_MARKER : WARNING_MARKER);
        this.marked.push(issue.elementId);
      }
    }
  }
}
