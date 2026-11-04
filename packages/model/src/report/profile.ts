import { readAttributes, readDescription } from '../attributes/read.js';
import type { LinkValue, ServiceRefValue } from '../attributes/types.js';
import { deriveRaciMatrices } from '../raci/matrix.js';
import { isProcessObjectName } from '../states/processObject.js';
import type { ModdleElement } from '../states/types.js';
import { incoming, outgoing } from './graph.js';
import { dedupe, eventKind, flowOrder, positions, type ElementKind } from './elements.js';

type El = ModdleElement & Record<string, any>;

/** Ein Element im Steckbrief: Name, Beschreibung und, bei Ereignissen, die Art. */
export interface ProfileEntry {
  id: string;
  name?: string;
  description?: string;
  kind?: ElementKind;
}

/** Ein Datenobjekt oder Datenspeicher; `state` ist der Status in eckigen Klammern. */
export interface ProfileData {
  id: string;
  name?: string;
  state?: string;
  store?: boolean;
}

/**
 * Steckbrief eines Modells. Alles kommt aus dem Modell; mehrfach Vorkommendes steht nur einmal da.
 */
export interface ProcessProfile {
  name?: string;
  description?: string;
  /** Alle Startereignisse. */
  triggers: ProfileEntry[];
  /** Alle Endereignisse. */
  endStates: ProfileEntry[];
  /** Je Startereignis die erste Aktivität. */
  firstActivities: ProfileEntry[];
  /** Je Endereignis die letzte Aktivität davor. */
  lastActivities: ProfileEntry[];
  /** Datenobjekte und -speicher an Startereignissen. */
  inputs: ProfileData[];
  /** Datenobjekte und -speicher an Endereignissen. */
  outputs: ProfileData[];
  resources: {
    /** Rollen und Gruppen aus der DEMI-Matrix in der Schreibweise des Modells, z. B. `group(Einkauf)`. */
    people: string[];
    /** Datenobjekte, die in Aktivitäten eingehen. */
    documents: ProfileData[];
    /** Links an den Aktivitäten. */
    links: LinkValue[];
    /** IT-Services an den Aktivitäten. */
    systems: ServiceRefValue[];
  };
}

/** Name des Modells: Kollaboration, sonst der einzige Prozess bzw. Pool. */
function modelInfo(definitions: El): { name?: string; description?: string } {
  const roots = (definitions.rootElements ?? []) as El[];
  const collaboration = roots.find((el) => el.$type === 'bpmn:Collaboration');
  const processes = roots.filter((el) => el.$type === 'bpmn:Process');
  const participants = (collaboration?.participants ?? []) as El[];
  const candidates = [collaboration, ...(participants.length === 1 ? participants : []), ...(processes.length === 1 ? processes : [])].filter(
    Boolean,
  ) as El[];
  const name = candidates.map((el) => el.name).find(Boolean);
  const description = candidates.map((el) => readDescription(el)).find(Boolean);
  return { ...(name ? { name } : {}), ...(description ? { description } : {}) };
}

/** Alle Flussknoten eines Prozesses, auch in Teilprozessen. */
function allNodes(container: El): El[] {
  return ((container.flowElements ?? []) as El[]).flatMap((el) =>
    el.$type === 'bpmn:SubProcess' || el.$type === 'bpmn:Transaction' || el.$type === 'bpmn:AdHocSubProcess' ? [el, ...allNodes(el)] : [el],
  );
}

const isActivity = (el: El) => el.$instanceOf?.('bpmn:Activity') ?? false;
const isTraversable = (el: El) => el.$instanceOf?.('bpmn:Gateway') || el.$type === 'bpmn:IntermediateCatchEvent' || el.$type === 'bpmn:IntermediateThrowEvent';

/** Folgt den Sequenzflüssen über Gateways und Zwischenereignisse bis zu den nächsten Aktivitäten. */
function nearestActivities(start: El, direction: 'forward' | 'backward'): El[] {
  const result: El[] = [];
  const seen = new Set<El>([start]);
  const step = (el: El) =>
    direction === 'forward' ? outgoing(el).map((f) => f.targetRef as El) : incoming(el).map((f) => f.sourceRef as El);
  const queue = step(start);
  while (queue.length) {
    const el = queue.shift()!;
    if (!el || seen.has(el)) {
      continue;
    }
    seen.add(el);
    if (isActivity(el)) {
      result.push(el);
    } else if (isTraversable(el)) {
      queue.push(...step(el));
    }
  }
  return result;
}

function entry(el: El, withKind = false): ProfileEntry {
  const description = readDescription(el);
  return {
    id: el.id ?? '',
    ...(el.name ? { name: el.name } : {}),
    ...(description ? { description } : {}),
    ...(withKind ? { kind: eventKind(el) } : {}),
  };
}

function data(el: El): ProfileData | undefined {
  if (!el || !(el.$type === 'bpmn:DataObjectReference' || el.$type === 'bpmn:DataStoreReference')) {
    return undefined;
  }
  const name = (el.name as string | undefined)?.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  // Das Datenobjekt „Prozess“ trägt nur den Status und ist kein Input oder Output.
  if (isProcessObjectName(name)) {
    return undefined;
  }
  return {
    id: el.id ?? '',
    ...(name ? { name } : {}),
    ...(el.dataState?.name ? { state: el.dataState.name } : {}),
    ...(el.$type === 'bpmn:DataStoreReference' ? { store: true } : {}),
  };
}

const dataKey = (d: ProfileData) => `${d.store ? 's' : 'o'}:${d.name ?? d.id}:${d.state ?? ''}`;

/** Leitet den Steckbrief aus dem Modell ab. */
export function deriveProfile(definitions: ModdleElement): ProcessProfile {
  const defs = definitions as El;
  const where = positions(definitions);
  const processes = ((defs.rootElements ?? []) as El[]).filter((el) => el.$type === 'bpmn:Process');
  const orders = processes.map((p) => flowOrder(((p.flowElements ?? []) as El[]).filter((el) => el.$instanceOf?.('bpmn:FlowNode')), where));
  const nodes = processes.flatMap(allNodes);

  const starts = orders.flat().filter((el) => el.$type === 'bpmn:StartEvent');
  // Das Endereignis des Hauptwegs steht in der Ablaufreihenfolge zuletzt, im Steckbrief zuerst.
  const ends = orders.flatMap((order) => {
    const found = order.filter((el) => el.$type === 'bpmn:EndEvent');
    return found.length ? [found[found.length - 1]!, ...found.slice(0, -1)] : [];
  });
  const activities = nodes.filter(isActivity);

  const byId = (items: ProfileEntry[]) => dedupe(items, (e) => e.id);
  const inputs = starts.flatMap((s) => [
    ...((s.dataOutputAssociations ?? []) as El[]).map((a) => data(a.targetRef)),
    ...((s.dataInputAssociations ?? []) as El[]).flatMap((a) => ((a.sourceRef ?? []) as El[]).map(data)),
  ]);
  const outputs = ends.flatMap((e) => [
    ...((e.dataInputAssociations ?? []) as El[]).flatMap((a) => ((a.sourceRef ?? []) as El[]).map(data)),
    ...((e.dataOutputAssociations ?? []) as El[]).map((a) => data(a.targetRef)),
  ]);
  const documents = activities.flatMap((a) =>
    ((a.dataInputAssociations ?? []) as El[]).flatMap((assoc) => ((assoc.sourceRef ?? []) as El[]).map(data)),
  );
  const attributes = nodes.flatMap((el) => readAttributes(el));

  return {
    ...modelInfo(defs),
    triggers: byId(starts.map((s) => entry(s, true))),
    endStates: byId(ends.map((e) => entry(e, true))),
    firstActivities: byId(starts.flatMap((s) => nearestActivities(s, 'forward')).map((el) => entry(el))),
    lastActivities: byId(ends.flatMap((e) => nearestActivities(e, 'backward')).map((el) => entry(el))),
    inputs: dedupe(inputs.filter(Boolean) as ProfileData[], dataKey),
    outputs: dedupe(outputs.filter(Boolean) as ProfileData[], dataKey),
    resources: {
      people: dedupe(
        deriveRaciMatrices(definitions).flatMap((m) => m.columns),
        (c) => c,
      ),
      // Ein Dokument steht nur einmal da, egal in welchem Status es in die Aktivitäten eingeht.
      documents: dedupe(
        (documents.filter(Boolean) as ProfileData[]).map(({ state: _state, ...rest }) => rest),
        dataKey,
      ),
      links: dedupe(
        attributes.flatMap((a) => a.links),
        (l) => l.href,
      ),
      systems: dedupe(
        attributes.flatMap((a) => a.services),
        (s) => s.ref || s.name || '',
      ),
    },
  };
}
