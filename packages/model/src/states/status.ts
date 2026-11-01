import { BpmnModdle } from 'bpmn-moddle';
import raci from '../moddle/raci.json' with { type: 'json' };
import bestadd from '../moddle/bestadd.json' with { type: 'json' };
import { modelLanguage, readStateTranslations } from '../i18n/translations.js';
import { stateKey } from './key.js';
import { checkLanes, checkRaci, findParticipant, laneMap } from '../raci/check.js';
import { parseStateLabel } from './label.js';
import { isProcessObjectName } from './processObject.js';
import { catalogLabel, findStatus, type Catalog } from '../catalog/types.js';
import type { ModdleElement, Moddle, ModelIssue, StatusChange, StatusModel } from './types.js';

type El = ModdleElement & Record<string, any>;

const START_EVENT = 'bpmn:StartEvent';
const DATA_OBJECT = 'bpmn:DataObject';
const DATA_OBJECT_REFERENCE = 'bpmn:DataObjectReference';

/** Erzeugt einen BPMN-Parser, der die Namensräume raci und bestadd kennt. */
export function createModdle(): Moddle {
  return new BpmnModdle({ raci, bestadd });
}

/** Liest BPMN-XML und leitet für jeden Prozess die Status seines Vorgangs ab. */
export async function deriveStatusModels(xml: string, catalog: Catalog = {}): Promise<StatusModel[]> {
  const { rootElement } = await createModdle().fromXML(xml);
  return deriveFromDefinitions(rootElement, catalog);
}

/**
 * Leitet die Statusmodelle aus bereits geparsten `bpmn:Definitions` ab: ein Vorgang je Kollaboration,
 * auch wenn sie mehrere Pools hat, und einer je Prozess außerhalb einer Kollaboration.
 */
export function deriveFromDefinitions(definitions: ModdleElement, catalog: Catalog = {}): StatusModel[] {
  const roots = ((definitions as El).rootElements ?? []) as El[];
  const language = modelLanguage(definitions);
  const models: StatusModel[] = [];
  const covered = new Set<El>();
  for (const collaboration of roots.filter((el) => el.$type === 'bpmn:Collaboration')) {
    const pools = ((collaboration.participants ?? []) as El[]).filter((p) => p.processRef);
    if (!pools.length) {
      continue;
    }
    pools.forEach((p) => covered.add(p.processRef));
    const name = collaboration.name || (pools.length === 1 ? pools[0]!.processRef.name : undefined);
    models.push(
      deriveModel(
        { id: collaboration.id ?? '', name, collaboration },
        pools.map((p) => ({ process: p.processRef as El, participant: p })),
        language,
        catalog,
      ),
    );
  }
  for (const process of roots.filter((el) => el.$type === 'bpmn:Process' && !covered.has(el))) {
    models.push(
      deriveModel(
        { id: process.id ?? '', name: process.name },
        [{ process, participant: findParticipant(definitions, process) }],
        language,
        catalog,
      ),
    );
  }
  return models;
}

interface PoolProcess {
  process: El;
  participant?: El;
}

/**
 * Der Ablauf kommt allein aus dem Prozess. Der Status ist eine Zusatzinformation am
 * Vorgang: Output-Verknüpfungen setzen ihn, Input-Verknüpfungen dokumentieren nur.
 * Nur das Datenobjekt „Prozess“ trägt den Status; den Anfangsstatus setzt die erste Aktivität.
 * Mehrere Pools einer Kollaboration bilden zusammen einen Vorgang; Nachrichtenflüsse verbinden sie.
 */
function deriveModel(
  root: { id: string; name?: string; collaboration?: El },
  pools: PoolProcess[],
  language: string,
  catalog: Catalog,
): StatusModel {
  const elements = pools.flatMap(({ process }) => collectFlowElements(process));
  const issues: ModelIssue[] = [];

  const processObjects: El[] = [];
  const references = elements.filter((el) => el.$type === DATA_OBJECT_REFERENCE && isStatusReference(el));

  // Das Datenobjekt „Prozess“ ist freiwillig; ohne es hat der Vorgang keinen Status.
  // Datenobjekte gehören zu einem Pool. Jeder Pool darf deshalb eins haben; alle stehen für denselben Vorgang.
  for (const { process } of pools) {
    const own = collectFlowElements(process).filter((el) => el.$type === DATA_OBJECT && isProcessObjectName(el.name));
    processObjects.push(...own.slice(0, 1));
    for (const extra of own.slice(1)) {
      issues.push({
        code: 'multiple-process-objects',
        severity: 'error',
        elementId: extra.id,
        params: { element: describe(extra) },
      });
    }
  }

  const statusNames: Record<string, string> = {};
  const statusOf = new Map<El, string | undefined>();
  for (const ref of references) {
    const resolved = resolveStatus(ref, issues, catalog);
    if (!resolved) {
      // Am Datenobjekt „Prozess“ ist der Status Pflicht.
      issues.push({
        code: 'reference-without-state',
        severity: 'error',
        elementId: ref.id,
        params: { reference: describe(ref) },
      });
      continue;
    }
    const known = statusNames[resolved.key];
    if (known !== undefined && known !== resolved.name) {
      issues.push({
        code: 'state-key-conflict',
        severity: 'warning',
        elementId: ref.id,
        params: { key: resolved.key, state: resolved.name, other: known },
      });
    } else {
      statusNames[resolved.key] = resolved.name;
    }
    if (catalog.states && !catalog.states.some((s) => s.id === resolved.key)) {
      issues.push({
        code: 'unknown-state',
        severity: 'warning',
        elementId: ref.id,
        params: { state: resolved.key },
      });
    }
    statusOf.set(ref, resolved.key);
  }

  const statuses: string[] = [];
  const addStatus = (status: string | undefined) => {
    if (status && !statuses.includes(status)) {
      statuses.push(status);
    }
  };
  const nameOf = (key: string) => statusNames[key] ?? key;

  const changes: StatusChange[] = [];
  for (const el of elements) {
    const inputs = statusRefs(
      ((el.dataInputAssociations ?? []) as El[]).flatMap((a) => (a.sourceRef ?? []) as El[]),
      references,
    );
    const outputs = statusRefs(
      ((el.dataOutputAssociations ?? []) as El[]).map((a) => a.targetRef as El),
      references,
    );
    if (inputs.length === 0 && outputs.length === 0) {
      continue;
    }
    if (el.$type === START_EVENT && outputs.length > 0) {
      issues.push({
        code: 'start-event-state',
        severity: 'error',
        elementId: el.id,
        params: { element: describe(el) },
      });
      continue;
    }

    const change: StatusChange = {
      elementId: el.id ?? '',
      ...(el.name ? { elementName: el.name } : {}),
      elementType: el.$type,
      outputs: unique(outputs.map((ref) => statusOf.get(ref))),
      documentedInputs: unique(inputs.map((ref) => statusOf.get(ref))),
    };
    change.documentedInputs.forEach(addStatus);
    change.outputs.forEach(addStatus);
    changes.push(change);
  }

  for (const ref of references) {
    addStatus(statusOf.get(ref));
  }

  // Den Anfangsstatus setzt je Startereignis die erste Aktivität mit Output auf „Prozess“. Davor darf es
  // Aktivitäten ohne Status geben, z. B. manuelle Tätigkeiten.
  const settingStatus = new Set(changes.filter((c) => c.outputs.length > 0).map((c) => c.elementId));
  const initialStatuses: string[] = [];
  for (const activity of firstStatusActivities(pools, root.collaboration, settingStatus)) {
    for (const status of changes.find((c) => c.elementId === activity.id)?.outputs ?? []) {
      if (!initialStatuses.includes(status)) {
        initialStatuses.push(status);
      }
    }
  }

  const settable = new Set(changes.flatMap((c) => c.outputs));
  for (const change of changes) {
    for (const status of change.documentedInputs) {
      if (!settable.has(status)) {
        issues.push({
          code: 'input-state-never-set',
          severity: 'warning',
          elementId: change.elementId,
          params: { element: change.elementName ?? change.elementId, state: nameOf(status) },
        });
      }
    }
  }

  for (const { process, participant } of pools) {
    issues.push(
      ...checkLanes(process),
      ...checkRaci(collectFlowElements(process), laneMap(process, participant), catalog.roles),
    );
  }

  const dataObject = processObjects[0];
  const statusTranslations: Record<string, Record<string, string>> = {};
  for (const object of processObjects) {
    for (const [key, values] of Object.entries(readStateTranslations(object))) {
      statusTranslations[key] = { ...values, ...statusTranslations[key] };
    }
  }
  for (const status of catalog.states ?? []) {
    if (!statuses.includes(status.id)) {
      continue;
    }
    // Die Statustabelle geht den Übersetzungen im Modell vor.
    statusNames[status.id] = catalogLabel(status, language);
    statusTranslations[status.id] = { en: status.name, ...(status.translations as Record<string, string>) };
  }

  return {
    processId: root.id,
    ...(root.name ? { processName: root.name } : {}),
    processIds: pools.map(({ process }) => process.id ?? ''),
    ...(dataObject?.id ? { dataObjectId: dataObject.id } : {}),
    ...(dataObject?.name ? { dataObjectName: dataObject.name } : {}),
    language,
    statuses,
    statusNames,
    statusTranslations,
    initialStatuses,
    changes,
    issues,
  };
}

/** Zeigt die Referenz auf das Datenobjekt „Prozess“? Ohne DataObject zählt die Beschriftung `Prozess [...]`. */
function isStatusReference(ref: El): boolean {
  const dataObject = ref.dataObjectRef as El | undefined;
  return dataObject ? isProcessObjectName(dataObject.name) : isProcessObjectName(parseStateLabel(ref.name)?.object);
}

/**
 * Je Startereignis der obersten Prozessebene die ersten Aktivitäten, die einen Status setzen.
 * Der Weg folgt dem Sequenzfluss und geht über Gateways, Ereignisse und Aktivitäten ohne Status hinweg.
 * In einer Kollaboration folgt er auch den Nachrichtenflüssen in andere Pools. Ein Startereignis,
 * das eine Nachricht aus einem anderen Pool auslöst, ist kein eigener Anfang, sondern Fortsetzung.
 */
function firstStatusActivities(pools: PoolProcess[], collaboration: El | undefined, settingStatus: Set<string>): El[] {
  const result: El[] = [];
  const nodes = pools.flatMap(({ process }) => (process.flowElements ?? []) as El[]);
  const startsOf = (process: El) => ((process.flowElements ?? []) as El[]).filter((el) => el.$type === START_EVENT);
  // Über `sourceRef` statt `outgoing`, weil fremde Werkzeuge `outgoing` nicht immer schreiben.
  const flows = nodes.filter((el) => el.$type === 'bpmn:SequenceFlow');
  const messageFlows = ((collaboration?.messageFlows ?? []) as El[]).filter((f) => f.sourceRef && f.targetRef);
  // Ziel eines Nachrichtenflusses: ein Element oder ein ganzer Pool, dann dessen Startereignisse.
  const targetsOf = (flow: El): El[] =>
    flow.targetRef.$type === 'bpmn:Participant'
      ? flow.targetRef.processRef
        ? startsOf(flow.targetRef.processRef)
        : []
      : [flow.targetRef];
  const triggered = new Set(messageFlows.flatMap(targetsOf));
  const next = (node: El): El[] => [
    ...flows.filter((f) => f.sourceRef === node).map((f) => f.targetRef as El),
    ...messageFlows.filter((f) => f.sourceRef === node).flatMap(targetsOf),
  ];

  for (const start of nodes.filter((el) => el.$type === START_EVENT && !triggered.has(el))) {
    const seen = new Set<El>([start]);
    const queue: El[] = [start];
    while (queue.length) {
      const node = queue.shift()!;
      for (const target of next(node)) {
        if (!target || seen.has(target)) {
          continue;
        }
        seen.add(target);
        if (target.id && settingStatus.has(target.id)) {
          if (!result.includes(target)) {
            result.push(target);
          }
        } else {
          queue.push(target);
        }
      }
    }
  }
  return result;
}

/**
 * Der dataState-Eintrag ist maßgeblich. Fehlt er, gilt der Status aus der Beschriftung
 * `Objekt [Status]`, damit auch Modelle aus anderen Werkzeugen lesbar bleiben.
 * Der Schlüssel kommt aus `bestadd:key`, sonst aus der Statustabelle (ID oder Name), sonst aus dem Namen.
 */
function resolveStatus(ref: El, issues: ModelIssue[], catalog: Catalog): { key: string; name: string } | undefined {
  const dataState = ref.dataState as El | undefined;
  const fromElement = dataState?.name?.trim() || undefined;
  const fromLabel = parseStateLabel(ref.name)?.state;

  if (fromLabel && fromElement && fromLabel !== fromElement) {
    issues.push({
      code: 'label-state-mismatch',
      severity: 'warning',
      elementId: ref.id,
      params: { label: fromLabel, state: fromElement },
    });
  } else if (fromLabel && !fromElement) {
    issues.push({
      code: 'state-only-in-label',
      severity: 'warning',
      elementId: ref.id,
      params: { state: fromLabel },
    });
  }
  const name = fromElement ?? fromLabel;
  if (!name) {
    return undefined;
  }
  const key = (dataState?.key as string | undefined)?.trim() || findStatus(catalog.states, name)?.id || stateKey(name);
  return { key, name };
}

function collectFlowElements(container: El): El[] {
  const result: El[] = [];
  for (const el of (container.flowElements ?? []) as El[]) {
    result.push(el);
    if (el.flowElements) {
      result.push(...collectFlowElements(el));
    }
  }
  return result;
}

function statusRefs(elements: (El | undefined)[], references: El[]): El[] {
  return elements.filter((el): el is El => !!el && references.includes(el));
}

function unique(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

function describe(el: El): string {
  return el.name || el.id || el.$type;
}
