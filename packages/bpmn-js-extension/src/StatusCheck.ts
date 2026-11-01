import { deriveFromDefinitions, type IssueCode, type ModelIssue, type StatusModel } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';

export const STATUS_CHANGED = 'bestbpmn.status.changed';
const ERROR_MARKER = 'bestbpmn-error';
const WARNING_MARKER = 'bestbpmn-warning';

/**
 * Prüft das Modell nach jeder Änderung mit denselben Regeln wie später das Deployment
 * und markiert betroffene Elemente. Ergebnis: Event `bestbpmn.status.changed` mit den
 * Statusmodellen aller Prozesse.
 */
export default class StatusCheck {
  static $inject = ['eventBus', 'bpmnjs', 'canvas', 'elementRegistry', 'config.bestbpmn'];

  private models: StatusModel[] = [];
  private marked: string[] = [];
  private disabledRules: IssueCode[];

  constructor(
    private eventBus: any,
    private bpmnjs: any,
    private canvas: any,
    private elementRegistry: any,
    private config: BestbpmnConfig | undefined,
  ) {
    this.disabledRules = [...(config?.disabledRules ?? [])];
    // Kein Rückgabewert: diagram-js bricht sonst die Weitergabe an spätere Listener ab.
    eventBus.on(['import.done', 'commandStack.changed'], () => {
      this.check();
    });
  }

  /** Das Ergebnis der letzten Prüfung. */
  getModels(): StatusModel[] {
    return this.models;
  }

  /** Schaltet Prüfregeln ab oder wieder zu und prüft sofort neu. Rückgängig bleibt erhalten. */
  setDisabledRules(rules: IssueCode[]): void {
    this.disabledRules = [...rules];
    this.check();
  }

  check(): StatusModel[] {
    const definitions = this.bpmnjs.getDefinitions();
    this.models = definitions ? deriveFromDefinitions(
          definitions,
          { states: this.config?.states?.length ? this.config.states : undefined, roles: this.config?.roles?.length ? this.config.roles : undefined },
          { disabledRules: this.disabledRules },
        ) : [];
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
