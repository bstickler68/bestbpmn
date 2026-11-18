import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import { canConnectSymbols, symbolEnd, symbolKind, type SymbolKind } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { chevronPath, SYMBOL_SIZE } from './SymbolRenderer';
import type { DiagramElement } from './util';

const HIGH_PRIORITY = 1500;

type Shape = DiagramElement & { x: number; y: number; width: number; height: number; waypoints?: unknown };

const isSymbol = (el: DiagramElement | undefined) => !!el && !el.labelTarget && !!symbolKind(el.businessObject as any);
const associationsOf = (elementRegistry: any) =>
  elementRegistry.filter((e: DiagramElement) => e.type === 'bpmn:Association').map((e: DiagramElement) => e.businessObject);

/**
 * Verbindungsregeln der Prozess- und Schnittstellensymbole: nur in Flussrichtung,
 * eingehend Prozess → Schnittstelle → Startereignis, ausgehend Endereignis → Schnittstelle → Prozess.
 */
export class SymbolRules extends RuleProvider {
  static $inject = ['eventBus', 'elementRegistry'];

  constructor(
    eventBus: any,
    private elementRegistry: any,
  ) {
    super(eventBus);
  }

  init() {
    const check = (source: DiagramElement, target: DiagramElement, existing?: DiagramElement) => {
      if (!isSymbol(source) && !isSymbol(target)) {
        return undefined;
      }
      const associations = associationsOf(this.elementRegistry).filter((a: any) => a !== existing?.businessObject);
      return canConnectSymbols(source.businessObject as any, target.businessObject as any, associations) ? { type: 'bpmn:Association' } : false;
    };
    this.addRule('connection.create', HIGH_PRIORITY, (context: any) => check(context.source, context.target));
    this.addRule('connection.reconnect', HIGH_PRIORITY, (context: any) => {
      const result = check(context.source, context.target, context.connection);
      return result === undefined ? undefined : !!result;
    });
  }
}

/** Neue Verbindungen an Symbolen bekommen einen Pfeil (`associationDirection="One"`). */
export class SymbolBehavior extends CommandInterceptor {
  static $inject = ['eventBus'];

  constructor(eventBus: any) {
    super(eventBus);
    this.postExecuted(['connection.create', 'connection.reconnect'], (event: any) => {
      const connection = event.context.connection as DiagramElement & { source?: DiagramElement; target?: DiagramElement };
      if (connection?.type === 'bpmn:Association' && (isSymbol(connection.source) || isSymbol(connection.target))) {
        connection.businessObject.associationDirection = 'One';
      }
    });
  }
}

const svgIcon = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">${body}</svg>`)}`;
const PROCESS_ICON = svgIcon(`<path d="${chevronPath(26, 16, 2, 7)}" fill="none" stroke="#22242a" stroke-width="1.6"/>`);
const INTERFACE_ICON = svgIcon(
  '<rect x="3" y="7" width="24" height="16" rx="4" fill="none" stroke="#22242a" stroke-width="1.6"/><path d="M7,11 h6 v5 h-6 z" fill="none" stroke="#22242a" stroke-width="1.2"/>',
);

/** Palette und Kontextpad: Prozessschnittstelle und Schnittstelle anlegen bzw. an Start- und Endereignisse hängen. */
export class SymbolTools {
  static $inject = ['palette', 'contextPad', 'create', 'elementFactory', 'bpmnFactory', 'modeling', 'rules', 'config.bestbpmn'];

  private i18n: BestbpmnI18n;

  constructor(
    palette: any,
    contextPad: any,
    private create: any,
    private elementFactory: any,
    private bpmnFactory: any,
    private modeling: any,
    private rules: any,
    config: BestbpmnConfig | undefined,
  ) {
    this.i18n = resolveI18n(config);
    palette.registerProvider(this);
    contextPad.registerProvider(this);
  }

  /** Ein neues Symbol, noch nicht im Diagramm. */
  createSymbol(kind: SymbolKind): Shape {
    const businessObject = this.bpmnFactory.create('bpmn:TextAnnotation', { symbol: kind, text: this.i18n.t(`symbol.${kind}`) });
    return this.elementFactory.createShape({ type: 'bpmn:TextAnnotation', businessObject, ...SYMBOL_SIZE });
  }

  getPaletteEntries() {
    return (entries: Record<string, unknown>) => {
      const action = (kind: SymbolKind) => (event: Event) => this.create.start(event, this.createSymbol(kind));
      return {
        ...entries,
        'bestbpmn-create.symbol-process': {
          group: 'artifact',
          imageUrl: PROCESS_ICON,
          title: this.i18n.t('symbol.createProcess'),
          action: { dragstart: action('process'), click: action('process') },
        },
        'bestbpmn-create.symbol-interface': {
          group: 'artifact',
          imageUrl: INTERFACE_ICON,
          title: this.i18n.t('symbol.createInterface'),
          action: { dragstart: action('interface'), click: action('interface') },
        },
      };
    };
  }

  getContextPadEntries(element: Shape) {
    return (entries: Record<string, unknown>) => {
      const end = symbolEnd(element.businessObject as any);
      if (end !== 'start' && end !== 'end') {
        return entries;
      }
      const attach = (kind: SymbolKind) => () => this.attach(element, kind, end);
      return {
        ...entries,
        'bestbpmn-append.symbol-process': {
          group: 'connect',
          imageUrl: PROCESS_ICON,
          title: this.i18n.t('symbol.createProcess'),
          action: { click: attach('process') },
        },
        'bestbpmn-append.symbol-interface': {
          group: 'connect',
          imageUrl: INTERFACE_ICON,
          title: this.i18n.t('symbol.createInterface'),
          action: { click: attach('interface') },
        },
      };
    };
  }

  /** Legt ein Symbol links vor dem Startereignis bzw. rechts hinter dem Endereignis an und verbindet es. */
  attach(event: Shape, kind: SymbolKind, end: 'start' | 'end') {
    const shape = this.createSymbol(kind);
    const gap = 60;
    const centerY = event.y + event.height / 2;
    const centerX = end === 'start' ? event.x - gap - SYMBOL_SIZE.width / 2 : event.x + event.width + gap + SYMBOL_SIZE.width / 2;
    // Symbole liegen außerhalb des Pools; bpmn-js hängt sie dann an die Kollaboration.
    const root = (event as any).parent?.type === 'bpmn:Participant' || (event as any).parent?.type === 'bpmn:Lane' ? rootOf(event) : (event as any).parent;
    const created = this.modeling.createShape(shape, { x: centerX, y: centerY }, root);
    const [source, target] = end === 'start' ? [created, event] : [event, created];
    if (this.rules.allowed('connection.create', { source, target })) {
      this.modeling.connect(source, target, { type: 'bpmn:Association' });
    }
    return created;
  }
}

function rootOf(element: any): any {
  let current = element;
  while (current.parent) {
    current = current.parent;
  }
  return current;
}
