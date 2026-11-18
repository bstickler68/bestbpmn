import { findParticipant, isMultiInstance, laneMap, resolveRaci } from '../raci/check.js';
import type { ModdleElement } from '../states/types.js';
import {
  boundaryProbability,
  buildGraph,
  findDefinitions,
  GATEWAY_EITHER,
  INCLUSIVE,
  isActivity,
  isJoin,
  isSplit,
  nodeRoutes,
  PARALLEL,
  type CalculationOverrides,
  type Graph,
} from './calc.js';
import { readTiming, VALUE_CLASSES, VALUE_TYPES, type TimeSpan, type Timing, type ValueClass } from './read.js';

/**
 * Wertschöpfungsanalyse. Sie rechnet aus den Planwerten und der Bewertung der
 * Aufgaben (`bestadd:timing valueClass`) Kennzahlen für jeden möglichen Weg durch den Prozess.
 *
 * - Ein Weg ist eine Kombination der Entscheidungen an den Gateways vom Start bis zum Ende. Parallele
 *   Zweige gehören zum selben Weg. Eine Aufgabe läuft auf einem Weg höchstens zweimal: Eine Schleife zählt
 *   einmal ohne und einmal mit genau einer Wiederholung. Grenzereignisse sind eigene Wege.
 * - Bearbeitungszeit einer Aufgabe = Aufwand des D plus Aufwand des E; M zählen nicht.
 * - Liegezeit = Dauer minus Bearbeitungszeit; die Wartezeit an wartenden Ereignissen ist ganz Liegezeit.
 *   Ohne Dauer gibt es keine Liegezeit.
 * - Anteile nach Anzahl und nach Bearbeitungszeit zählen alle Aufgaben des Wegs, auch in parallelen Zweigen.
 *   Durchlaufzeit und Flussrate folgen dem längsten parallelen Zweig; ohne Parallelität ist die
 *   Durchlaufzeit die Summe aller Bearbeitungs- und Liegezeiten.
 *
 * Alle Zeiten sind Arbeitsminuten, ein Arbeitstag im Modell hat `minutesPerDay` Minuten.
 */

type El = ModdleElement & Record<string, any> & { id: string };

/** Bewertung oder „nicht bewertet“. */
export type ValueBucket = ValueClass | 'unrated';
export const VALUE_BUCKETS: readonly ValueBucket[] = [...VALUE_CLASSES, 'unrated'];

export interface ValueStep {
  elementId: string;
  name?: string;
  valueClass?: ValueClass;
  /** Bearbeitungszeit dieser Ausführung in Minuten (alle Instanzen). */
  processing: number;
}

export interface ValueFigures {
  /** Anzahl der Tätigkeiten je Bewertung; eine Wiederholung zählt erneut. */
  count: Record<ValueBucket, number>;
  /** Anteil an der Anzahl in Prozent. */
  countShare: Record<ValueBucket, number>;
  /** Bearbeitungszeit je Bewertung in Minuten. */
  processing: Record<ValueBucket, number>;
  /** Anteil an der Bearbeitungszeit (ohne Liegezeit) in Prozent. */
  processingShare: Record<ValueBucket, number>;
  /** Bearbeitungszeit aller Tätigkeiten des Wegs. */
  processingTotal: number;
  /** Durchlaufzeit: Bearbeitungs- plus Liegezeit entlang des längsten Zweigs. */
  cycleTime: number;
  /** Bearbeitungszeit entlang des längsten Zweigs. */
  criticalProcessing: number;
  /** Liegezeit entlang des längsten Zweigs. */
  waiting: number;
  /** Flussrate: Bearbeitungszeit durch Durchlaufzeit, in Prozent. */
  flowRate: number;
}

export interface ValuePath extends ValueFigures {
  /** Wahrscheinlichkeit des Wegs in Prozent, aus den Wahrscheinlichkeiten an Gateways und Grenzereignissen. */
  probability: number;
  steps: ValueStep[];
}

export interface ValueAnalysis {
  processId: string;
  name?: string;
  /** Wege, wahrscheinlichster zuerst. */
  paths: ValuePath[];
  /** Mit der Wahrscheinlichkeit gewichteter Mittelwert über alle Wege; fehlt ohne Wege. */
  mean?: ValueFigures;
  /** Summe der Wahrscheinlichkeiten der gefundenen Wege in Prozent; unter 100, wenn Schleifen gekappt wurden. */
  coverage: number;
  /** Mehr Wege als `maxPaths`: Es werden nur die ersten gezeigt. */
  truncated: boolean;
  /** Aufgaben ohne Bewertung (IDs, auch in Teilprozessen). */
  unrated: string[];
}

export interface ValueOptions {
  minutesPerDay?: number;
  /** Höchstzahl der Wege je Prozess; Vorgabe 200. */
  maxPaths?: number;
  resolveProcess?: (calledElement: string) => ModdleElement | undefined;
  overrides?: CalculationOverrides;
}

interface Run {
  probability: number;
  steps: ValueStep[];
  time: number;
  proc: number;
}

interface Token {
  node: El;
  phase: 'enter' | 'exit';
  time: number;
  proc: number;
  groups: { id: number; split: El; count: number }[];
}

interface State {
  stack: Token[];
  waiting: Map<string, Token[]>;
  visits: Map<El, number>;
  steps: ValueStep[];
  probability: number;
  end?: { time: number; proc: number };
  groupId: number;
  work: number;
}

interface Ctx {
  minutesPerDay: number;
  maxPaths: number;
  overrides: CalculationOverrides;
  resolveProcess: (id: string) => El | undefined;
  definitions?: El;
  stack: El[];
  truncated: boolean;
  memo: Map<El, Run[]>;
  unrated: Set<string>;
}

/** Ein Weg darf eine Aufgabe höchstens so oft ausführen: einmal und eine Wiederholung. */
const MAX_VISITS = 2;
const MAX_WORK = 20_000;
const MAX_DEPTH = 10;
/** Oder-Gateways mit mehr Ausgängen werden nicht in Teilmengen zerlegt, sondern nehmen alle. */
const MAX_INCLUSIVE = 5;

/** Wertschöpfungsanalyse aller Prozesse einer Datei mit Startereignis. */
export function analyzeValueDefinitions(definitions: ModdleElement, options: ValueOptions = {}): ValueAnalysis[] {
  const processes = (((definitions as El).rootElements ?? []) as El[]).filter((r) => r.$type === 'bpmn:Process');
  const resolveProcess = options.resolveProcess ?? ((id: string) => processes.find((p) => p.id === id));
  return processes
    .filter((p) => ((p.flowElements ?? []) as El[]).some((f) => f.$type === 'bpmn:StartEvent'))
    .map((p) => analyzeValue(p, { ...options, resolveProcess }, definitions));
}

/** Wertschöpfungsanalyse eines Prozesses. */
export function analyzeValue(process: ModdleElement, options: ValueOptions = {}, definitions?: ModdleElement): ValueAnalysis {
  const definitionsEl = (definitions ?? findDefinitions(process as El)) as El | undefined;
  const ctx: Ctx = {
    minutesPerDay: options.minutesPerDay ?? 480,
    maxPaths: options.maxPaths ?? 200,
    overrides: options.overrides ?? {},
    resolveProcess: (options.resolveProcess ??
      ((id: string) => ((definitionsEl?.rootElements ?? []) as El[]).find((r) => r.$type === 'bpmn:Process' && r.id === id))) as Ctx['resolveProcess'],
    definitions: definitionsEl,
    stack: [],
    truncated: false,
    memo: new Map(),
    unrated: new Set(),
  };
  const runs = enumerate(process as El, ctx, undefined);
  const paths = runs.map((run) => ({ probability: round(run.probability * 100, 4), ...figures(run), steps: run.steps }));
  const coverage = runs.reduce((acc, r) => acc + r.probability, 0);
  return {
    processId: (process as El).id,
    ...((process as El).name ? { name: (process as El).name } : {}),
    paths,
    ...(runs.length ? { mean: meanFigures(runs, coverage) } : {}),
    coverage: round(coverage * 100, 2),
    truncated: ctx.truncated,
    unrated: [...ctx.unrated],
  };
}

/** Alle Wege eines Prozesses oder Teilprozesses, zusammengefasst und nach Wahrscheinlichkeit sortiert. */
function enumerate(container: El, ctx: Ctx, outerLanes: Map<El, El> | undefined): Run[] {
  const cached = ctx.memo.get(container);
  if (cached) {
    return cached;
  }
  const graph = buildGraph(container, ctx);
  const lanes = container.$type === 'bpmn:Process' ? laneMap(container, findParticipant(ctx.definitions, container)) : (outerLanes ?? new Map());
  const routes = new Map(graph.nodes.map((n) => [n, nodeRoutes(n, graph, () => undefined)] as const));
  ctx.stack.push(container);
  const open: State[] = graph.starts.map((start) => ({
    stack: [{ node: start, phase: 'enter', time: 0, proc: 0, groups: [] }],
    waiting: new Map(),
    visits: new Map(),
    steps: [],
    probability: 1 / graph.starts.length,
    groupId: 0,
    work: 0,
  }));
  const done: Run[] = [];
  while (open.length) {
    if (done.length >= ctx.maxPaths || open.length > ctx.maxPaths * 50) {
      ctx.truncated = true;
      break;
    }
    const state = open.pop()!;
    const result = advance(state, graph, routes, lanes, ctx);
    if (result === 'dropped') {
      continue;
    }
    if (Array.isArray(result)) {
      open.push(...result);
    } else {
      done.push(result);
    }
  }
  ctx.stack.pop();

  // Wege mit gleichen Schritten und gleicher Zeit fassen sich zusammen (z. B. leere Zweige).
  const merged = new Map<string, Run>();
  for (const run of done) {
    const key = `${run.steps.map((s) => s.elementId).join('>')}|${round(run.time)}|${round(run.proc)}`;
    const found = merged.get(key);
    if (found) {
      found.probability += run.probability;
    } else {
      merged.set(key, { ...run });
    }
  }
  const runs = [...merged.values()].sort((a, b) => b.probability - a.probability);
  ctx.memo.set(container, runs);
  return runs;
}

const minutesOf = (span: TimeSpan | undefined, ctx: Ctx) => (span ? span.days * ctx.minutesPerDay + span.minutes : 0);

function clone(state: State): State {
  return {
    stack: [...state.stack],
    waiting: new Map([...state.waiting].map(([k, v]) => [k, [...v]])),
    visits: new Map(state.visits),
    steps: [...state.steps],
    probability: state.probability,
    end: state.end,
    groupId: state.groupId,
    work: state.work,
  };
}

/** Eine Möglichkeit an einem Knoten: Wahrscheinlichkeit und was sie am Zustand ändert. */
interface Option {
  p: number;
  apply: (state: State) => void;
}

/**
 * Treibt einen Zustand bis zum Ende oder bis zur nächsten Entscheidung voran.
 * Ergebnis: ein fertiger Weg, die Zustände je Möglichkeit oder `dropped` (Wiederholung über die Grenze).
 */
function advance(state: State, graph: Graph, routes: Map<El, { flow: El; factor: number }[]>, lanes: Map<El, El>, ctx: Ctx): Run | State[] | 'dropped' {
  while (state.stack.length) {
    if (++state.work > MAX_WORK) {
      return 'dropped';
    }
    const token = state.stack.pop()!;
    const options = token.phase === 'enter' ? enter(state, token, graph, lanes, ctx) : exit(state, token, graph, routes);
    if (options === 'dropped') {
      return 'dropped';
    }
    if (!options) {
      continue;
    }
    const usable = options.filter((o) => o.p > 0);
    if (!usable.length) {
      return 'dropped';
    }
    if (usable.length === 1) {
      state.probability *= usable[0]!.p;
      usable[0]!.apply(state);
      continue;
    }
    return usable.map((option) => {
      const next = clone(state);
      next.probability *= option.p;
      option.apply(next);
      return next;
    });
  }
  return { probability: state.probability, steps: state.steps, time: state.end?.time ?? 0, proc: state.end?.proc ?? 0 };
}

/** Ankunft an einem Knoten: Zusammenführung, dann was der Knoten an Zeit und Tätigkeit beiträgt. */
function enter(state: State, token: Token, graph: Graph, lanes: Map<El, El>, ctx: Ctx): Option[] | undefined | 'dropped' {
  const node = token.node;
  let { time, proc, groups } = token;
  if (isJoin(node, graph)) {
    const top = groups[groups.length - 1];
    const matched = top && graph.joins.get(top.split) === node;
    const key = matched ? `g${top.id}` : `n${graph.index.get(node)}`;
    const need = matched ? top.count : node.$type === PARALLEL ? graph.inc.get(node)!.length : 1;
    const arrived = [...(state.waiting.get(key) ?? []), token];
    if (arrived.length < need) {
      state.waiting.set(key, arrived);
      return undefined;
    }
    state.waiting.delete(key);
    const last = arrived.reduce((a, b) => (b.time > a.time ? b : a));
    time = last.time;
    proc = last.proc;
    groups = matched ? groups.slice(0, -1) : groups;
  }
  if (isActivity(node) || node.$type === 'bpmn:IntermediateCatchEvent') {
    const visits = (state.visits.get(node) ?? 0) + 1;
    if (visits > MAX_VISITS) {
      return 'dropped';
    }
    state.visits.set(node, visits);
  }
  const multi = isMultiInstance(node);
  const sequential = multi && !!node.loopCharacteristics?.isSequential;
  const responsibleCount = () => resolveRaci(node, lanes).responsible.filter((a) => a.kind !== 'notPerformerOf').length;
  const timing = (): Timing => ({ ...(readTiming(node) ?? { consultedEfforts: [], invalid: {} }), ...(ctx.overrides.timing?.[node.id] ?? {}) });
  const exitWith = (dt: number, dp: number, steps: ValueStep[]) => (s: State) => {
    s.steps.push(...steps);
    s.stack.push({ node, phase: 'exit', time: time + dt, proc: proc + dp, groups });
  };

  if (VALUE_TYPES.has(node.$type)) {
    const t = timing();
    const proc1 = minutesOf(t.effort, ctx) + minutesOf(t.accountableEffort, ctx);
    let instances = 1;
    if (multi) {
      const count = responsibleCount();
      instances = t.instances ?? (count > 1 ? count : 1);
    }
    const duration1 = t.duration ? Math.max(minutesOf(t.duration, ctx), proc1) : proc1;
    if (!t.valueClass) {
      ctx.unrated.add(node.id);
    }
    const step: ValueStep = { elementId: node.id, ...(node.name ? { name: node.name } : {}), ...(t.valueClass ? { valueClass: t.valueClass } : {}), processing: proc1 * instances };
    const factor = sequential ? instances : 1;
    return [{ p: 1, apply: exitWith(duration1 * factor, proc1 * factor, [step]) }];
  }
  if (node.$type === 'bpmn:IntermediateCatchEvent') {
    return [{ p: 1, apply: exitWith(minutesOf(timing().duration, ctx), 0, []) }];
  }
  let inner: El | undefined;
  if (node.$type === 'bpmn:SubProcess' || node.$type === 'bpmn:Transaction' || node.$type === 'bpmn:AdHocSubProcess') {
    inner = node;
  } else if (node.$type === 'bpmn:CallActivity' && node.calledElement) {
    inner = ctx.resolveProcess(String(node.calledElement));
  }
  if (inner && !ctx.stack.includes(inner) && ctx.stack.length < MAX_DEPTH) {
    const runs = enumerate(inner, ctx, inner === node ? lanes : undefined);
    if (runs.length) {
      const count = multi ? responsibleCount() : 1;
      const instances = count > 1 ? count : 1;
      const factor = sequential ? instances : 1;
      const total = runs.reduce((acc, r) => acc + r.probability, 0) || 1;
      return runs.map((run) => ({
        p: run.probability / total,
        apply: exitWith(
          run.time * factor,
          run.proc * factor,
          run.steps.map((s) => ({ ...s, processing: s.processing * instances })),
        ),
      }));
    }
  }
  return [{ p: 1, apply: exitWith(0, 0, []) }];
}

/** Verlassen eines Knotens: Grenzereignisse und die Wahl der ausgehenden Wege. */
function exit(state: State, token: Token, graph: Graph, routes: Map<El, { flow: El; factor: number }[]>): Option[] {
  const node = token.node;
  const { time, proc, groups } = token;
  const out = routes.get(node) ?? [];

  // Wahl der ausgehenden Wege: je Möglichkeit die genommenen Sequenzflüsse.
  let choices: { p: number; flows: El[] }[];
  if (GATEWAY_EITHER.has(node.$type) && out.length > 1) {
    const total = out.reduce((acc, r) => acc + r.factor, 0) || 1;
    choices = out.map((r) => ({ p: r.factor / total, flows: [r.flow] }));
  } else if (node.$type === INCLUSIVE && out.length > 1 && out.length <= MAX_INCLUSIVE) {
    choices = [];
    for (let mask = 1; mask < 1 << out.length; mask++) {
      let p = 1;
      const flows: El[] = [];
      out.forEach((r, i) => {
        const f = Math.min(1, Math.max(0, r.factor));
        if (mask & (1 << i)) {
          p *= f;
          flows.push(r.flow);
        } else {
          p *= 1 - f;
        }
      });
      choices.push({ p, flows });
    }
    const total = choices.reduce((acc, c) => acc + c.p, 0);
    choices = total > 0 ? choices.map((c) => ({ p: c.p / total, flows: c.flows })) : [{ p: 1, flows: out.map((r) => r.flow) }];
  } else {
    choices = [{ p: 1, flows: out.map((r) => r.flow) }];
  }

  const go = (flows: El[], extra: El[]) => (s: State) => {
    let next = groups;
    if (flows.length > 1 && isSplit(node, graph)) {
      next = [...groups, { id: ++s.groupId, split: node, count: flows.length }];
    }
    for (const flow of flows) {
      s.stack.push({ node: flow.targetRef, phase: 'enter', time, proc, groups: next });
    }
    for (const boundary of extra) {
      s.stack.push({ node: boundary, phase: 'enter', time, proc, groups });
    }
    if (!flows.length && !extra.length && (!s.end || time > s.end.time)) {
      s.end = { time, proc };
    }
  };

  // Grenzereignisse: kein Eintritt oder genau eines; ein unterbrechendes ersetzt den normalen Weg.
  const boundaries = (graph.boundaries.get(node) ?? [])
    .map((b) => ({ b, p: boundaryProbability(b, graph) ?? 0 }))
    .filter((x) => x.p > 0);
  const none = boundaries.reduce((acc, x) => acc * (1 - Math.min(1, x.p)), 1);
  const options: Option[] = choices.map((c) => ({ p: none * c.p, apply: go(c.flows, []) }));
  for (const { b, p } of boundaries) {
    const others = boundaries.filter((x) => x.b !== b).reduce((acc, x) => acc * (1 - Math.min(1, x.p)), 1);
    if (b.cancelActivity !== false) {
      options.push({ p: Math.min(1, p) * others, apply: go([], [b]) });
    } else {
      for (const c of choices) {
        options.push({ p: Math.min(1, p) * others * c.p, apply: go(c.flows, [b]) });
      }
    }
  }
  return options;
}

const emptyBuckets = (): Record<ValueBucket, number> => ({ value_adding: 0, supporting: 0, non_value_adding: 0, unrated: 0 });

function shares(values: Record<ValueBucket, number>): Record<ValueBucket, number> {
  const total = VALUE_BUCKETS.reduce((acc, b) => acc + values[b], 0);
  const result = emptyBuckets();
  for (const b of VALUE_BUCKETS) {
    result[b] = total > 0 ? round((values[b] / total) * 100) : 0;
  }
  return result;
}

function build(count: Record<ValueBucket, number>, processing: Record<ValueBucket, number>, cycleTime: number, criticalProcessing: number): ValueFigures {
  const processingTotal = VALUE_BUCKETS.reduce((acc, b) => acc + processing[b], 0);
  const rounded = emptyBuckets();
  const roundedCount = emptyBuckets();
  for (const b of VALUE_BUCKETS) {
    rounded[b] = round(processing[b]);
    roundedCount[b] = round(count[b], 4);
  }
  return {
    count: roundedCount,
    countShare: shares(count),
    processing: rounded,
    processingShare: shares(processing),
    processingTotal: round(processingTotal),
    cycleTime: round(cycleTime),
    criticalProcessing: round(criticalProcessing),
    waiting: round(Math.max(0, cycleTime - criticalProcessing)),
    flowRate: cycleTime > 0 ? round((criticalProcessing / cycleTime) * 100) : 0,
  };
}

function figures(run: Run): ValueFigures {
  const count = emptyBuckets();
  const processing = emptyBuckets();
  for (const step of run.steps) {
    const bucket: ValueBucket = step.valueClass ?? 'unrated';
    count[bucket] += 1;
    processing[bucket] += step.processing;
  }
  return build(count, processing, run.time, run.proc);
}

/**
 * Gewichteter Mittelwert: Anzahl, Bearbeitungs- und Durchlaufzeit sind Erwartungswerte über die Wege;
 * Anteile und Flussrate werden aus diesen Erwartungswerten gebildet.
 */
function meanFigures(runs: Run[], coverage: number): ValueFigures {
  const count = emptyBuckets();
  const processing = emptyBuckets();
  let cycleTime = 0;
  let criticalProcessing = 0;
  const total = coverage || 1;
  for (const run of runs) {
    const w = run.probability / total;
    for (const step of run.steps) {
      const bucket: ValueBucket = step.valueClass ?? 'unrated';
      count[bucket] += w;
      processing[bucket] += w * step.processing;
    }
    cycleTime += w * run.time;
    criticalProcessing += w * run.proc;
  }
  return build(count, processing, cycleTime, criticalProcessing);
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
