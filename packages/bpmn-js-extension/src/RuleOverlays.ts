import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { findRules, ruleKindsOf } from './rules';
import type { DiagramElement } from './util';

const OVERLAY_TYPE = 'bestbpmn-rules';

/**
 * Zeigt an Aktivitäten mit Regel-Kennzeichen ein kleines Symbol „§ n“ mit der Anzahl.
 * Der Tooltip nennt die Kennzeichen und die Beschreibung. Gespeichert wird dabei nichts.
 */
export default class RuleOverlays {
  static $inject = ['eventBus', 'overlays', 'elementRegistry', 'config.bestbpmn'];

  private i18n: BestbpmnI18n;

  constructor(
    eventBus: any,
    private overlays: any,
    private elementRegistry: any,
    config: BestbpmnConfig | undefined,
  ) {
    this.i18n = resolveI18n(config);
    eventBus.on(['import.done', 'commandStack.changed'], () => {
      this.update();
    });
  }

  private update() {
    this.overlays.remove({ type: OVERLAY_TYPE });
    for (const element of this.elementRegistry.getAll() as DiagramElement[]) {
      if (element.labelTarget) {
        continue;
      }
      const kinds = ruleKindsOf(element.businessObject);
      if (kinds.length) {
        const description = findRules(element.businessObject)?.description;
        const names = kinds.map((k) => this.i18n.t(`ruleKind.${k}`)).join(', ');
        const node = document.createElement('div');
        node.className = 'bestbpmn-rules';
        node.title = description ? `${names}\n${description}` : names;
        node.textContent = `§ ${kinds.length}`;
        this.overlays.add(element.id, OVERLAY_TYPE, { position: { top: -10, left: 12 }, html: node });
      }
    }
  }
}
