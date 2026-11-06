import { gatewayDeciders } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { is, type DiagramElement } from './util';

const OVERLAY_TYPE = 'bestbpmn-gateway';

/**
 * Zeigt an exklusiven und inklusiven Gateways, wer entscheidet: 👤 verzweigt nach dem Ergebnis einer
 * Person, ⚙ nach Feldwerten. Erkannt wird das an den Bedingungen der Wege; gespeichert wird nichts.
 */
export default class GatewayOverlays {
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
      const bo = element.businessObject;
      if (element.labelTarget || !(is(bo, 'bpmn:ExclusiveGateway') || is(bo, 'bpmn:InclusiveGateway'))) {
        continue;
      }
      const { person, system } = gatewayDeciders(bo as any);
      if (!person && !system) {
        continue;
      }
      const node = document.createElement('div');
      node.className = 'bestbpmn-gateway';
      node.textContent = [person ? '👤' : '', system ? '⚙' : ''].join('');
      node.title = [person ? this.i18n.t('gateway.person') : '', system ? this.i18n.t('gateway.system') : ''].filter(Boolean).join('\n');
      this.overlays.add(element.id, OVERLAY_TYPE, { position: { top: -14, right: 2 }, html: node });
    }
  }
}
