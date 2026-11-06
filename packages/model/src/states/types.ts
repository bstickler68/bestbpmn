export type IssueSeverity = 'error' | 'warning';

export type IssueCode =
  | 'multiple-process-objects'
  | 'reference-without-state'
  | 'start-event-state'
  | 'unknown-state'
  | 'label-state-mismatch'
  | 'state-only-in-label'
  | 'input-state-never-set'
  | 'state-key-conflict'
  | 'raci-missing-responsible'
  | 'raci-multiple-responsible'
  | 'raci-multiple-accountable'
  | 'raci-unknown-assignee'
  | 'lane-without-role'
  | 'multi-instance-single-responsible'
  | 'task-without-service'
  | 'flow-without-condition'
  | 'conditional-flows-without-default'
  | 'unknown-result-condition'
  | 'either-or-at-task'
  | 'result-condition-at-task'
  | 'unknown-rule-kind'
  | 'rule-kind-not-allowed'
  | 'script-task-with-script';

/**
 * Ein Verstoß gegen die Modellierregeln. Enthält nur Code und Parameter;
 * den Text in der Sprache der Person erzeugt die Anzeige.
 */
export interface ModelIssue {
  code: IssueCode;
  severity: IssueSeverity;
  elementId?: string;
  /** Werte für die Platzhalter der Meldung, z. B. `element`, `state`. */
  params: Record<string, string>;
}

/**
 * Ein Schritt, nach dessen Abschluss sich der Status des Vorgangs ändert
 * oder an dem ein Status dokumentiert ist.
 */
export interface StatusChange {
  /** ID der Aktivität oder des Ereignisses im Modell. */
  elementId: string;
  elementName?: string;
  elementType: string;
  /**
   * Schlüssel der Status, die der Schritt beim Abschluss setzen kann. Leer = Status bleibt.
   * Mehr als einer = alternative Ergebnisse; die bearbeitende Person wählt einen davon.
   */
  outputs: string[];
  /** Schlüssel der Status aus Input-Verknüpfungen. Nur Dokumentation, steuert nichts. */
  documentedInputs: string[];
}

/**
 * Die abgeleiteten Status eines Vorgangs. Er gehört zu einer Kollaboration (auch mit mehreren Pools)
 * oder zu einem Prozess ohne Pool.
 */
export interface StatusModel {
  /** ID der Kollaboration, sonst des Prozesses. */
  processId: string;
  /** Name der Kollaboration (bei einem Pool ersatzweise des Prozesses), sonst des Prozesses. */
  processName?: string;
  /** IDs der Prozesse (Pools), die zu diesem Vorgang gehören. */
  processIds: string[];
  /** Das Datenobjekt „Prozess“, das den Status trägt. */
  dataObjectId?: string;
  dataObjectName?: string;
  /** Hauptsprache des Modells; in ihr stehen `name` und `documentation`. */
  language: string;
  /** Technische Schlüssel aller Status in der Reihenfolge ihres ersten Auftretens im Modell. */
  statuses: string[];
  /** Angezeigter Name je Schlüssel in der Hauptsprache; aus der Statustabelle, sonst aus dem Modell. */
  statusNames: Record<string, string>;
  /** Übersetzte Namen je Schlüssel und Sprache, z. B. `{ in_review: { en: 'In review' } }`. */
  statusTranslations: Record<string, Record<string, string>>;
  /**
   * Mögliche Anfangsstatus: je Startereignis die Status der ersten Aktivität mit Output auf „Prozess“.
   * Bis sie abgeschlossen ist, hat der Vorgang keinen Status.
   */
  initialStatuses: string[];
  changes: StatusChange[];
  issues: ModelIssue[];
}

/** Ein Element des BPMN-Objektbaums, wie bpmn-moddle es liefert. */
export interface ModdleElement {
  $type: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

/** Der Teil der bpmn-moddle-Schnittstelle, den bestbpmn nutzt. */
export interface Moddle {
  fromXML(
    xml: string,
  ): Promise<{ rootElement: ModdleElement; warnings: Error[]; elementsById: Record<string, ModdleElement> }>;
  toXML(element: ModdleElement, options?: Record<string, unknown>): Promise<{ xml: string }>;
  create(type: string, attrs?: Record<string, unknown>): ModdleElement;
}
