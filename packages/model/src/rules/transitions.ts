import type { ModdleElement, ModelIssue, StatusChange } from '../states/types.js';

type El = ModdleElement & Record<string, any>;

/**
 * Arten von Regeln an einer Aktivität. Im Modell stehen nur Kennzeichen und Beschreibung; was genau
 * geprüft oder getan wird, legt das Werkzeug fest, das das Modell ausführt.
 */
export const RULE_KINDS = ['condition', 'validator', 'screen', 'start_action', 'follow_action'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

/** Aktivitäten, die niemand abschließt, haben nur Start- und Folgeaktionen. */
export const ACTION_RULE_KINDS: readonly RuleKind[] = ['start_action', 'follow_action'];

export interface RuleMarks {
  kinds: RuleKind[];
  /** Kennzeichen, die bestbpmn nicht kennt; sie bleiben erhalten und werden gemeldet. */
  unknownKinds: string[];
  description?: string;
}

/** Variable mit dem Ergebnis, das die Person beim Abschluss der Aufgabe davor gewählt hat. */
export const RESULT_VARIABLE = 'result';

/** Ältere Modelle verwenden diese Namen für dieselbe Variable; sie werden beim Lesen ebenfalls erkannt. */
export const LEGACY_RESULT_VARIABLES: readonly string[] = ['praxiqResult'];

/** Bedingung für einen Sequenzfluss, der nach dem gewählten Ergebnis verzweigt. */
export function resultCondition(key: string): string {
  return `\${${RESULT_VARIABLE} == '${key}'}`;
}

const RESULT_PATTERN = new RegExp(
  `^\\s*\\$\\{\\s*(?:${[RESULT_VARIABLE, ...LEGACY_RESULT_VARIABLES].join('|')})\\s*==\\s*(['"])([^'"]+)\\1\\s*\\}\\s*$`,
);

/** Liest den Statusschlüssel aus `${result == 'key'}`; sonst `undefined`. */
export function parseResultCondition(body: string | undefined): string | undefined {
  return RESULT_PATTERN.exec(body ?? '')?.[2];
}

/** Kennzeichen und Beschreibung der Regeln an einer Aktivität (`bestadd:rules`). */
export function readRuleMarks(el: ModdleElement): RuleMarks | undefined {
  const container = (((el as El).extensionElements?.values ?? []) as El[]).find((v) => v.$type === 'bestadd:Rules');
  if (!container) {
    return undefined;
  }
  const tokens = String(container.kinds ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const kinds = RULE_KINDS.filter((kind) => tokens.includes(kind));
  const unknownKinds = tokens.filter((t) => !(RULE_KINDS as readonly string[]).includes(t));
  const description = typeof container.description === 'string' && container.description.trim() ? container.description.trim() : undefined;
  return { kinds, unknownKinds, ...(description ? { description } : {}) };
}

/** Bedingungen, Prüfungen und Masken gibt es nur an Aufgaben, die eine Person abschließt. */
export function allowedRuleKinds(el: ModdleElement): readonly RuleKind[] {
  const personCompletes = ['bpmn:UserTask', 'bpmn:ManualTask', 'bpmn:Task'].includes(el.$type);
  return personCompletes ? RULE_KINDS : ACTION_RULE_KINDS;
}

const describe = (el: El) => el.name || el.id || el.$type;

/** Kennzeichen prüfen: nur bekannte Arten, und an Aufgaben ohne Person nur Aktionen. */
export function checkRuleMarks(elements: ModdleElement[]): ModelIssue[] {
  const issues: ModelIssue[] = [];
  for (const el of elements as El[]) {
    const marks = readRuleMarks(el);
    if (!marks) {
      continue;
    }
    const element = describe(el);
    for (const kind of marks.unknownKinds) {
      issues.push({ code: 'unknown-rule-kind', severity: 'error', elementId: el.id, params: { element, kind } });
    }
    const allowed = allowedRuleKinds(el);
    for (const kind of marks.kinds.filter((k) => !allowed.includes(k))) {
      issues.push({ code: 'rule-kind-not-allowed', severity: 'error', elementId: el.id, params: { element, kind } });
    }
  }
  return issues;
}

/** Eine Skriptaufgabe verweist auf eine Aktion und enthält keinen eigenen Code. */
export function checkScriptTasks(elements: ModdleElement[]): ModelIssue[] {
  return (elements as El[])
    .filter((el) => el.$type === 'bpmn:ScriptTask' && typeof el.script === 'string' && el.script.trim())
    .map((el) => ({
      code: 'script-task-with-script' as const,
      severity: 'error' as const,
      elementId: el.id,
      params: { element: describe(el) },
    }));
}

const BRANCHING_GATEWAYS = ['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway'];

function isGateway(el: El | undefined): boolean {
  return !!el && /Gateway$/.test(el.$type);
}

function isActivity(el: El | undefined): boolean {
  return !!el && (/Task$/.test(el.$type) || ['bpmn:SubProcess', 'bpmn:CallActivity', 'bpmn:Transaction', 'bpmn:AdHocSubProcess'].includes(el.$type));
}

/** Text der Bedingung; `undefined` ohne Bedingung, `''` bei einer leeren. */
export function conditionBody(flow: ModdleElement): string | undefined {
  const expression = (flow as El).conditionExpression as El | undefined;
  if (!expression) {
    return undefined;
  }
  return typeof expression.body === 'string' ? expression.body : '';
}

/**
 * Die Aktivitäten, deren Ergebnis ein Sequenzfluss lesen kann: die Quelle selbst oder, bei einem
 * Gateway, die Aktivitäten davor (auch über weitere Gateways hinweg).
 */
export function precedingActivities(flow: ModdleElement, flows?: ModdleElement[]): ModdleElement[] {
  const source = (flow as El).sourceRef as El | undefined;
  const incomingOf = (node: El): El[] =>
    flows ? (flows as El[]).filter((f) => f.$type === 'bpmn:SequenceFlow' && f.targetRef === node) : ((node.incoming ?? []) as El[]);
  if (!source) {
    return [];
  }
  if (isActivity(source)) {
    return [source];
  }
  const result: El[] = [];
  const seen = new Set<El>();
  const walk = (node: El) => {
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    for (const incoming of incomingOf(node)) {
      const previous = incoming.sourceRef as El | undefined;
      if (isActivity(previous)) {
        if (!result.includes(previous!)) {
          result.push(previous!);
        }
      } else if (isGateway(previous)) {
        walk(previous!);
      }
    }
  };
  if (isGateway(source)) {
    walk(source);
  }
  return result;
}

/** Ergebnisse (Statusschlüssel), nach denen ein Sequenzfluss verzweigen kann. */
export function resultsForFlow(flow: ModdleElement, changes: StatusChange[], flows?: ModdleElement[]): string[] {
  const keys: string[] = [];
  for (const activity of precedingActivities(flow, flows)) {
    for (const key of changes.find((c) => c.elementId === activity.id)?.outputs ?? []) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  return keys;
}

/**
 * Verzweigungen:
 * - Nach einem exklusiven oder inklusiven Gateway mit mehreren Wegen braucht jeder Weg außer dem
 *   Standardfluss eine Bedingung; sonst nimmt eine Engine einfach den ersten.
 * - Eine Bedingung auf ein Ergebnis muss zu einem Output der Aktivität davor passen.
 * - Hat eine Aufgabe nur bedingte Wege, braucht sie einen Standardfluss, sonst bleibt der Ablauf stehen,
 *   wenn keine Bedingung zutrifft.
 * - Entweder-oder gehört in ein exklusives Gateway; bedingte Wege an einer Aufgabe nur für
 *   „zusätzlich, wenn …“ neben dem normalen Weg.
 */
export function checkSequenceFlows(elements: ModdleElement[], changes: StatusChange[]): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const flows = (elements as El[]).filter((el) => el.$type === 'bpmn:SequenceFlow');
  for (const node of elements as El[]) {
    const outgoing = flows.filter((f) => f.sourceRef === node);
    if (BRANCHING_GATEWAYS.includes(node.$type) && outgoing.length > 1) {
      for (const flow of outgoing) {
        if (flow !== node.default && !conditionBody(flow)?.trim()) {
          issues.push({
            code: 'flow-without-condition',
            severity: 'error',
            elementId: flow.id,
            params: { element: describe(node), flow: describe(flow) },
          });
        }
      }
    }
    if (isActivity(node) && outgoing.length > 0) {
      const conditional = outgoing.filter((f) => conditionBody(f) !== undefined);
      if (conditional.length > 0 && conditional.length === outgoing.length && !node.default) {
        issues.push({ code: 'conditional-flows-without-default', severity: 'warning', elementId: node.id, params: { element: describe(node) } });
      }
      for (const flow of conditional.filter((f) => !conditionBody(f)?.trim())) {
        issues.push({ code: 'flow-without-condition', severity: 'error', elementId: flow.id, params: { element: describe(node), flow: describe(flow) } });
      }
      if (conditional.length > 0 && node.default) {
        issues.push({ code: 'either-or-at-task', severity: 'warning', elementId: node.id, params: { element: describe(node) } });
      }
      for (const flow of conditional.filter((f) => parseResultCondition(conditionBody(f)))) {
        issues.push({ code: 'result-condition-at-task', severity: 'warning', elementId: flow.id, params: { element: describe(node), flow: describe(flow) } });
      }
    }
  }
  for (const flow of flows) {
    const key = parseResultCondition(conditionBody(flow));
    if (key && !resultsForFlow(flow, changes, flows).includes(key)) {
      issues.push({ code: 'unknown-result-condition', severity: 'error', elementId: flow.id, params: { flow: describe(flow), state: key } });
    }
  }
  return issues;
}

/** Wer an einem Gateway entscheidet: eine Person über ihr Ergebnis, das System über Feldwerte, oder beides. */
export function gatewayDeciders(gateway: ModdleElement, flows?: ModdleElement[]): { person: boolean; system: boolean } {
  const outgoing = flows
    ? (flows as El[]).filter((f) => f.$type === 'bpmn:SequenceFlow' && f.sourceRef === gateway)
    : (((gateway as El).outgoing ?? []) as El[]);
  let person = false;
  let system = false;
  for (const flow of outgoing) {
    const body = conditionBody(flow)?.trim();
    if (!body) {
      continue;
    }
    if (parseResultCondition(body)) {
      person = true;
    } else {
      system = true;
    }
  }
  return { person, system };
}
