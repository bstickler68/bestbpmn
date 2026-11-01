import { readAttributes, readDescription } from '../attributes/read.js';
import type { LinkValue, ServiceRefValue } from '../attributes/types.js';
import type { ModdleElement } from '../states/types.js';
import { incoming, outgoing } from './graph.js';

type El = ModdleElement & Record<string, any>;

/** Elementtyp für den Bericht; die Anzeige übersetzt ihn. */
export type ElementType =
  | 'task'
  | 'subProcess'
  | 'callActivity'
  | 'startEvent'
  | 'intermediateEvent'
  | 'boundaryEvent'
  | 'endEvent'
  | 'gateway';

/**
 * Elementart: Aufgabenart (`user`, `manual` …), Gatewayart (`exclusive`, `parallel` …) oder
 * Ereignisart (`message`, `timer` …). `none` heißt: keine besondere Art.
 */
export type ElementKind = string;

/** Ein Verweis „weiter bei …“ auf ein anderes Element der Tabelle. */
export interface FlowReference {
  /** Nummer des Ziels, z. B. `6` oder `4.2`. */
  target: string;
  /** `back`: Rücksprung auf eine frühere Nummer. */
  direction: 'forward' | 'back';
  /** Beschriftung des Sequenzflusses, z. B. „Ja“. */
  label?: string;
  /** Standardfluss eines Gateways („sonst“). */
  isDefault?: boolean;
  /** Angeheftetes Ereignis, über das es weitergeht. */
  boundary?: { name?: string; kind: ElementKind };
}

export interface ElementRow {
  /** Laufende Nummer in Ablaufreihenfolge; in Teilprozessen mit Punkt, z. B. `4.2`. */
  number: string;
  id: string;
  type: ElementType;
  kind: ElementKind;
  /** Ereignis unterbricht die Aktivität nicht (angeheftet oder im Ereignis-Teilprozess). */
  nonInterrupting?: boolean;
  /** Aufgabe wird mehrfach ausgeführt (Multi-Instanz oder Schleife). */
  loop?: 'parallel' | 'sequential' | 'standard';
  name?: string;
  description?: string;
  services: ServiceRefValue[];
  links: LinkValue[];
  /**
   * Wo es weitergeht, wenn nicht einfach mit der nächsten Nummer: alle Zweige eines Gateways oder
   * einer Verzweigung, Sprünge, Rücksprünge und angeheftete Ereignisse. Leer = nächste Nummer oder Ende.
   */
  next: FlowReference[];
  /** Ebene: 0 im Prozess, 1 im Teilprozess usw. */
  depth: number;
}

export interface ElementTable {
  processId: string;
  processName?: string;
  rows: ElementRow[];
}

const TASK_KINDS: Record<string, string> = {
  'bpmn:Task': 'none',
  'bpmn:UserTask': 'user',
  'bpmn:ManualTask': 'manual',
  'bpmn:ServiceTask': 'service',
  'bpmn:ScriptTask': 'script',
  'bpmn:SendTask': 'send',
  'bpmn:ReceiveTask': 'receive',
  'bpmn:BusinessRuleTask': 'businessRule',
};

const GATEWAY_KINDS: Record<string, string> = {
  'bpmn:ExclusiveGateway': 'exclusive',
  'bpmn:ParallelGateway': 'parallel',
  'bpmn:InclusiveGateway': 'inclusive',
  'bpmn:EventBasedGateway': 'eventBased',
  'bpmn:ComplexGateway': 'complex',
};

const EVENT_KINDS: Record<string, string> = {
  'bpmn:MessageEventDefinition': 'message',
  'bpmn:TimerEventDefinition': 'timer',
  'bpmn:SignalEventDefinition': 'signal',
  'bpmn:ErrorEventDefinition': 'error',
  'bpmn:EscalationEventDefinition': 'escalation',
  'bpmn:ConditionalEventDefinition': 'conditional',
  'bpmn:LinkEventDefinition': 'link',
  'bpmn:CancelEventDefinition': 'cancel',
  'bpmn:CompensateEventDefinition': 'compensation',
  'bpmn:TerminateEventDefinition': 'terminate',
};

/** Typ und Art eines Flussknotens; `undefined` für alles, was nicht in die Tabelle gehört. */
export function classify(el: El): { type: ElementType; kind: ElementKind; nonInterrupting?: boolean } | undefined {
  const $type = el.$type as string;
  if (TASK_KINDS[$type]) {
    return { type: 'task', kind: TASK_KINDS[$type] };
  }
  if (GATEWAY_KINDS[$type]) {
    return { type: 'gateway', kind: GATEWAY_KINDS[$type] };
  }
  if ($type === 'bpmn:CallActivity') {
    return { type: 'callActivity', kind: 'none' };
  }
  if ($type === 'bpmn:SubProcess' || $type === 'bpmn:Transaction' || $type === 'bpmn:AdHocSubProcess') {
    const kind = $type === 'bpmn:Transaction' ? 'transaction' : $type === 'bpmn:AdHocSubProcess' ? 'adHoc' : el.triggeredByEvent ? 'event' : 'embedded';
    return { type: 'subProcess', kind };
  }
  const event: Record<string, ElementType> = {
    'bpmn:StartEvent': 'startEvent',
    'bpmn:IntermediateCatchEvent': 'intermediateEvent',
    'bpmn:IntermediateThrowEvent': 'intermediateEvent',
    'bpmn:BoundaryEvent': 'boundaryEvent',
    'bpmn:EndEvent': 'endEvent',
  };
  if (event[$type]) {
    return {
      type: event[$type],
      kind: eventKind(el),
      ...(($type === 'bpmn:BoundaryEvent' && el.cancelActivity === false) || ($type === 'bpmn:StartEvent' && el.isInterrupting === false)
        ? { nonInterrupting: true }
        : {}),
    };
  }
  return undefined;
}

/** Art eines Ereignisses aus seinen Ereignisdefinitionen; ein auslösendes Zwischenereignis ohne Definition ist `none`. */
export function eventKind(el: El): ElementKind {
  const definitions = (el.eventDefinitions ?? []) as El[];
  if (definitions.length > 1) {
    return el.parallelMultiple ? 'parallelMultiple' : 'multiple';
  }
  return definitions[0] ? (EVENT_KINDS[definitions[0].$type] ?? 'none') : 'none';
}

/** Lage der Elemente im Diagramm (für „von oben nach unten“). */
export function positions(definitions: ModdleElement): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  for (const diagram of ((definitions as El).diagrams ?? []) as El[]) {
    for (const shape of (diagram.plane?.planeElement ?? []) as El[]) {
      if (shape.bounds && shape.bpmnElement?.id) {
        result.set(shape.bpmnElement.id, { x: shape.bounds.x, y: shape.bounds.y });
      }
    }
  }
  return result;
}

/** Elementtabellen aller Prozesse (bei mehreren Pools je Pool eine). */
export function deriveElementTables(definitions: ModdleElement): ElementTable[] {
  const roots = ((definitions as El).rootElements ?? []) as El[];
  const participants = roots
    .filter((el) => el.$type === 'bpmn:Collaboration')
    .flatMap((c) => (c.participants ?? []) as El[]);
  const where = positions(definitions);
  return roots
    .filter((el) => el.$type === 'bpmn:Process')
    .map((process) => {
      const name = process.name || participants.find((p) => p.processRef === process)?.name;
      return {
        processId: process.id ?? '',
        ...(name ? { processName: name } : {}),
        rows: numberContainer(process, '', 0, where),
      };
    })
    .filter((table) => table.rows.length > 0);
}

/** Nummeriert die Flussknoten eines Prozesses oder Teilprozesses in Ablaufreihenfolge. */
function numberContainer(container: El, prefix: string, depth: number, where: Map<string, { x: number; y: number }>): ElementRow[] {
  const nodes = ((container.flowElements ?? []) as El[]).filter((el) => classify(el));
  const order = flowOrder(nodes, where);
  const numbers = new Map<El, string>();
  order.forEach((el, index) => numbers.set(el, `${prefix}${index + 1}`));
  const indexOf = new Map(order.map((el, index) => [el, index]));

  const rows: ElementRow[] = [];
  for (const el of order) {
    const info = classify(el)!;
    const attributes = readAttributes(el);
    const description = readDescription(el);
    rows.push({
      number: numbers.get(el)!,
      id: el.id ?? '',
      type: info.type,
      kind: info.kind,
      ...(info.nonInterrupting ? { nonInterrupting: true } : {}),
      ...(loopOf(el) ? { loop: loopOf(el) } : {}),
      ...(el.name ? { name: el.name } : {}),
      ...(description ? { description } : {}),
      services: dedupe(attributes.flatMap((a) => a.services), (s) => s.ref || s.name || ''),
      links: dedupe(attributes.flatMap((a) => a.links), (l) => l.href),
      next: references(el, nodes, numbers, indexOf, where),
      depth,
    });
    if (info.type === 'subProcess') {
      rows.push(...numberContainer(el, `${numbers.get(el)}.`, depth + 1, where));
    }
  }
  return rows;
}

function loopOf(el: El): ElementRow['loop'] {
  const loop = el.loopCharacteristics as El | undefined;
  if (!loop) {
    return undefined;
  }
  if (loop.$type === 'bpmn:StandardLoopCharacteristics') {
    return 'standard';
  }
  return loop.isSequential ? 'sequential' : 'parallel';
}


/**
 * Reihenfolge: Startereignisse von oben nach unten, dann entlang der Sequenzflüsse. Ein Zweig wird
 * zu Ende verfolgt, bevor der nächste beginnt; ein zusammenführendes Element kommt erst, wenn alle
 * Zweige davor nummeriert sind. Rücksprünge (Schleifen) zählen dabei nicht. Angeheftete Ereignisse
 * folgen nach dem normalen Weg ihrer Aktivität.
 */
export function flowOrder(nodes: El[], where: Map<string, { x: number; y: number }>): El[] {
  const inSet = new Set(nodes);
  const pos = (el: El) => where.get(el.id ?? '') ?? { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
  const byPosition = (a: El, b: El) => pos(a).y - pos(b).y || pos(a).x - pos(b).x;
  const boundaries = new Map<El, El[]>();
  for (const el of nodes) {
    if (el.$type === 'bpmn:BoundaryEvent' && el.attachedToRef && inSet.has(el.attachedToRef)) {
      boundaries.set(el.attachedToRef, [...(boundaries.get(el.attachedToRef) ?? []), el]);
    }
  }
  const successors = (el: El): El[] =>
    outgoing(el)
      .map((f) => f.targetRef as El)
      .filter((t) => t && inSet.has(t))
      .sort(byPosition);

  // Startpunkte: Startereignisse, sonst Knoten ohne eingehenden Fluss (keine angehefteten Ereignisse).
  const isEntry = (el: El) =>
    el.$type !== 'bpmn:BoundaryEvent' && (el.$type === 'bpmn:StartEvent' || incoming(el).filter((f) => inSet.has(f.sourceRef)).length === 0);
  const entries = nodes.filter(isEntry).sort((a, b) => {
    const startA = a.$type === 'bpmn:StartEvent' ? 0 : 1;
    const startB = b.$type === 'bpmn:StartEvent' ? 0 : 1;
    return startA - startB || byPosition(a, b);
  });

  // Rücksprünge erkennen: Kanten auf einen Knoten, der im Tiefendurchlauf gerade offen ist.
  const backEdges = new Set<El>();
  const state = new Map<El, 'open' | 'done'>();
  const visit = (el: El) => {
    state.set(el, 'open');
    const next = [...outgoing(el).filter((f) => inSet.has(f.targetRef))];
    for (const flow of next) {
      const target = flow.targetRef as El;
      if (state.get(target) === 'open') {
        backEdges.add(flow);
      } else if (!state.has(target)) {
        visit(target);
      }
    }
    for (const boundary of boundaries.get(el) ?? []) {
      if (!state.has(boundary)) {
        visit(boundary);
      }
    }
    state.set(el, 'done');
  };
  for (const entry of entries) {
    if (!state.has(entry)) {
      visit(entry);
    }
  }

  const waiting = new Map<El, number>();
  for (const el of nodes) {
    waiting.set(el, incoming(el).filter((f) => inSet.has(f.sourceRef) && !backEdges.has(f)).length);
  }
  const order: El[] = [];
  const done = new Set<El>();
  // Stapel: oben liegt, was als Nächstes kommt.
  const stack: El[] = [...entries].reverse();
  const later: El[] = [];
  const release = (el: El) => {
    const ready: El[] = [];
    for (const flow of outgoing(el)) {
      const target = flow.targetRef as El;
      if (!inSet.has(target) || backEdges.has(flow) || done.has(target)) {
        continue;
      }
      const left = waiting.get(target)! - 1;
      waiting.set(target, left);
      if (left === 0) {
        ready.push(target);
      }
    }
    ready.sort(byPosition);
    stack.push(...ready.reverse());
    // Angeheftete Ereignisse kommen erst nach dem normalen Weg dran.
    later.unshift(...(boundaries.get(el) ?? []));
  };

  while (order.length < nodes.length) {
    let next = stack.pop();
    if (!next && later.length) {
      next = later.shift();
    }
    if (!next) {
      // Rest (z. B. unverbundene Elemente oder Kreise ohne Einstieg) nach Lage.
      next = nodes.filter((el) => !done.has(el)).sort(byPosition)[0];
    }
    if (!next || done.has(next)) {
      continue;
    }
    done.add(next);
    order.push(next);
    release(next);
  }
  return order;
}

function references(
  el: El,
  nodes: El[],
  numbers: Map<El, string>,
  indexOf: Map<El, number>,
  where: Map<string, { x: number; y: number }>,
): FlowReference[] {
  const inSet = new Set(nodes);
  const self = indexOf.get(el)!;
  const flows = outgoing(el)
    .filter((f) => inSet.has(f.targetRef))
    .sort((a, b) => {
      const pa = where.get(a.targetRef.id) ?? { x: 0, y: 0 };
      const pb = where.get(b.targetRef.id) ?? { x: 0, y: 0 };
      return pa.y - pb.y || pa.x - pb.x;
    });
  const reference = (target: El, extra: Partial<FlowReference> = {}): FlowReference => ({
    target: numbers.get(target)!,
    direction: indexOf.get(target)! <= self ? 'back' : 'forward',
    ...extra,
  });
  const result: FlowReference[] = [];
  if (flows.length > 1) {
    for (const flow of flows) {
      result.push(
        reference(flow.targetRef, {
          ...(flow.name ? { label: flow.name } : {}),
          ...(el.default === flow ? { isDefault: true } : {}),
        }),
      );
    }
  } else if (flows[0] && indexOf.get(flows[0].targetRef) !== self + 1) {
    const flow = flows[0];
    result.push(reference(flow.targetRef, flow.name ? { label: flow.name } : {}));
  }
  for (const boundary of nodes.filter((n) => n.$type === 'bpmn:BoundaryEvent' && n.attachedToRef === el)) {
    result.push(reference(boundary, { boundary: { ...(boundary.name ? { name: boundary.name } : {}), kind: eventKind(boundary) } }));
  }
  return result;
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (!k || seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

export { dedupe };
