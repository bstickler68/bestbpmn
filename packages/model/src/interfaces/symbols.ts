import { readDescription } from '../attributes/read.js';
import { isProcessObjectName } from '../states/processObject.js';
import type { ModdleElement, ModelIssue } from '../states/types.js';

type El = ModdleElement & Record<string, any>;

/**
 * Prozess- und Schnittstellensymbole: Textanmerkungen mit `bestadd:symbol`, über gerichtete
 * Assoziationen mit Start- und Endereignissen verbunden. Sie beschreiben nur und steuern nichts.
 */
export type SymbolKind = 'process' | 'interface';

/** Typen einer Schnittstelle, feste Liste. Die Texte stehen in `packages/i18n` unter `interfaceType.<Schlüssel>`. */
export const INTERFACE_TYPES = ['document', 'record', 'event', 'system', 'material', 'other'] as const;
export type InterfaceType = (typeof INTERFACE_TYPES)[number];

/** Rolle eines Elements bei den Verbindungsregeln. */
export type SymbolEnd = SymbolKind | 'start' | 'end' | 'other';

/** Erweitertes Attribut `bestadd:<name>` einer Textanmerkung. */
function attr(el: El, name: string): string | undefined {
  const value = el[name] ?? el.$attrs?.[`bestadd:${name}`];
  return typeof value === 'string' && value ? value : undefined;
}

const TEXT_ANNOTATION = 'bpmn:TextAnnotation';
const ASSOCIATION = 'bpmn:Association';

/** Art des Symbols einer Textanmerkung, sonst `undefined`. */
export function symbolKind(el: ModdleElement | undefined): SymbolKind | undefined {
  const bo = el as El | undefined;
  if (bo?.$type !== TEXT_ANNOTATION) {
    return undefined;
  }
  const symbol = attr(bo, 'symbol');
  return symbol === 'process' || symbol === 'interface' ? symbol : undefined;
}

/** Start- oder Endereignis der obersten Ebene eines Prozesses; nur dort hängen die Symbole. */
function eventEnd(bo: El): 'start' | 'end' | undefined {
  const topLevel = bo.$parent?.$type === 'bpmn:Process';
  if (!topLevel) {
    return undefined;
  }
  return bo.$type === 'bpmn:StartEvent' ? 'start' : bo.$type === 'bpmn:EndEvent' ? 'end' : undefined;
}

export function symbolEnd(el: ModdleElement | undefined): SymbolEnd {
  const bo = el as El | undefined;
  if (!bo) {
    return 'other';
  }
  return symbolKind(bo) ?? eventEnd(bo) ?? 'other';
}

/** Erlaubte Verbindungen in Pfeilrichtung. */
const ALLOWED: ReadonlyArray<readonly [SymbolEnd, SymbolEnd]> = [
  ['process', 'start'],
  ['process', 'interface'],
  ['interface', 'start'],
  ['end', 'process'],
  ['end', 'interface'],
  ['interface', 'process'],
];

/** Ob die Verbindung `source → target` nach der Tabelle erlaubt ist (ohne Blick auf andere Verbindungen). */
export function isAllowedSymbolConnection(source: ModdleElement | undefined, target: ModdleElement | undefined): boolean {
  const from = symbolEnd(source);
  const to = symbolEnd(target);
  return ALLOWED.some(([a, b]) => a === from && b === to);
}

/** Richtung einer Verbindung aus Sicht der Schnittstelle: `in` vor einem Start, `out` hinter einem Ende. */
function directionAt(iface: El, other: El, ifaceIsSource: boolean): 'in' | 'out' | undefined {
  const end = symbolEnd(other);
  if (ifaceIsSource) {
    return end === 'start' ? 'in' : end === 'process' ? 'out' : undefined;
  }
  return end === 'process' ? 'in' : end === 'end' ? 'out' : undefined;
}

/**
 * Richtungen, in denen eine Schnittstelle schon verbunden ist. Eine Schnittstelle ist Input (`in`)
 * oder Output (`out`), nicht beides.
 */
export function interfaceDirections(iface: ModdleElement, associations: ModdleElement[]): Set<'in' | 'out'> {
  const result = new Set<'in' | 'out'>();
  for (const a of associations as El[]) {
    if (a.sourceRef === iface) {
      const d = directionAt(iface as El, a.targetRef, true);
      d && result.add(d);
    } else if (a.targetRef === iface) {
      const d = directionAt(iface as El, a.sourceRef, false);
      d && result.add(d);
    }
  }
  return result;
}

/**
 * Ob `source → target` erlaubt ist, auch im Zusammenspiel mit den übrigen Verbindungen:
 * Eine Schnittstelle darf nicht zugleich Input und Output werden.
 */
export function canConnectSymbols(source: ModdleElement, target: ModdleElement, associations: ModdleElement[] = []): boolean {
  if (!isAllowedSymbolConnection(source, target)) {
    return false;
  }
  for (const [iface, other, isSource] of [
    [source, target, true],
    [target, source, false],
  ] as const) {
    if (symbolKind(iface) !== 'interface') {
      continue;
    }
    const direction = directionAt(iface as El, other as El, isSource);
    const existing = interfaceDirections(
      iface,
      associations.filter((a) => !((a as El).sourceRef === source && (a as El).targetRef === target)),
    );
    if (direction && [...existing].some((d) => d !== direction)) {
      return false;
    }
  }
  return true;
}

/** Ein Prozesssymbol im Steckbrief. */
export interface ProcessSymbolEntry {
  id: string;
  name?: string;
  /** Freie Kennung des Prozesses, z. B. aus der Prozesslandkarte. */
  processRef?: string;
  description?: string;
}

/** Eine Schnittstelle im Steckbrief. */
export interface InterfaceEntry {
  id: string;
  name?: string;
  /** Typ aus `INTERFACE_TYPES`; ein unbekannter Wert bleibt erhalten. */
  type?: string;
  description?: string;
  /** Vor- (bei Inputs) bzw. nachgelagerte Prozesse (bei Outputs), an denen die Schnittstelle hängt. */
  processes: ProcessSymbolEntry[];
  /** Namen oder IDs der Start- bzw. Endereignisse. */
  events: string[];
}

/** Prozessketten eines Modells: vor- und nachgelagerte Prozesse, Inputs und Outputs. */
export interface ProcessChain {
  upstream: ProcessSymbolEntry[];
  downstream: ProcessSymbolEntry[];
  inputs: InterfaceEntry[];
  outputs: InterfaceEntry[];
}

/** Alle Artefakte von Prozessen (auch in Teilprozessen) und Kollaborationen. */
function artifactsOf(container: El): El[] {
  const own = (container.artifacts ?? []) as El[];
  const nested = ((container.flowElements ?? []) as El[]).filter((el) => el.flowElements || el.artifacts).flatMap(artifactsOf);
  return [...own, ...nested];
}

/** Symbole und Assoziationen aus den angegebenen Prozessen und Kollaborationen. */
export function collectSymbolArtifacts(containers: ModdleElement[]): { symbols: El[]; associations: El[] } {
  const artifacts = [...new Set((containers as El[]).filter(Boolean).flatMap(artifactsOf))];
  return {
    symbols: artifacts.filter((a) => symbolKind(a)),
    associations: artifacts.filter((a) => a.$type === ASSOCIATION),
  };
}

function processEntry(el: El): ProcessSymbolEntry {
  const description = readDescription(el);
  const processRef = attr(el, 'processRef');
  return {
    id: el.id ?? '',
    ...(el.text ? { name: el.text as string } : {}),
    ...(processRef ? { processRef } : {}),
    ...(description ? { description } : {}),
  };
}

const label = (el: El) => (el.name as string | undefined) || el.id || '';

/** Leitet Prozessketten aus den Symbolen eines Modells ab. */
export function deriveProcessChain(definitions: ModdleElement): ProcessChain {
  const roots = ((definitions as El).rootElements ?? []) as El[];
  const { symbols, associations } = collectSymbolArtifacts(roots.filter((r) => r.$type === 'bpmn:Process' || r.$type === 'bpmn:Collaboration'));
  const valid = associations.filter((a) => isAllowedSymbolConnection(a.sourceRef, a.targetRef));
  const targets = (el: El) => valid.filter((a) => a.sourceRef === el).map((a) => a.targetRef as El);
  const sources = (el: El) => valid.filter((a) => a.targetRef === el).map((a) => a.sourceRef as El);

  const upstream: El[] = [];
  const downstream: El[] = [];
  const inputs: InterfaceEntry[] = [];
  const outputs: InterfaceEntry[] = [];
  const add = (list: El[], el: El) => !list.includes(el) && list.push(el);

  for (const symbol of symbols) {
    if (symbolKind(symbol) === 'process') {
      const after = targets(symbol);
      const before = sources(symbol);
      if (after.some((t) => symbolEnd(t) === 'start' || (symbolKind(t) === 'interface' && targets(t).some((x) => symbolEnd(x) === 'start')))) {
        add(upstream, symbol);
      }
      if (before.some((s) => symbolEnd(s) === 'end' || (symbolKind(s) === 'interface' && sources(s).some((x) => symbolEnd(x) === 'end')))) {
        add(downstream, symbol);
      }
      continue;
    }
    const description = readDescription(symbol);
    const type = attr(symbol, 'interfaceType');
    const base = {
      id: symbol.id ?? '',
      ...(symbol.text ? { name: symbol.text as string } : {}),
      ...(type ? { type } : {}),
      ...(description ? { description } : {}),
    };
    const starts = targets(symbol).filter((t) => symbolEnd(t) === 'start');
    const ends = sources(symbol).filter((s) => symbolEnd(s) === 'end');
    if (starts.length) {
      inputs.push({ ...base, processes: sources(symbol).filter((s) => symbolKind(s) === 'process').map(processEntry), events: starts.map(label) });
    } else if (ends.length) {
      outputs.push({ ...base, processes: targets(symbol).filter((t) => symbolKind(t) === 'process').map(processEntry), events: ends.map(label) });
    }
  }
  return { upstream: upstream.map(processEntry), downstream: downstream.map(processEntry), inputs, outputs };
}

const describe = (el: El): string => (el.text as string | undefined) || (el.name as string | undefined) || el.id || el.$type;

/**
 * Hinweise zu den Symbolen eines Modells. `processes` sind seine Pools bzw. sein Prozess,
 * `collaboration` die Kollaboration, falls es eine gibt.
 */
export function checkSymbols(processes: ModdleElement[], collaboration?: ModdleElement): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const { symbols, associations } = collectSymbolArtifacts([...processes, ...(collaboration ? [collaboration] : [])]);

  for (const a of associations) {
    const involved = symbolKind(a.sourceRef) || symbolKind(a.targetRef);
    if (involved && !canConnectSymbols(a.sourceRef, a.targetRef, associations)) {
      issues.push({
        code: 'symbol-invalid-connection',
        severity: 'warning',
        elementId: a.id,
        params: { source: describe(a.sourceRef ?? {}), target: describe(a.targetRef ?? {}) },
      });
    }
  }

  const valid = associations.filter((a) => isAllowedSymbolConnection(a.sourceRef, a.targetRef));
  const neighbours = (el: El) =>
    valid.flatMap((a) => (a.sourceRef === el ? [a.targetRef as El] : a.targetRef === el ? [a.sourceRef as El] : []));
  const reachesEvent = (el: El, seen = new Set<El>()): boolean => {
    seen.add(el);
    return neighbours(el).some((n) => {
      const end = symbolEnd(n);
      if (end === 'start' || end === 'end') {
        return true;
      }
      return !seen.has(n) && symbolKind(n) === 'interface' && reachesEvent(n, seen);
    });
  };

  for (const symbol of symbols) {
    if (symbolKind(symbol) === 'interface') {
      const type = attr(symbol, 'interfaceType');
      if (!type) {
        issues.push({ code: 'interface-without-type', severity: 'warning', elementId: symbol.id, params: { element: describe(symbol) } });
      }
    }
    if (!reachesEvent(symbol)) {
      issues.push({ code: 'symbol-not-connected', severity: 'warning', elementId: symbol.id, params: { element: describe(symbol) } });
    }
  }

  // Das alte Notkonstrukt: Datenobjekte an Start- und Endereignissen.
  for (const process of processes as El[]) {
    for (const event of ((process.flowElements ?? []) as El[]).filter((el) => el.$type === 'bpmn:StartEvent' || el.$type === 'bpmn:EndEvent')) {
      const data = [
        ...((event.dataOutputAssociations ?? []) as El[]).map((a) => a.targetRef as El),
        ...((event.dataInputAssociations ?? []) as El[]).flatMap((a) => (a.sourceRef ?? []) as El[]),
      ].filter((d) => d && !isProcessObjectName((d.name as string | undefined)?.replace(/\s*\[[^\]]*\]\s*$/, '').trim()));
      for (const d of data) {
        issues.push({
          code: 'data-at-start-or-end',
          severity: 'warning',
          elementId: event.id,
          params: { element: describe(event), data: describe(d) },
        });
      }
    }
  }
  return issues;
}
