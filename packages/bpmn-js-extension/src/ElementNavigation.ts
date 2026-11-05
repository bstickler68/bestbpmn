import { isHorizontal } from 'bpmn-js/lib/util/DiUtil';
import { is, type DiagramElement } from './util';

/** Arten, innerhalb derer geblättert wird. */
export type NavigationGroup = 'activity' | 'event' | 'gateway' | 'data' | 'swimlane' | 'annotation';

type Shape = DiagramElement & { x: number; y: number; width: number; height: number; waypoints?: unknown };

/** Die Art eines Elements; `undefined` für alles, durch das nicht geblättert wird (Verbindungen, Beschriftungen, Prozess). */
export function navigationGroup(element: DiagramElement | undefined): NavigationGroup | undefined {
  const bo = element?.businessObject;
  if (!element || !bo || element.labelTarget || (element as Shape).waypoints) {
    return undefined;
  }
  if (is(bo, 'bpmn:Activity')) {
    return 'activity';
  }
  if (is(bo, 'bpmn:Event')) {
    return 'event';
  }
  if (is(bo, 'bpmn:Gateway')) {
    return 'gateway';
  }
  if (is(bo, 'bpmn:DataObjectReference') || is(bo, 'bpmn:DataStoreReference')) {
    return 'data';
  }
  if (is(bo, 'bpmn:Participant') || is(bo, 'bpmn:Lane')) {
    return 'swimlane';
  }
  if (is(bo, 'bpmn:TextAnnotation')) {
    return 'annotation';
  }
  return undefined;
}

/** Die Stelle eines Elements in seiner Liste, z. B. 3 von 12. */
export interface NavigationPosition {
  index: number;
  count: number;
  previous?: DiagramElement;
  next?: DiagramElement;
}

/**
 * Blättern im Eigenschaftenpanel: durch alle Elemente derselben Art wie das ausgewählte, in
 * Modellierungsreihenfolge. Bei waagrechten Prozessen von links nach rechts, bei senkrechten von oben
 * nach unten; Pools und Lanes quer dazu. Die Richtung kommt aus den Pools und Lanes, ohne sie aus der
 * Form des Diagramms (breiter als hoch = waagrecht).
 */
export default class ElementNavigation {
  static $inject = ['elementRegistry', 'canvas', 'selection'];

  constructor(
    private elementRegistry: any,
    private canvas: any,
    private selection: any,
  ) {}

  /** Alle Elemente der Art von `element` auf derselben Ebene, sortiert. */
  list(element: DiagramElement): DiagramElement[] {
    const group = navigationGroup(element);
    if (!group) {
      return [];
    }
    const root = this.canvas.findRoot(element);
    const shapes: Shape[] = this.elementRegistry.filter(
      (el: Shape) => navigationGroup(el) === group && this.canvas.findRoot(el) === root,
    );
    const horizontal = this.isHorizontalModel(root);
    // Pools und Lanes liegen quer zum Ablauf.
    const alongX = group === 'swimlane' ? !horizontal : horizontal;
    const center = (s: Shape) => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 });
    return shapes.sort((a, b) => {
      // Pools und Lanes nach ihrer Kante, damit der Pool vor seiner ersten Lane kommt.
      const pa = group === 'swimlane' ? { x: a.x, y: a.y } : center(a);
      const pb = group === 'swimlane' ? { x: b.x, y: b.y } : center(b);
      return alongX ? pa.x - pb.x || pa.y - pb.y : pa.y - pb.y || pa.x - pb.x;
    });
  }

  position(element: DiagramElement | undefined): NavigationPosition | undefined {
    if (!element) {
      return undefined;
    }
    const items = this.list(element);
    const index = items.indexOf(element);
    if (index < 0) {
      return undefined;
    }
    return { index, count: items.length, previous: items[index - 1], next: items[index + 1] };
  }

  /** Wählt das vorherige (-1) oder nächste (+1) Element aus und holt es ins Bild. */
  step(element: DiagramElement, direction: -1 | 1): DiagramElement | undefined {
    const position = this.position(element);
    const target = direction < 0 ? position?.previous : position?.next;
    if (target) {
      this.selection.select(target);
      if (!this.isVisible(target as Shape)) {
        this.canvas.scrollToElement(target);
      }
    }
    return target;
  }

  /** Waagrecht, wenn die Pools/Lanes es sind; ohne sie, wenn die Elemente breiter als hoch verteilt sind. */
  private isHorizontalModel(root: unknown): boolean {
    const onRoot = (el: DiagramElement) => this.canvas.findRoot(el) === root;
    const swimlane = this.elementRegistry.find(
      (el: DiagramElement) => navigationGroup(el) === 'swimlane' && onRoot(el),
    ) as DiagramElement | undefined;
    if (swimlane) {
      return isHorizontal(swimlane as any) !== false;
    }
    const shapes: Shape[] = this.elementRegistry.filter(
      (el: Shape) => !!navigationGroup(el) && onRoot(el),
    );
    if (shapes.length < 2) {
      return true;
    }
    const xs = shapes.flatMap((s) => [s.x, s.x + s.width]);
    const ys = shapes.flatMap((s) => [s.y, s.y + s.height]);
    return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  }

  private isVisible(shape: Shape): boolean {
    const box = this.canvas.viewbox();
    return shape.x >= box.x && shape.y >= box.y && shape.x + shape.width <= box.x + box.width && shape.y + shape.height <= box.y + box.height;
  }
}
