import { findAttribute, resolveDefinitions, type PraxiqConfig } from './attributes';
import type { BusinessObject, DiagramElement } from './util';

const OVERLAY_TYPE = 'praxiq-services';
export const SERVICES_TOGGLED = 'praxiq.services.toggled';

/**
 * Zeigt an Aktivitäten, mit welchen IT-Services sie durchgeführt werden.
 * Standard ist ein kleines Symbol mit der Anzahl; die Namen lassen sich einblenden.
 * Gespeichert wird dabei nichts, das Diagramm selbst bleibt unverändert.
 */
export default class ServiceOverlays {
  static $inject = ['eventBus', 'overlays', 'elementRegistry', 'config.praxiq'];

  private keys: string[];
  private showNames = false;

  constructor(
    eventBus: any,
    private overlays: any,
    private elementRegistry: any,
    config: PraxiqConfig | undefined,
  ) {
    this.keys = resolveDefinitions(config)
      .filter((d) => d.type === 'services')
      .map((d) => d.key);
    eventBus.on(['import.done', 'commandStack.changed'], () => {
      this.update();
    });
  }

  /** Blendet die Namen der Services an den Aktivitäten ein oder aus. */
  toggleNames(show = !this.showNames) {
    this.showNames = show;
    this.update();
    return show;
  }

  isShowingNames() {
    return this.showNames;
  }

  /** Namen der Services an einem Element, in der Reihenfolge im Modell. */
  servicesOf(element: DiagramElement): string[] {
    return this.keys.flatMap((key) =>
      ((findAttribute(element.businessObject, key)?.items ?? []) as BusinessObject[])
        .filter((item) => item.$type === 'praxiq:ServiceRef')
        .map((item) => item.name ?? item.ref),
    );
  }

  private update() {
    this.overlays.remove({ type: OVERLAY_TYPE });
    for (const element of this.elementRegistry.getAll() as DiagramElement[]) {
      if (element.labelTarget) {
        continue;
      }
      const names = this.servicesOf(element);
      if (names.length) {
        this.overlays.add(element.id, OVERLAY_TYPE, {
          // Anzahl oben rechts, Namen unter der Aktivität.
          position: this.showNames ? { bottom: -4, left: 0 } : { top: -10, right: 12 },
          html: this.render(names),
        });
      }
    }
  }

  private render(names: string[]) {
    const node = document.createElement('div');
    node.className = 'praxiq-services';
    node.title = names.join(', ');
    if (this.showNames) {
      node.classList.add('praxiq-services--names');
      node.textContent = names.join(' · ');
    } else {
      node.textContent = `⚙ ${names.length}`;
    }
    return node;
  }
}
