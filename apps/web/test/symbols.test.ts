import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { createI18n } from '@bestbpmn/i18n';
import { deriveProfile } from '@bestbpmn/model';
import { bestbpmnModdleExtensions, bestbpmnModule } from '@bestbpmn/bpmn-js-extension';

let container: HTMLDivElement;
let modeler: any;

const get = <T = any>(name: string): T => modeler.get(name) as T;

// Start → Prüfen → Ende, ohne Pool.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="urn:test">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="Start" name="Bedarf" />
    <bpmn:task id="Pruefen" name="Prüfen" />
    <bpmn:endEvent id="Ende" name="Bestellt" />
    <bpmn:sequenceFlow id="f1" sourceRef="Start" targetRef="Pruefen" />
    <bpmn:sequenceFlow id="f2" sourceRef="Pruefen" targetRef="Ende" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="Pl" bpmnElement="P">
    <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="400" y="200" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Pruefen_di" bpmnElement="Pruefen"><dc:Bounds x="500" y="178" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Ende_di" bpmnElement="Ende"><dc:Bounds x="660" y="200" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="f1_di" bpmnElement="f1"><di:waypoint x="436" y="218" /><di:waypoint x="500" y="218" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="f2_di" bpmnElement="f2"><di:waypoint x="600" y="218" /><di:waypoint x="660" y="218" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function setup(xml = XML) {
  container = document.createElement('div');
  container.style.width = '1200px';
  container.style.height = '600px';
  document.body.appendChild(container);
  modeler = new Modeler({
    container,
    additionalModules: [bestbpmnModule],
    moddleExtensions: bestbpmnModdleExtensions,
    bestbpmn: { language: 'de', t: createI18n('de').t },
  });
  await modeler.importXML(xml);
}

const el = (id: string) => get('elementRegistry').get(id);
const tools = () => get<any>('bestbpmnSymbolTools');
const allowed = (source: any, target: any) => get('rules').allowed('connection.create', { source, target });

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Prozess- und Schnittstellensymbole', () => {
  it('hängt Symbole an Start- und Endereignis, mit Pfeil in Flussrichtung', async () => {
    await setup();
    const vor = tools().attach(el('Start'), 'process', 'start');
    const nach = tools().attach(el('Ende'), 'interface', 'end');

    expect(vor.businessObject.symbol).toBe('process');
    expect(vor.businessObject.text).toBe('Prozessschnittstelle');
    expect(vor.x + vor.width).toBeLessThan(el('Start').x);
    expect(nach.x).toBeGreaterThan(el('Ende').x + el('Ende').width);

    const [a1] = vor.outgoing;
    expect(a1.type).toBe('bpmn:Association');
    expect(a1.target).toBe(el('Start'));
    expect(a1.businessObject.associationDirection).toBe('One');
    const [a2] = nach.incoming;
    expect(a2.source).toBe(el('Ende'));
    expect(a2.businessObject.associationDirection).toBe('One');
  });

  it('erlaubt nur die Verbindungen der Tabelle', async () => {
    await setup();
    const proc = tools().attach(el('Start'), 'process', 'start');
    const iface = get('modeling').createShape(tools().createSymbol('interface'), { x: 200, y: 400 }, get('canvas').getRootElement());

    expect(allowed(proc, iface)).toEqual({ type: 'bpmn:Association' });
    expect(allowed(iface, el('Start'))).toEqual({ type: 'bpmn:Association' });
    expect(allowed(el('Start'), proc)).toBe(false);
    expect(allowed(proc, el('Pruefen'))).toBe(false);
    expect(allowed(el('Pruefen'), iface)).toBe(false);
    expect(allowed(proc, el('Ende'))).toBe(false);
    // Gewöhnliche Textanmerkungen bleiben frei verbindbar.
    const note = get('modeling').createShape(get('elementFactory').createShape({ type: 'bpmn:TextAnnotation' }), { x: 550, y: 400 }, get('canvas').getRootElement());
    expect(allowed(note, el('Pruefen'))).toBeTruthy();

    // Ist die Schnittstelle Input, darf sie nicht zugleich Output werden.
    get('modeling').connect(iface, el('Start'), { type: 'bpmn:Association' });
    expect(allowed(el('Ende'), iface)).toBe(false);
  });

  it('zeichnet Chevron und Schnittstelle mit Typzeichen', async () => {
    await setup();
    const proc = tools().attach(el('Start'), 'process', 'start');
    const iface = tools().attach(el('Ende'), 'interface', 'end');
    get('modeling').updateProperties(iface, { interfaceType: 'document', text: 'Bestellung' });

    const gfx = (element: any) => get('elementRegistry').getGraphics(element) as SVGGElement;
    expect(gfx(proc).querySelector('.djs-visual path')!.getAttribute('d')).toMatch(/^M0,0 L100,0 L120,30/);
    expect(gfx(iface).querySelector('.bestbpmn-symbol-icon')).not.toBeNull();
    expect(gfx(iface).textContent).toContain('Bestellung');
  });

  it('bietet Palette und Kontextpad an', async () => {
    await setup();
    const palette = get<any>('palette').getEntries();
    expect(palette['bestbpmn-create.symbol-process']).toBeDefined();
    expect(palette['bestbpmn-create.symbol-interface']).toBeDefined();
    const pad = (element: any) => Object.keys(get<any>('contextPad').getEntries(element));
    expect(pad(el('Start'))).toContain('bestbpmn-append.symbol-process');
    expect(pad(el('Ende'))).toContain('bestbpmn-append.symbol-interface');
    expect(pad(el('Pruefen'))).not.toContain('bestbpmn-append.symbol-process');
  });

  it('schreibt gültiges BPMN, das der Steckbrief liest', async () => {
    await setup();
    const proc = tools().attach(el('Start'), 'process', 'start');
    get('modeling').updateProperties(proc, { text: 'Bedarf melden', processRef: 'P-12' });
    const iface = tools().attach(el('Ende'), 'interface', 'end');
    get('modeling').updateProperties(iface, { text: 'Bestellung', interfaceType: 'event' });

    const { xml } = await modeler.saveXML({ format: true });
    expect(xml).toMatch(/<bpmn:textAnnotation id="[^"]+" bestadd:symbol="process" bestadd:processRef="P-12">/);
    expect(xml).toContain('associationDirection="One"');

    const profile = deriveProfile(modeler.getDefinitions());
    expect(profile.upstream).toEqual([{ id: proc.id, name: 'Bedarf melden', processRef: 'P-12' }]);
    expect(profile.outputs).toEqual([{ id: iface.id, name: 'Bestellung', type: 'event', processes: [], events: ['Bestellt'] }]);
  });

  it('legt Symbole in einer Kollaboration außerhalb des Pools an', async () => {
    await setup();
    get('modeling').makeCollaboration();
    const proc = tools().attach(el('Start'), 'process', 'start');
    expect(proc.businessObject.$parent.$type).toBe('bpmn:Collaboration');
    expect(deriveProfile(modeler.getDefinitions()).upstream.map((p) => p.id)).toEqual([proc.id]);
  });
});
