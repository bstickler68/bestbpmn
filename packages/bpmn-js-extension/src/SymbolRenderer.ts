import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { getFillColor, getLabelColor, getStrokeColor } from 'bpmn-js/lib/draw/BpmnRenderUtil';
import { append as svgAppend, attr as svgAttr, classes as svgClasses, create as svgCreate } from 'tiny-svg';
import { symbolKind } from '@bestbpmn/model';
import type { DiagramElement } from './util';

const HIGH_PRIORITY = 1500;
const STROKE = '#22242a';
const PROCESS_FILL = '#e6f1f3';
const INTERFACE_FILL = '#fdf6e3';
/** Größe neuer Symbole. */
export const SYMBOL_SIZE = { width: 120, height: 60 } as const;

type Shape = DiagramElement & { x: number; y: number; width: number; height: number };

/** Prozesspfeil (Chevron) wie in Prozesslandkarten. */
export function chevronPath(width: number, height: number, x = 0, y = 0): string {
  const notch = Math.min(height / 3, width / 4);
  return [
    `M${x},${y}`,
    `L${x + width - notch},${y}`,
    `L${x + width},${y + height / 2}`,
    `L${x + width - notch},${y + height}`,
    `L${x},${y + height}`,
    `L${x + notch},${y + height / 2}`,
    'Z',
  ].join(' ');
}

function roundRectPath(width: number, height: number, r: number, x = 0, y = 0): string {
  return [
    `M${x + r},${y}`,
    `H${x + width - r}`,
    `A${r},${r} 0 0 1 ${x + width},${y + r}`,
    `V${y + height - r}`,
    `A${r},${r} 0 0 1 ${x + width - r},${y + height}`,
    `H${x + r}`,
    `A${r},${r} 0 0 1 ${x},${y + height - r}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
  ].join(' ');
}

/** Kleine Zeichen je Schnittstellentyp, 16 × 16, links oben in der Form. */
const TYPE_ICONS: Record<string, string> = {
  // Blatt mit Eselsohr und welliger Unterkante
  document: 'M2,1 H10 L14,5 V13 C11,11 6,16 2,13 Z M10,1 V5 H14',
  // Tabelle
  record: 'M1,2 H15 V14 H1 Z M1,6 H15 M1,10 H15 M6,2 V14',
  // Briefumschlag
  event: 'M1,3 H15 V13 H1 Z M1,3 L8,9 L15,3',
  // Bildschirm
  system: 'M1,2 H15 V11 H1 Z M6,14 H10 M8,11 V14',
  // Kiste
  material: 'M1,5 L8,2 L15,5 V12 L8,15 L1,12 Z M1,5 L8,8 L15,5 M8,8 V15',
  // drei Punkte im Kreis
  other: 'M8,1 A7,7 0 1 1 7.99,1 Z M4.5,8 h0.5 M7.75,8 h0.5 M11,8 h0.5',
};

export function typeIconPath(type: string | undefined): string | undefined {
  // Nur eigene Einträge: Ein Typ wie `constructor` aus dem Modell trifft nichts Geerbtes.
  return type && Object.hasOwn(TYPE_ICONS, type) ? TYPE_ICONS[type] : undefined;
}

/**
 * Zeichnet Prozess- und Schnittstellensymbole. Beide sind Textanmerkungen mit `bestadd:symbol`;
 * gewöhnliche Textanmerkungen zeichnet weiter bpmn-js.
 */
export default class SymbolRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'textRenderer'];

  constructor(
    eventBus: any,
    private textRenderer: any,
  ) {
    super(eventBus, HIGH_PRIORITY);
  }

  canRender(element: DiagramElement): boolean {
    return !(element as any).labelTarget && !!symbolKind(element.businessObject as any);
  }

  drawShape(parentGfx: SVGElement, element: Shape) {
    const bo = element.businessObject;
    const kind = symbolKind(bo as any);
    const stroke = getStrokeColor(element, STROKE);
    const isProcess = kind === 'process';
    const outline = svgCreate('path');
    svgAttr(outline, {
      d: isProcess ? chevronPath(element.width, element.height) : roundRectPath(element.width, element.height, 8),
      fill: getFillColor(element, isProcess ? PROCESS_FILL : INTERFACE_FILL),
      stroke,
      strokeWidth: 1.5,
    });
    svgAppend(parentGfx, outline);

    let left = 0;
    let right = 0;
    if (isProcess) {
      const notch = Math.min(element.height / 3, element.width / 4);
      left = notch;
      right = notch;
    } else {
      const icon = typeIconPath(bo.interfaceType);
      if (icon) {
        const path = svgCreate('path');
        svgAttr(path, { d: icon, fill: 'none', stroke, strokeWidth: 1.2, transform: 'translate(6 6)' });
        svgClasses(path).add('bestbpmn-symbol-icon');
        svgAppend(parentGfx, path);
        left = 18;
      }
    }

    const text = this.textRenderer.createText(bo.text ?? '', {
      align: 'center-middle',
      box: { width: element.width - left - right, height: element.height },
      padding: 5,
      style: { fill: getLabelColor(element, STROKE, stroke) },
    });
    svgAttr(text, { transform: `translate(${left} 0)` });
    svgClasses(text).add('djs-label');
    svgAppend(parentGfx, text);
    return outline;
  }

  getShapePath(element: Shape): string {
    return symbolKind(element.businessObject as any) === 'process'
      ? chevronPath(element.width, element.height, element.x, element.y)
      : roundRectPath(element.width, element.height, 8, element.x, element.y);
  }
}
