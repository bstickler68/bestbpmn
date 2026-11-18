import { readAttributes, readDescription } from '../attributes/read.js';
import type { LinkValue, ServiceRefValue } from '../attributes/types.js';
import type { ModdleElement } from '../states/types.js';
import { incoming as incomingFlows, outgoing as outgoingFlows } from './graph.js';
import { readRuleMarks, type RuleKind } from '../rules/transitions.js';
import { collectSymbolArtifacts, isAllowedSymbolConnection, symbolKind } from '../interfaces/symbols.js';

type El = ModdleElement & Record<string, any>;

/** Eine Kante im Ablauf: Sequenzfluss oder Nachrichtenfluss zwischen Pools. */
type Link = { sourceRef: El; targetRef: El };

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
   * Eingehende Daten: Datenobjekte und -speicher über Input-Verknüpfungen, auch „Prozess [Status]“,
   * und am Startereignis die Schnittstellen davor. Text wie im Diagramm.
   */
  inputs: string[];
  /** Ausgehende Daten: Output-Verknüpfungen, auch „Prozess [Status]“, und am Endereignis die Schnittstellen danach. */
  outputs: string[];
  /** Regel-Kennzeichen und ihre Beschreibung. */
  rules?: { kinds: RuleKind[]; description?: string };
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

/**
 * Ein Ablauf: alle Pools einer Kollaboration zusammen oder ein einzelner Prozess. Pools und Lanes
 * gliedern die Reihenfolge nicht; Nachrichtenflüsse verbinden die Pools wie Sequenzflüsse.
 */
export interface FlowGroup {
  id: string;
  name?: string;
  processes: El[];
  /** Nachrichtenflüsse zwischen den Pools. */
  messageFlows: El[];
}

/** Die Abläufe des Modells: je Kollaboration mit Pools einer, dazu je Prozess außerhalb einer Kollaboration einer. */
export function flowGroups(definitions: ModdleElement): FlowGroup[] {
  const roots = ((definitions as El).rootElements ?? []) as El[];
  const groups: FlowGroup[] = [];
  const covered = new Set<El>();
  for (const collaboration of roots.filter((el) => el.$type === 'bpmn:Collaboration')) {
    const pools = ((collaboration.participants ?? []) as El[]).filter((p) => p.processRef);
    if (!pools.length) {
      continue;
    }
    const processes = [...new Set(pools.map((p) => p.processRef as El))].filter((p) => !covered.has(p));
    processes.forEach((p) => covered.add(p));
    const name = collaboration.name || (pools.length === 1 ? pools[0]!.processRef.name || pools[0]!.name : undefined);
    groups.push({
      id: collaboration.id ?? '',
      ...(name ? { name } : {}),
      processes,
      messageFlows: (collaboration.messageFlows ?? []) as El[],
    });
  }
  for (const process of roots.filter((el) => el.$type === 'bpmn:Process' && !covered.has(el))) {
    groups.push({ id: process.id ?? '', ...(process.name ? { name: process.name } : {}), processes: [process], messageFlows: [] });
  }
  return groups;
}

/**
 * Die Nachrichtenflüsse als zusätzliche Kanten zwischen Knoten der obersten Ebene. Endet ein
 * Nachrichtenfluss am Pool, führt er zu dessen Startereignissen; ein Element in einem Teilprozess
 * steht für den Teilprozess.
 */
function messageLinks(nodes: El[], messageFlows: El[]): Link[] {
  const inSet = new Set(nodes);
  const lift = (el: El | undefined): El | undefined => {
    let current = el;
    while (current && !inSet.has(current)) {
      current = current.$parent;
    }
    return current;
  };
  const ends = (el: El | undefined): El[] => {
    if (!el) {
      return [];
    }
    if (el.$type === 'bpmn:Participant') {
      return ((el.processRef?.flowElements ?? []) as El[]).filter((n) => n.$type === 'bpmn:StartEvent' && inSet.has(n));
    }
    const node = lift(el);
    return node ? [node] : [];
  };
  return messageFlows.flatMap((flow) => {
    // Ein Nachrichtenfluss, der am Pool beginnt, sagt nichts über den Ablauf.
    const sources = flow.sourceRef?.$type === 'bpmn:Participant' ? [] : ends(flow.sourceRef);
    return sources.flatMap((sourceRef) =>
      ends(flow.targetRef)
        .filter((targetRef) => targetRef !== sourceRef)
        .map((targetRef) => ({ sourceRef, targetRef })),
    );
  });
}

/** Elementtabellen: je Ablauf eine, auch wenn er mehrere Pools hat. */
export function deriveElementTables(definitions: ModdleElement): ElementTable[] {
  const where = positions(definitions);
  return flowGroups(definitions)
    .map((group) => ({
      processId: group.id,
      ...(group.name ? { processName: group.name } : {}),
      rows: numberNodes(topNodes(group.processes), group.messageFlows, '', 0, where),
    }))
    .filter((table) => table.rows.length > 0);
}

const topNodes = (containers: El[]): El[] =>
  containers.flatMap((container) => ((container.flowElements ?? []) as El[]).filter((el) => classify(el)));

/**
 * Alle Flussknoten eines Ablaufs in der Reihenfolge der Elementtabelle; die Knoten eines
 * Teilprozesses folgen direkt auf ihn.
 */
export function groupOrder(group: Pick<FlowGroup, 'processes' | 'messageFlows'>, where: Map<string, { x: number; y: number }>): El[] {
  const nodes = topNodes(group.processes);
  return flowOrder(nodes, where, messageLinks(nodes, group.messageFlows)).flatMap((el) =>
    classify(el)!.type === 'subProcess' ? [el, ...tableOrder(el, where)] : [el],
  );
}

/**
 * Alle Flussknoten eines Prozesses oder Teilprozesses in der Reihenfolge der Elementtabelle; die Knoten eines
 * Teilprozesses folgen direkt auf ihn.
 */
export function tableOrder(container: El, where: Map<string, { x: number; y: number }>): El[] {
  return groupOrder({ processes: [container], messageFlows: [] }, where);
}

/** Nummeriert die Flussknoten eines Ablaufs oder Teilprozesses in Ablaufreihenfolge. */
function numberNodes(
  nodes: El[],
  messageFlows: El[],
  prefix: string,
  depth: number,
  where: Map<string, { x: number; y: number }>,
): ElementRow[] {
  const order = flowOrder(nodes, where, messageLinks(nodes, messageFlows));
  const numbers = new Map<El, string>();
  order.forEach((el, index) => numbers.set(el, `${prefix}${index + 1}`));
  const indexOf = new Map(order.map((el, index) => [el, index]));

  const rows: ElementRow[] = [];
  for (const el of order) {
    const info = classify(el)!;
    const attributes = readAttributes(el);
    const description = readDescription(el);
    const marks = readRuleMarks(el);
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
      ...dataFlow(el),
      ...(marks && (marks.kinds.length || marks.description)
        ? { rules: { kinds: marks.kinds, ...(marks.description ? { description: marks.description } : {}) } }
        : {}),
      next: references(el, nodes, numbers, indexOf, where),
      depth,
    });
    if (info.type === 'subProcess') {
      rows.push(...numberNodes(topNodes([el]), [], `${numbers.get(el)}.`, depth + 1, where));
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
 * Reihenfolge: Startereignisse in Modellierrichtung, dann entlang der Sequenzflüsse (und Nachrichtenflüsse zwischen
 * Pools). Pools und Lanes zählen nicht. Ein Zweig wird
 * zu Ende verfolgt, bevor der nächste beginnt; ein zusammenführendes Element kommt erst, wenn alle
 * Zweige davor nummeriert sind. Rücksprünge (Schleifen) zählen dabei nicht. Angeheftete Ereignisse
 * folgen nach dem normalen Weg ihrer Aktivität.
 *
 * Am Schluss steht immer ein Endereignis: das am Ende des längsten Wegs ohne angeheftete Ereignisse
 * (bei Gleichstand das letzte in Modellierrichtung). Zweige, die nicht dorthin führen (Abbrüche, weitere Enden, angeheftete
 * Ereignisse), kommen deshalb vor dem Zweig, der zu diesem Endereignis führt.
 */
export function flowOrder(nodes: El[], where: Map<string, { x: number; y: number }>, links: Link[] = []): El[] {
  const inSet = new Set(nodes);
  const outgoing = (el: El): (El | Link)[] => [...outgoingFlows(el), ...links.filter((l) => l.sourceRef === el)];
  const incoming = (el: El): (El | Link)[] => [...incomingFlows(el), ...links.filter((l) => l.targetRef === el)];
  const pos = (el: El) => where.get(el.id ?? '') ?? { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
  // Gleichrangige Knoten (Startereignisse, Zweige) in Modellierrichtung: waagrecht von links nach
  // rechts, senkrecht von oben nach unten. Pools und Lanes spielen dabei keine Rolle.
  const horizontal = isHorizontal(nodes, where);
  const byPosition = (a: El, b: El) =>
    horizontal ? pos(a).x - pos(b).x || pos(a).y - pos(b).y : pos(a).y - pos(b).y || pos(a).x - pos(b).x;
  const boundaries = new Map<El, El[]>();
  for (const el of nodes) {
    if (el.$type === 'bpmn:BoundaryEvent' && el.attachedToRef && inSet.has(el.attachedToRef)) {
      boundaries.set(el.attachedToRef, [...(boundaries.get(el.attachedToRef) ?? []), el]);
    }
  }
  // Startpunkte: Startereignisse, sonst Knoten ohne eingehenden Fluss (keine angehefteten Ereignisse).
  // Ein Startereignis, das eine Nachricht aus einem anderen Pool auslöst, ist kein eigener Anfang.
  const isEntry = (el: El) =>
    el.$type !== 'bpmn:BoundaryEvent' &&
    (el.$type === 'bpmn:StartEvent'
      ? !links.some((l) => l.targetRef === el && inSet.has(l.sourceRef))
      : incoming(el).filter((f) => inSet.has(f.sourceRef)).length === 0);
  const entries = nodes.filter(isEntry).sort((a, b) => {
    const startA = a.$type === 'bpmn:StartEvent' ? 0 : 1;
    const startB = b.$type === 'bpmn:StartEvent' ? 0 : 1;
    return startA - startB || byPosition(a, b);
  });

  // Rücksprünge erkennen: Kanten auf einen Knoten, der im Tiefendurchlauf gerade offen ist.
  const backEdges = new Set<El | Link>();
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

  // Das Endereignis, das zuletzt kommt, und alle Knoten, von denen ein Weg dorthin führt.
  const forward = (el: El): El[] => [
    ...outgoing(el)
      .filter((f) => inSet.has(f.targetRef) && !backEdges.has(f))
      .map((f) => f.targetRef as El),
    ...(boundaries.get(el) ?? []),
  ];
  // Wege über angeheftete Ereignisse sind Ausnahmen und zählen für die Wahl des letzten Endereignisses nicht.
  const finalEnd = lastEndEvent(nodes, (el) => forward(el).filter((t) => t.attachedToRef !== el), pos, horizontal);
  const toFinal = new Set<El>();
  if (finalEnd) {
    const backward = new Map<El, El[]>();
    for (const el of nodes) {
      for (const target of forward(el)) {
        backward.set(target, [...(backward.get(target) ?? []), el]);
      }
    }
    const open = [finalEnd];
    while (open.length) {
      const el = open.pop()!;
      if (!toFinal.has(el)) {
        toFinal.add(el);
        open.push(...(backward.get(el) ?? []));
      }
    }
  }
  /** Was zuerst drankommen soll, zuerst; Zweige zum letzten Endereignis ans Ende. */
  const lastToFinal = (items: El[]) => [...items.filter((el) => !toFinal.has(el)), ...items.filter((el) => toFinal.has(el))];

  const waiting = new Map<El, number>();
  for (const el of nodes) {
    waiting.set(el, incoming(el).filter((f) => inSet.has(f.sourceRef) && !backEdges.has(f)).length);
  }
  const order: El[] = [];
  const done = new Set<El>();
  // Stapel: oben liegt, was als Nächstes kommt.
  const stack: El[] = lastToFinal(entries).reverse();
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
    // Angeheftete Ereignisse kommen nach dem normalen Weg dran, außer dieser führt zum letzten Endereignis.
    const attached = (boundaries.get(el) ?? []).filter((b) => !done.has(b));
    stack.push(...lastToFinal([...ready, ...attached]).reverse());
  };

  while (order.length < nodes.length) {
    let next = stack.pop();
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

/**
 * Modellierrichtung aus der Lage der Knoten: breiter als hoch heißt waagrecht. Ohne Diagramm waagrecht.
 */
function isHorizontal(nodes: El[], where: Map<string, { x: number; y: number }>): boolean {
  const points = nodes.map((el) => where.get(el.id ?? '')).filter((p): p is { x: number; y: number } => !!p);
  if (points.length < 2) {
    return true;
  }
  const span = (values: number[]) => Math.max(...values) - Math.min(...values);
  return span(points.map((p) => p.x)) >= span(points.map((p) => p.y));
}

/**
 * Das Endereignis am Ende des längsten Wegs (Rücksprünge und angeheftete Ereignisse zählen nicht); bei Gleichstand das
 * letzte in Modellierrichtung (waagrecht das am weitesten rechts, senkrecht das unterste). `undefined`, wenn es kein
 * Endereignis gibt.
 */
function lastEndEvent(
  nodes: El[],
  forward: (el: El) => El[],
  pos: (el: El) => { x: number; y: number },
  horizontal: boolean,
): El | undefined {
  const indegree = new Map<El, number>(nodes.map((el) => [el, 0]));
  for (const el of nodes) {
    for (const target of forward(el)) {
      indegree.set(target, indegree.get(target)! + 1);
    }
  }
  const depth = new Map<El, number>();
  const queue = nodes.filter((el) => indegree.get(el) === 0);
  queue.forEach((el) => depth.set(el, 0));
  while (queue.length) {
    const el = queue.shift()!;
    for (const target of forward(el)) {
      depth.set(target, Math.max(depth.get(target) ?? 0, depth.get(el)! + 1));
      const left = indegree.get(target)! - 1;
      indegree.set(target, left);
      if (left === 0) {
        queue.push(target);
      }
    }
  }
  const ends = nodes.filter((el) => el.$type === 'bpmn:EndEvent');
  const along = (a: El, b: El) =>
    horizontal ? pos(b).x - pos(a).x || pos(b).y - pos(a).y : pos(b).y - pos(a).y || pos(b).x - pos(a).x;
  return ends.sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0) || along(a, b))[0];
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
  const flows = outgoingFlows(el)
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

/** Beschriftung eines Datenobjekts oder -speichers wie im Diagramm, z. B. „Prozess [in_review]“. */
function dataLabel(el: El | undefined): string | undefined {
  if (!el || !(el.$type === 'bpmn:DataObjectReference' || el.$type === 'bpmn:DataStoreReference')) {
    return undefined;
  }
  if (el.name) {
    return el.name as string;
  }
  const base = (el.dataObjectRef?.name ?? el.dataStoreRef?.name ?? el.id) as string | undefined;
  return base && el.dataState?.name ? `${base} [${el.dataState.name}]` : base;
}

const symbolCache = new WeakMap<object, El[]>();

/** Assoziationen an Prozess- und Schnittstellensymbolen des ganzen Modells (einmal gesammelt). */
function symbolAssociations(el: El): El[] {
  let root: El = el;
  while (root.$parent) {
    root = root.$parent;
  }
  let result = symbolCache.get(root);
  if (!result) {
    const containers = ((root.rootElements ?? []) as El[]).filter((r) => r.$type === 'bpmn:Process' || r.$type === 'bpmn:Collaboration');
    result = collectSymbolArtifacts(containers).associations.filter((a) => isAllowedSymbolConnection(a.sourceRef, a.targetRef));
    symbolCache.set(root, result);
  }
  return result;
}

/** Ein- und ausgehende Daten eines Schritts (Spalten Input und Output im Gesamtdokument). */
function dataFlow(el: El): { inputs: string[]; outputs: string[] } {
  const interfaces = (list: El[]) =>
    list.filter((s) => symbolKind(s) === 'interface').map((s) => (s.text as string | undefined) || s.id || '');
  const associations = symbolAssociations(el);
  const inputs = [
    ...((el.dataInputAssociations ?? []) as El[]).flatMap((a) => ((a.sourceRef ?? []) as El[]).map(dataLabel)),
    ...interfaces(associations.filter((a) => a.targetRef === el).map((a) => a.sourceRef)),
  ];
  const outputs = [
    ...((el.dataOutputAssociations ?? []) as El[]).map((a) => dataLabel(a.targetRef)),
    ...interfaces(associations.filter((a) => a.sourceRef === el).map((a) => a.targetRef)),
  ];
  const clean = (items: (string | undefined)[]) => dedupe(items.filter((i): i is string => !!i), (i) => i);
  return { inputs: clean(inputs), outputs: clean(outputs) };
}
