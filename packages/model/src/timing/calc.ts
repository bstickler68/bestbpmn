import { formatAssignee, type Assignee } from '../raci/assignees.js';
import { findParticipant, isMultiInstance, laneMap, resolveRaci } from '../raci/check.js';
import type { ModdleElement } from '../states/types.js';
import { readProbability, readTiming, TIMING_TYPES, type TimeSpan, type Timing } from './read.js';

/**
 * Rechnung aus den Planwerten eines Modells. Sie braucht nur das Modell und läuft
 * deshalb ganz im Browser, auch für Modelle, die nie ausgeführt werden.
 *
 * 1. Erwartete Ausführungen je Element: lineares Gleichungssystem über den Sequenzflüssen (absorbierende
 *    Markow-Kette). Schleifen sind damit eingeschlossen; eine Rückfrage mit 20 % ergibt 1,25 Ausführungen.
 * 2. Aufwand je Durchlauf und Zuständigem: erwartete Ausführungen mal Aufwand von D, E und M.
 * 3. Durchlaufzeit: Simulation (Monte Carlo) über die Wege durch Gateways und Schleifen; parallele Zweige
 *    zählen mit dem längsten. Daraus Mittelwert, Median, 85- und 95-%-Wert und der kritische Pfad.
 *
 * Alle Zeiten sind Arbeitsminuten. Ein Arbeitstag im Modell (`P1D`) hat `minutesPerDay` Minuten.
 * Fehlende Angaben brechen die Rechnung nicht ab: Sie stehen in `missing`, und es wird mit dem gerechnet,
 * was da ist (fehlende Wahrscheinlichkeiten teilen den Rest gleich auf, eine Aufgabe ohne Dauer dauert so lang wie der Aufwand des D).
 */

type El = ModdleElement & Record<string, any> & { id: string };

export interface CalculationOverrides {
  /** Planwerte je Element-ID; ersetzen nur die genannten Werte. */
  timing?: Record<string, { effort?: TimeSpan; accountableEffort?: TimeSpan; duration?: TimeSpan; instances?: number }>;
  /** Wahrscheinlichkeit je Sequenzfluss-ID in Prozent. */
  probabilities?: Record<string, number>;
}

export interface CalculationOptions {
  /** Minuten je Arbeitstag für Angaben in Tagen; Vorgabe 480. */
  minutesPerDay?: number;
  /** Durchläufe der Simulation; Vorgabe 10.000, 0 schaltet sie ab. */
  runs?: number;
  /** Startwert des Zufallsgenerators, damit dasselbe Modell dasselbe Ergebnis gibt. */
  seed?: number;
  /** Aufgerufene Prozesse für Aufrufaktivitäten; ohne Angabe nur die aus derselben Datei. */
  resolveProcess?: (calledElement: string) => ModdleElement | undefined;
  /** Szenario: Werte einzelner Elemente und Sequenzflüsse, die die Werte im Modell ersetzen. */
  overrides?: CalculationOverrides;
}

export type MissingCode =
  | 'effort'
  | 'accountable-effort'
  | 'duration'
  | 'probability'
  | 'boundary-probability'
  | 'instances'
  | 'called-process'
  | 'endless-loop';

export interface MissingValue {
  code: MissingCode;
  elementId: string;
  /** Bei Elementen aus Teilprozessen und aufgerufenen Prozessen der Weg dorthin, z. B. `Sub/Task`. */
  path?: string;
}

export interface Percentiles {
  mean: number;
  median: number;
  p85: number;
  p95: number;
}

export interface ElementResult {
  elementId: string;
  name?: string;
  /** Erwartete Ausführungen je Durchlauf (bei Mehrfachinstanzen je Instanz gezählt). */
  visits: number;
  /** Aufwand aller Zuständigen je Durchlauf in Minuten. */
  effort: number;
  /** Geplante Dauer einer Ausführung in Arbeitsminuten (bei Teilprozessen nicht gesetzt). */
  duration?: number;
  /** Anteil der Durchläufe, in denen das Element auf dem kritischen Pfad lag (0 bis 1). */
  critical?: number;
}

export interface HolderEffort {
  /** Zuständiger im Format des Modells, z. B. `role(clerk)`; `null`, wenn die Aufgabe kein D hat. */
  holder: string | null;
  minutes: number;
}

export interface ProcessCalculation {
  processId: string;
  name?: string;
  /** Aufwand je Durchlauf in Minuten. */
  effort: number;
  effortByHolder: HolderEffort[];
  /** Durchlaufzeit je Durchlauf in Arbeitsminuten; fehlt, wenn die Simulation abgeschaltet ist. */
  cycleTime?: Percentiles;
  elements: ElementResult[];
  /** Elemente auf dem kritischen Pfad (in mehr als der Hälfte der Durchläufe), in Reihenfolge des Ablaufs. */
  criticalPath: string[];
  missing: MissingValue[];
  complete: boolean;
}

export const GATEWAY_EITHER = new Set(['bpmn:ExclusiveGateway', 'bpmn:EventBasedGateway', 'bpmn:ComplexGateway']);
export const PARALLEL = 'bpmn:ParallelGateway';
export const INCLUSIVE = 'bpmn:InclusiveGateway';
/** Aufgaben, die ein Mensch erledigt und für die der Aufwand des D Pflicht ist (F1). */
const HUMAN_TASKS = new Set(['bpmn:Task', 'bpmn:UserTask', 'bpmn:ManualTask']);
const MAX_DEPTH = 10;
const MAX_STEPS = 100_000;

/** Ein Prozess oder Teilprozess als Graph (auch für die Wertschöpfungsanalyse). */
export interface Graph {
  container: El;
  nodes: El[];
  index: Map<El, number>;
  out: Map<El, El[]>;
  inc: Map<El, El[]>;
  boundaries: Map<El, El[]>;
  starts: El[];
  /** Wahrscheinlichkeit eines Sequenzflusses in Prozent, mit den Überschreibungen des Szenarios. */
  probability: (flow: El) => number | undefined;
  /** Zu jedem verzweigenden Parallel- oder Oder-Gateway das zusammenführende. */
  joins: Map<El, El | undefined>;
}

/** Was ein Knoten je Ausführung beiträgt. */
interface NodeInfo {
  /** Dauer je Ausführung in Minuten (bei Teilprozessen aus der inneren Rechnung). */
  duration: number;
  /** Instanzen bei Mehrfachinstanz, sonst 1. */
  instances: number;
  sequential: boolean;
  /** Aufwand je Ausführung (alle Instanzen) je Zuständigem. */
  effort: Map<string | null, number>;
  /** Innerer Graph bei Teilprozessen und Aufrufaktivitäten. */
  inner?: Model;
}

interface Model {
  graph: Graph;
  info: Map<El, NodeInfo>;
  /** Ausgehende Wege mit Faktor (Erwartung je Token). */
  routes: Map<El, { flow: El; factor: number }[]>;
  visits: number[];
  effort: Map<string | null, number>;
  elements: ElementResult[];
  missing: MissingValue[];
}

/** Rechnet alle Prozesse einer Datei; Prozesse ohne Startereignis (z. B. reine Pools) fehlen. */
export function calculateDefinitions(definitions: ModdleElement, options: CalculationOptions = {}): ProcessCalculation[] {
  const processes = (((definitions as El).rootElements ?? []) as El[]).filter((r) => r.$type === 'bpmn:Process');
  const resolveProcess = options.resolveProcess ?? ((id: string) => processes.find((p) => p.id === id));
  return processes
    .filter((p) => ((p.flowElements ?? []) as El[]).some((f) => f.$type === 'bpmn:StartEvent'))
    .map((p) => calculateProcess(p, { ...options, resolveProcess }, definitions));
}

/** Rechnet einen Prozess. */
export function calculateProcess(process: ModdleElement, options: CalculationOptions = {}, definitions?: ModdleElement): ProcessCalculation {
  const minutesPerDay = options.minutesPerDay ?? 480;
  const definitionsEl = (definitions ?? findDefinitions(process as El)) as El | undefined;
  const resolveProcess =
    options.resolveProcess ??
    ((id: string) => (((definitionsEl?.rootElements ?? []) as El[]).find((r) => r.$type === 'bpmn:Process' && r.id === id)));
  const ctx: Context = {
    minutesPerDay,
    resolveProcess: resolveProcess as Context['resolveProcess'],
    definitions: definitionsEl,
    stack: [],
    overrides: options.overrides ?? {},
  };
  const model = buildModel(process as El, ctx, undefined, '');

  const result: ProcessCalculation = {
    processId: (process as El).id,
    name: (process as El).name || undefined,
    effort: sum(model.effort.values()),
    effortByHolder: [...model.effort.entries()]
      .map(([holder, minutes]) => ({ holder, minutes: round(minutes) }))
      .sort((a, b) => b.minutes - a.minutes || String(a.holder).localeCompare(String(b.holder))),
    elements: model.elements,
    criticalPath: [],
    missing: model.missing,
    complete: model.missing.length === 0,
  };
  result.effort = round(result.effort);

  const runs = options.runs ?? 10_000;
  if (runs > 0) {
    const random = mulberry32(options.seed ?? 49);
    const times: number[] = [];
    const critical = new Map<string, number>();
    let endless = false;
    for (let run = 0; run < runs; run++) {
      const outcome = simulate(model, random);
      if (!outcome) {
        endless = true;
        break;
      }
      times.push(outcome.time);
      for (const id of new Set(outcome.trail)) {
        critical.set(id, (critical.get(id) ?? 0) + 1);
      }
    }
    if (endless) {
      result.missing.push({ code: 'endless-loop', elementId: (process as El).id });
      result.complete = false;
    } else {
      times.sort((a, b) => a - b);
      result.cycleTime = {
        mean: round(sum(times) / times.length),
        median: round(quantile(times, 0.5)),
        p85: round(quantile(times, 0.85)),
        p95: round(quantile(times, 0.95)),
      };
      const own = new Set(model.graph.nodes.map((n) => n.id));
      for (const element of result.elements.filter((e) => own.has(e.elementId))) {
        element.critical = round((critical.get(element.elementId) ?? 0) / times.length, 3);
      }
      result.criticalPath = orderedCritical(model, critical, times.length);
    }
  }
  return result;
}

interface Context {
  overrides: CalculationOverrides;
  minutesPerDay: number;
  resolveProcess: (calledElement: string) => El | undefined;
  definitions?: El;
  /** Prozesse und Teilprozesse, die gerade gerechnet werden, gegen Endlosaufrufe. */
  stack: El[];
}

export function findDefinitions(el: El): El | undefined {
  let current: El | undefined = el;
  while (current && current.$type !== 'bpmn:Definitions') {
    current = current.$parent;
  }
  return current;
}

function buildModel(container: El, ctx: Context, lanes: Map<El, El> | undefined, path: string): Model {
  const graph = buildGraph(container, ctx);
  const missing: MissingValue[] = [];
  const miss = (code: MissingCode, el: El) => missing.push(path ? { code, elementId: el.id, path: `${path}/${el.id}` } : { code, elementId: el.id });

  // Lanes gelten für den Prozess; Elemente in Teilprozessen erben die Lane des Teilprozesses.
  if (!lanes) {
    lanes = container.$type === 'bpmn:Process' ? laneMap(container, findParticipant(ctx.definitions, container)) : new Map();
  }
  const info = new Map<El, NodeInfo>();
  ctx.stack.push(container);
  for (const node of graph.nodes) {
    const result = nodeInfo(node, ctx, lanes, path, miss);
    info.set(node, result);
    if (result.inner) {
      missing.push(...result.inner.missing);
    }
  }
  ctx.stack.pop();

  const routes = new Map<El, { flow: El; factor: number }[]>();
  for (const node of graph.nodes) {
    routes.set(node, nodeRoutes(node, graph, miss));
  }

  const visits = solveVisits(graph, routes);
  const effort = new Map<string | null, number>();
  const elements: ElementResult[] = [];
  graph.nodes.forEach((node, i) => {
    const nodeInfo = info.get(node)!;
    const v = visits[i]!;
    let nodeEffort = 0;
    for (const [holder, minutes] of nodeInfo.effort) {
      effort.set(holder, (effort.get(holder) ?? 0) + v * minutes);
      nodeEffort += v * minutes;
    }
    if (isActivity(node) || node.$type === 'bpmn:IntermediateCatchEvent' || node.$type === 'bpmn:BoundaryEvent') {
      elements.push({
        elementId: node.id,
        ...(node.name ? { name: node.name } : {}),
        visits: round(v, 4),
        effort: round(nodeEffort),
        ...(nodeInfo.inner ? {} : { duration: round(nodeInfo.duration) }),
      });
    }
    // Teilprozesse: ihre Elemente zählen so oft, wie der Teilprozess läuft.
    if (nodeInfo.inner && node.$type === 'bpmn:SubProcess') {
      for (const inner of nodeInfo.inner.elements) {
        elements.push({ ...inner, visits: round(inner.visits * v * nodeInfo.instances, 4), effort: round(inner.effort * v * nodeInfo.instances) });
      }
    }
  });
  return { graph, info, routes, visits, effort, elements, missing };
}

export function buildGraph(container: El, ctx: Pick<Context, 'overrides'>): Graph {
  const all = (container.flowElements ?? []) as El[];
  const flows = all.filter((f) => f.$type === 'bpmn:SequenceFlow' && f.sourceRef && f.targetRef);
  const nodes = all.filter((f) => f.$instanceOf?.('bpmn:FlowNode') && !(f.$type === 'bpmn:SubProcess' && f.triggeredByEvent));
  const index = new Map(nodes.map((n, i) => [n, i] as const));
  const out = new Map<El, El[]>(nodes.map((n) => [n, []]));
  const inc = new Map<El, El[]>(nodes.map((n) => [n, []]));
  for (const flow of flows) {
    out.get(flow.sourceRef)?.push(flow);
    inc.get(flow.targetRef)?.push(flow);
  }
  const boundaries = new Map<El, El[]>();
  for (const node of nodes) {
    if (node.$type === 'bpmn:BoundaryEvent' && node.attachedToRef) {
      boundaries.set(node.attachedToRef, [...(boundaries.get(node.attachedToRef) ?? []), node]);
    }
  }
  // Start: Startereignisse ohne Auslöser vor denen mit; in Teilprozessen auch Knoten ohne Eingang.
  let starts = nodes.filter((n) => n.$type === 'bpmn:StartEvent');
  const none = starts.filter((s) => !(s.eventDefinitions ?? []).length);
  if (none.length) {
    starts = none;
  }
  if (!starts.length) {
    starts = nodes.filter((n) => !inc.get(n)!.length && n.$type !== 'bpmn:BoundaryEvent' && !isCompensation(n));
  }
  const overrides = ctx.overrides.probabilities ?? {};
  const probability = (flow: El) => (flow.id in overrides ? overrides[flow.id] : readProbability(flow));
  const graph: Graph = { container, nodes, index, out, inc, boundaries, starts, joins: new Map(), probability };
  for (const node of nodes) {
    if (isSplit(node, graph)) {
      graph.joins.set(node, matchJoin(node, graph));
    }
  }
  return graph;
}

export const isActivity = (el: El) => !!el.$instanceOf?.('bpmn:Activity');
const isCompensation = (el: El) => !!el.isForCompensation;
export const isSplit = (el: El, graph: Graph) => (el.$type === PARALLEL || el.$type === INCLUSIVE) && graph.out.get(el)!.length > 1;
export const isJoin = (el: El, graph: Graph) => (el.$type === PARALLEL || el.$type === INCLUSIVE) && graph.inc.get(el)!.length > 1;

/**
 * Das zusammenführende Gateway zu einer Verzweigung, unter der Annahme eines blockweise aufgebauten Modells:
 * das erste Parallel- oder Oder-Gateway mit mehreren Eingängen, das auf gleicher Tiefe erreicht wird.
 */
function matchJoin(split: El, graph: Graph): El | undefined {
  const seen = new Set<El>();
  const walk = (node: El, depth: number): El | undefined => {
    if (seen.has(node)) {
      return undefined;
    }
    seen.add(node);
    let d = depth;
    if (node !== split && isJoin(node, graph)) {
      if (d === 0) {
        return node;
      }
      d -= 1;
    }
    if (node !== split && isSplit(node, graph)) {
      d += 1;
    }
    for (const flow of graph.out.get(node) ?? []) {
      const found = walk(flow.targetRef, d);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  for (const flow of graph.out.get(split)!) {
    const found = walk(flow.targetRef, 0);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** Minuten einer Dauer. */
const minutesOf = (span: TimeSpan | undefined, ctx: Context) => (span ? span.days * ctx.minutesPerDay + span.minutes : 0);

/** Zuständiger für die Rechnung; abgeleitete Rollen zählen als ihre Rolle. */
function holderOf(assignee: Assignee): string {
  return assignee.kind === 'orgRole' ? `role(${assignee.ref})` : formatAssignee(assignee);
}

function nodeInfo(node: El, ctx: Context, lanes: Map<El, El>, path: string, miss: (code: MissingCode, el: El) => void): NodeInfo {
  const effort = new Map<string | null, number>();
  const add = (holder: string | null, minutes: number) => effort.set(holder, (effort.get(holder) ?? 0) + minutes);
  const result: NodeInfo = { duration: 0, instances: 1, sequential: false, effort };
  const multi = isMultiInstance(node);
  result.sequential = multi && !!node.loopCharacteristics?.isSequential;

  if (TIMING_TYPES.has(node.$type)) {
    const timing: Timing = { ...(readTiming(node) ?? { consultedEfforts: [], invalid: {} }), ...(ctx.overrides.timing?.[node.id] ?? {}) };
    if (node.$type === 'bpmn:IntermediateCatchEvent') {
      if (!timing.duration) {
        miss('duration', node);
      }
      result.duration = minutesOf(timing.duration, ctx);
      return result;
    }
    const raci = resolveRaci(node, lanes);
    const responsible = raci.responsible.filter((a) => a.kind !== 'notPerformerOf');
    let instances = 1;
    if (multi) {
      if (timing.instances) {
        instances = timing.instances;
      } else if (responsible.length > 1) {
        instances = responsible.length;
      } else {
        miss('instances', node);
      }
    }
    result.instances = instances;
    if (!timing.effort && HUMAN_TASKS.has(node.$type)) {
      miss('effort', node);
    }
    const dEffort = minutesOf(timing.effort, ctx);
    if (timing.effort) {
      const total = dEffort * instances;
      if (!responsible.length) {
        add(null, total);
      } else {
        for (const holder of responsible) {
          add(holderOf(holder), total / responsible.length);
        }
      }
    }
    if (raci.accountable.length) {
      if (!timing.accountableEffort) {
        miss('accountable-effort', node);
      } else {
        for (const holder of raci.accountable) {
          add(holderOf(holder), minutesOf(timing.accountableEffort, ctx) * instances);
        }
      }
    }
    for (const consulted of timing.consultedEfforts) {
      const parsed = raci.consulted.find((c) => formatAssignee(c) === consulted.assignee);
      add(parsed ? holderOf(parsed) : consulted.assignee, minutesOf(consulted.effort, ctx) * instances);
    }
    // Ohne Dauer gilt der Aufwand des D, wie im Panel beschrieben.
    result.duration = timing.duration ? minutesOf(timing.duration, ctx) : dEffort;
    if (result.sequential) {
      result.duration *= instances;
    }
    return result;
  }

  let inner: El | undefined;
  let innerLanes: Map<El, El> | undefined;
  if (node.$type === 'bpmn:SubProcess' || node.$type === 'bpmn:Transaction' || node.$type === 'bpmn:AdHocSubProcess') {
    inner = node;
    innerLanes = inheritLane(node, lanes);
  } else if (node.$type === 'bpmn:CallActivity') {
    inner = node.calledElement ? ctx.resolveProcess(String(node.calledElement)) : undefined;
    if (!inner) {
      miss('called-process', node);
    }
  }
  if (inner && ctx.stack.includes(inner)) {
    inner = undefined;
  }
  if (inner && ctx.stack.length < MAX_DEPTH) {
    if (multi) {
      // Mehrfachinstanzen von Teilprozessen geben ihre Anzahl nicht an; ohne D gibt es keine Zählung.
      const responsible = resolveRaci(node, lanes).responsible.filter((a) => a.kind !== 'notPerformerOf');
      if (responsible.length > 1) {
        result.instances = responsible.length;
      } else {
        miss('instances', node);
      }
    }
    const model = buildModel(inner, ctx, innerLanes, path ? `${path}/${node.id}` : node.id);
    result.inner = model;
    for (const [holder, minutes] of model.effort) {
      add(holder, minutes * result.instances);
    }
  }
  return result;
}

/** Elemente eines Teilprozesses erben dessen Lane, wenn sie selbst in keiner stehen. */
function inheritLane(sub: El, lanes: Map<El, El>): Map<El, El> {
  const lane = lanes.get(sub);
  const result = new Map(lanes);
  if (lane) {
    const visit = (container: El) => {
      for (const el of (container.flowElements ?? []) as El[]) {
        if (!result.has(el)) {
          result.set(el, lane);
        }
        if (el.flowElements) {
          visit(el);
        }
      }
    };
    visit(sub);
  }
  return result;
}

/** Ausgehende Wege eines Knotens mit dem Faktor, mit dem ein Token sie nimmt. */
export function nodeRoutes(node: El, graph: Graph, miss: (code: MissingCode, el: El) => void): { flow: El; factor: number }[] {
  const out = graph.out.get(node)!;
  if (!out.length) {
    return [];
  }
  if (node.$type === 'bpmn:BoundaryEvent') {
    return out.map((flow) => ({ flow, factor: 1 }));
  }
  const routes: { flow: El; factor: number }[] = [];
  if ((GATEWAY_EITHER.has(node.$type) || node.$type === INCLUSIVE) && out.length > 1) {
    const values = out.map((f) => graph.probability(f));
    const known = values.filter((v): v is number => v !== undefined && !Number.isNaN(v));
    if (known.length < values.length) {
      miss('probability', node);
    }
    const unknown = values.length - known.length;
    if (GATEWAY_EITHER.has(node.$type)) {
      // Fehlende Werte teilen sich den Rest; ergibt die Summe nicht 100 %, wird sie auf 100 % gebracht.
      const rest = Math.max(0, 100 - sum(known));
      const raw = values.map((v) => (v === undefined || Number.isNaN(v) ? rest / unknown : v));
      const total = sum(raw) || 1;
      out.forEach((flow, i) => routes.push({ flow, factor: raw[i]! / total }));
    } else {
      out.forEach((flow, i) => {
        const v = values[i];
        routes.push({ flow, factor: v === undefined || Number.isNaN(v) ? 1 / out.length : v / 100 });
      });
    }
  } else {
    for (const flow of out) {
      routes.push({ flow, factor: 1 });
    }
  }
  // Grenzereignisse: Ein unterbrechendes nimmt dem normalen Weg seinen Anteil weg.
  const boundaries = graph.boundaries.get(node) ?? [];
  let interrupted = 0;
  for (const boundary of boundaries) {
    const p = boundaryProbability(boundary, graph);
    if (p === undefined) {
      miss('boundary-probability', boundary);
    } else if (boundary.cancelActivity !== false) {
      interrupted += p;
    }
  }
  if (interrupted) {
    const keep = Math.max(0, 1 - interrupted);
    for (const route of routes) {
      route.factor *= keep;
    }
  }
  return routes;
}

/** Wahrscheinlichkeit eines Grenzereignisses: steht an seinem ausgehenden Sequenzfluss. */
export function boundaryProbability(boundary: El, graph: Graph): number | undefined {
  for (const flow of graph.out.get(boundary) ?? []) {
    const p = graph.probability(flow);
    if (p !== undefined && !Number.isNaN(p)) {
      return p / 100;
    }
  }
  return undefined;
}

/**
 * Erwartete Ausführungen: v = s + Wᵀ·v. Zusammenführende Parallel-Gateways feuern einmal für alle Eingänge,
 * zusammenführende Oder-Gateways einmal, wenn ihre Verzweigung mindestens einen Weg genommen hat.
 */
function solveVisits(graph: Graph, routes: Map<El, { flow: El; factor: number }[]>): number[] {
  const n = graph.nodes.length;
  const a: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === j ? 1 : 0)));
  for (const start of graph.starts) {
    a[graph.index.get(start)!]![n] = 1 / graph.starts.length;
  }
  const divisor = new Map<El, number>();
  for (const [split, join] of graph.joins) {
    if (!join) {
      continue;
    }
    if (join.$type === PARALLEL || split.$type === PARALLEL) {
      divisor.set(join, graph.inc.get(join)!.length);
    } else {
      const p = routes.get(split)!.map((r) => r.factor);
      const any = 1 - p.reduce((acc, x) => acc * (1 - Math.min(1, x)), 1);
      divisor.set(join, any > 0 ? sum(p) / any : 1);
    }
  }
  for (const node of graph.nodes) {
    if (isJoin(node, graph) && !divisor.has(node)) {
      divisor.set(node, node.$type === PARALLEL ? graph.inc.get(node)!.length : 1);
    }
  }
  for (const node of graph.nodes) {
    const from = graph.index.get(node)!;
    for (const { flow, factor } of routes.get(node)!) {
      const to = graph.index.get(flow.targetRef);
      if (to === undefined) {
        continue;
      }
      a[to]![from]! -= factor / (divisor.get(flow.targetRef) ?? 1);
    }
    for (const boundary of graph.boundaries.get(node) ?? []) {
      const to = graph.index.get(boundary)!;
      a[to]![from]! -= boundaryProbability(boundary, graph) ?? 0;
    }
  }
  return gauss(a, n);
}

/** Gauß-Elimination mit Spaltenpivot; nicht lösbare Zeilen (Endlosschleife) ergeben 0. */
function gauss(a: number[][], n: number): number[] {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) {
        pivot = row;
      }
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) {
      continue;
    }
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const rowCol = a[col]!;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = a[row]![col]! / rowCol[col]!;
      if (f === 0) continue;
      const r = a[row]!;
      for (let k = col; k <= n; k++) {
        r[k]! -= f * rowCol[k]!;
      }
    }
  }
  return a.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : Math.max(0, row[n]! / row[i]!)));
}

interface Trail {
  id: string;
  prev?: Trail;
}

interface Token {
  node: El;
  time: number;
  trail?: Trail;
  /** Offene Verzweigungen (innerste zuletzt). */
  groups: { id: number; split: El; count: number }[];
}

/** Ein simulierter Durchlauf: Zeit bis zum letzten Ende und der Weg, der sie bestimmt hat. */
function simulate(model: Model, random: () => number, depth = 0): { time: number; trail: string[] } | undefined {
  const { graph, info, routes } = model;
  const start = graph.starts.length === 1 ? graph.starts[0]! : graph.starts[Math.floor(random() * graph.starts.length)];
  if (!start) {
    return { time: 0, trail: [] };
  }
  const stack: Token[] = [{ node: start, time: 0, groups: [] }];
  const waiting = new Map<string, Token[]>();
  let groupId = 0;
  let end: Token | undefined;
  let steps = 0;
  while (stack.length) {
    if (++steps > MAX_STEPS) {
      return undefined;
    }
    const token = stack.pop()!;
    const node = token.node;
    let groups = token.groups;
    let time = token.time;
    let trail = token.trail;

    if (isJoin(node, graph)) {
      const top = groups[groups.length - 1];
      const matched = top && graph.joins.get(top.split) === node;
      const key = matched ? `g${top.id}` : `n${graph.index.get(node)}`;
      const need = matched ? top.count : node.$type === PARALLEL ? graph.inc.get(node)!.length : 1;
      const arrived = [...(waiting.get(key) ?? []), token];
      if (arrived.length < need) {
        waiting.set(key, arrived);
        continue;
      }
      waiting.delete(key);
      const last = arrived.reduce((a, b) => (b.time > a.time ? b : a));
      time = last.time;
      trail = last.trail;
      groups = matched ? groups.slice(0, -1) : groups;
    }

    const nodeInfo = info.get(node)!;
    let duration = nodeInfo.duration;
    if (nodeInfo.inner) {
      const runs = nodeInfo.sequential ? nodeInfo.instances : nodeInfo.instances > 1 ? Math.ceil(nodeInfo.instances) : 1;
      let total = 0;
      let longest = 0;
      for (let i = 0; i < runs && depth < MAX_DEPTH; i++) {
        const inner = simulate(nodeInfo.inner, random, depth + 1);
        if (!inner) {
          return undefined;
        }
        total += inner.time;
        longest = Math.max(longest, inner.time);
      }
      duration = nodeInfo.sequential ? total : longest;
    }
    const finish = time + duration;
    if (isActivity(node) || node.$type === 'bpmn:IntermediateCatchEvent' || node.$type === 'bpmn:BoundaryEvent') {
      trail = { id: node.id, prev: trail };
    }

    // Grenzereignisse: Ein unterbrechendes ersetzt den normalen Weg, ein nicht unterbrechendes kommt dazu.
    let interrupted: El | undefined;
    for (const boundary of graph.boundaries.get(node) ?? []) {
      const p = boundaryProbability(boundary, graph) ?? 0;
      if (random() < p) {
        if (boundary.cancelActivity !== false) {
          interrupted ??= boundary;
        } else {
          stack.push({ node: boundary, time: finish, trail, groups });
        }
      }
    }
    if (interrupted) {
      stack.push({ node: interrupted, time: finish, trail, groups });
      continue;
    }

    const chosen = choose(node, routes.get(node)!, random);
    if (!chosen.length) {
      if (!end || finish > end.time) {
        end = { node, time: finish, trail, groups };
      }
      continue;
    }
    let next = groups;
    if (isSplit(node, graph)) {
      next = [...groups, { id: ++groupId, split: node, count: chosen.length }];
    }
    for (const flow of chosen) {
      stack.push({ node: flow.targetRef, time: finish, trail, groups: next });
    }
  }
  const ids: string[] = [];
  for (let t = end?.trail; t; t = t.prev) {
    ids.push(t.id);
  }
  return { time: end?.time ?? 0, trail: ids.reverse() };
}

/** Welche Wege ein Token an einem Knoten nimmt. */
function choose(node: El, routes: { flow: El; factor: number }[], random: () => number): El[] {
  if (!routes.length) {
    return [];
  }
  if (GATEWAY_EITHER.has(node.$type) && routes.length > 1) {
    const total = sum(routes.map((r) => r.factor)) || 1;
    let x = random() * total;
    for (const route of routes) {
      x -= route.factor;
      if (x < 0) {
        return [route.flow];
      }
    }
    return [routes[routes.length - 1]!.flow];
  }
  if (node.$type === INCLUSIVE && routes.length > 1) {
    const taken = routes.filter((r) => random() < r.factor).map((r) => r.flow);
    if (!taken.length) {
      const fallback = (node.default as El | undefined) ?? undefined;
      return fallback ? [fallback] : [];
    }
    return taken;
  }
  return routes.map((r) => r.flow);
}

/** Elemente des kritischen Pfads in der Reihenfolge, in der der Ablauf sie erreicht. */
function orderedCritical(model: Model, critical: Map<string, number>, runs: number): string[] {
  const ids = new Set([...critical.entries()].filter(([, count]) => count / runs > 0.5).map(([id]) => id));
  const order: string[] = [];
  const seen = new Set<El>();
  const queue = [...model.graph.starts];
  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    if (ids.has(node.id)) {
      order.push(node.id);
    }
    for (const flow of model.graph.out.get(node) ?? []) {
      queue.push(flow.targetRef);
    }
    for (const boundary of model.graph.boundaries.get(node) ?? []) {
      queue.push(boundary);
    }
  }
  return order;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (pos - lower);
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Kleiner Zufallsgenerator mit Startwert (Mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
