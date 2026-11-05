import type { TFunction } from '@bestbpmn/i18n';
import type { ElementNavigation } from '@bestbpmn/bpmn-js-extension';

/**
 * Zwei kleine Pfeile oben rechts im Eigenschaftenbereich: blättern durch die Elemente derselben Art.
 * Sitzt über der Kopfzeile des Panels und gehört nicht zu dessen Baum, damit das Panel sie nicht überschreibt.
 */
export function mountNavigation(parent: HTMLElement, modeler: any, t: TFunction): void {
  parent.querySelector('.element-nav')?.remove();
  const nav = document.createElement('div');
  nav.className = 'element-nav';
  nav.innerHTML = `<button type="button" data-step="-1" aria-label="${t('app.navigation.previous')}" title="${t('app.navigation.previous')}">‹</button><span class="element-nav-position"></span><button type="button" data-step="1" aria-label="${t('app.navigation.next')}" title="${t('app.navigation.next')}">›</button>`;
  parent.prepend(nav);

  const navigation: ElementNavigation = modeler.get('bestbpmnNavigation');
  const selection = modeler.get('selection');
  const [previous, next] = [...nav.querySelectorAll<HTMLButtonElement>('button')] as [HTMLButtonElement, HTMLButtonElement];
  const label = nav.querySelector<HTMLElement>('.element-nav-position')!;
  const current = () => {
    const selected = selection.get();
    return selected.length === 1 ? selected[0] : undefined;
  };
  const update = () => {
    const position = navigation.position(current());
    // Nur zeigen, wenn es mindestens ein zweites Element dieser Art gibt.
    nav.hidden = !position || position.count < 2;
    if (position) {
      previous.disabled = !position.previous;
      next.disabled = !position.next;
      label.textContent = t('app.navigation.position', { index: position.index + 1, count: position.count });
    }
  };
  nav.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-step]');
    const element = current();
    if (button && element) {
      navigation.step(element, Number(button.dataset.step) as -1 | 1);
    }
  });
  modeler.on(['selection.changed', 'elements.changed', 'import.done', 'root.set'], update);
  update();
}
