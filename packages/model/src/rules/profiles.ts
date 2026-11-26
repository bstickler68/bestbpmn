import type { IssueCode, ModelIssue } from '../states/types.js';

/** Alle Prüfregeln in der Reihenfolge, in der die Einstellungen sie zeigen. */
export const ISSUE_CODES: readonly IssueCode[] = [
  'multiple-process-objects',
  'reference-without-state',
  'start-event-state',
  'unknown-state',
  'label-state-mismatch',
  'state-only-in-label',
  'input-state-never-set',
  'state-key-conflict',
  'raci-missing-responsible',
  'raci-multiple-responsible',
  'multi-instance-single-responsible',
  'raci-multiple-accountable',
  'raci-unknown-assignee',
  'raci-unknown-field',
  'lane-without-role',
  'task-without-service',
  'multiple-none-start-events',
  'service-task-without-action',
  'multiple-actions',
  'script-task-without-action',
  'internal-action-not-on-script-task',
  'flow-without-condition',
  'conditional-flows-without-default',
  'unknown-result-condition',
  'either-or-at-task',
  'result-condition-at-task',
  'choice-without-name',
  'choice-not-after-user-task',
  'choice-mixed',
  'unknown-choice-condition',
  'unknown-rule-kind',
  'rule-kind-not-allowed',
  'script-task-with-script',
  'invalid-planning-value',
  'gateway-without-probabilities',
  'probabilities-not-100',
  'boundary-without-probability',
  'accountable-without-effort',
  'task-without-value-class',
  'interface-without-type',
  'symbol-not-connected',
  'symbol-invalid-connection',
  'data-at-start-or-end',
  'document-not-input',
  'document-ref-and-href',
  'legacy-links-attribute',
];

/**
 * Regelprofile. `document` passt zu Diagrammen, die nur dokumentieren, etwa aus bpmn.io übernommene
 * Modelle ohne Zuständigkeiten: Es verlangt kein D an jeder Benutzeraufgabe, keine Rolle an jeder Lane, keine zwei D an
 * Multi-Instanz-Aufgaben, keinen IT-Service an Benutzer- und Serviceaufgaben, keine Bedingung an jedem Weg
 * nach einer Verzweigung, nur ein leeres Startereignis und keine Aktion an automatischen Aufgaben.
 * `complete` prüft alles.
 */
export type RuleProfile = 'document' | 'complete';

export const RULE_PROFILES: Record<RuleProfile, readonly IssueCode[]> = {
  document: [
    'raci-missing-responsible',
    'multi-instance-single-responsible',
    'lane-without-role',
    'task-without-service',
    'multiple-none-start-events',
    'service-task-without-action',
    'script-task-without-action',
    'flow-without-condition',
    'conditional-flows-without-default',
  ],
  complete: [],
};

export const DEFAULT_RULE_PROFILE: RuleProfile = 'document';

/** Die abgeschalteten Regeln eines Profils. */
export function disabledRulesOf(profile: RuleProfile): IssueCode[] {
  return [...RULE_PROFILES[profile]];
}

/** Das Profil, zu dem genau diese abgeschalteten Regeln passen; sonst `undefined` (eigene Auswahl). */
export function matchRuleProfile(disabled: Iterable<IssueCode>): RuleProfile | undefined {
  const wanted = [...new Set(disabled)].sort().join();
  return (Object.keys(RULE_PROFILES) as RuleProfile[]).find((p) => [...RULE_PROFILES[p]].sort().join() === wanted);
}

/** Entfernt Meldungen abgeschalteter Regeln. */
export function filterIssues(issues: ModelIssue[], disabled: Iterable<IssueCode> | undefined): ModelIssue[] {
  const off = new Set(disabled ?? []);
  return off.size ? issues.filter((issue) => !off.has(issue.code)) : issues;
}

export function isIssueCode(value: unknown): value is IssueCode {
  return typeof value === 'string' && (ISSUE_CODES as readonly string[]).includes(value);
}
