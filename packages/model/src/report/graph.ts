import type { ModdleElement } from '../states/types.js';

type El = ModdleElement & Record<string, any>;

const cache = new WeakMap<object, El[]>();

/** Sequenzflüsse eines Prozesses oder Teilprozesses (einmal gesammelt). */
function sequenceFlows(container: El | undefined): El[] {
  if (!container) {
    return [];
  }
  let flows = cache.get(container);
  if (!flows) {
    flows = ((container.flowElements ?? []) as El[]).filter((f) => f.$type === 'bpmn:SequenceFlow');
    cache.set(container, flows);
  }
  return flows;
}

/**
 * Ausgehende Sequenzflüsse. Sie kommen aus `sourceRef` der Flüsse, nicht aus `<bpmn:outgoing>`:
 * Das fehlt in manchen Dateien anderer Werkzeuge.
 */
export const outgoing = (el: El): El[] => sequenceFlows(el.$parent).filter((f) => f.sourceRef === el);
export const incoming = (el: El): El[] => sequenceFlows(el.$parent).filter((f) => f.targetRef === el);
