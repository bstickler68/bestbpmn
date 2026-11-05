import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { createI18n } from '@bestbpmn/i18n';
import { bestbpmnModdleExtensions, bestbpmnModule, navigationGroup } from '@bestbpmn/bpmn-js-extension';
import { mountNavigation } from '../src/navigation';

let container: HTMLDivElement;
let modeler: any;

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

const shape = (id: string, x: number, y: number, w = 100, h = 80, extra = '') =>
  `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${extra}><dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}" /></bpmndi:BPMNShape>`;

function diagram(processBody: string, shapes: string, collaboration = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="D" targetNamespace="urn:test">
  ${collaboration}
  <bpmn:process id="P">${processBody}</bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="Pl" bpmnElement="${collaboration ? 'Collab' : 'P'}">${shapes}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

/** Ein waagrechter Pool mit zwei Lanes; die Aufgaben stehen bewusst nicht in Lane-Reihenfolge. */
function pool(horizontal = true) {
  const flag = horizontal ? '' : ' isHorizontal="false"';
  const lanes = `<bpmn:laneSet id="LS"><bpmn:lane id="L1"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>C</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="L2"><bpmn:flowNodeRef>B</bpmn:flowNodeRef><bpmn:flowNodeRef>G</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:startEvent id="S" /><bpmn:task id="A" /><bpmn:userTask id="B" /><bpmn:subProcess id="C" /><bpmn:exclusiveGateway id="G" />`;
  // Waagrecht: Lanes übereinander, Ablauf nach rechts. Senkrecht: gespiegelt an der Diagonale.
  const at = (id: string, x: number, y: number, w: number, h: number) =>
    horizontal ? shape(id, x, y, w, h, ['P1', 'L1', 'L2'].includes(id) ? flag : '') : shape(id, y, x, h, w, ['P1', 'L1', 'L2'].includes(id) ? flag : '');
  const shapes = [
    at('P1', 0, 0, 900, 400),
    at('L1', 30, 0, 870, 200),
    at('L2', 30, 200, 870, 200),
    at('S', 60, 80, 36, 36),
    at('A', 150, 60, 100, 80),
    at('B', 300, 260, 100, 80),
    at('C', 450, 60, 100, 80),
    at('G', 600, 275, 50, 50),
  ].join('');
  return diagram(lanes, shapes, `<bpmn:collaboration id="Collab"><bpmn:participant id="P1" processRef="P" /></bpmn:collaboration>`);
}

async function setup(xml: string) {
  container = document.createElement('div');
  container.style.width = '1000px';
  container.style.height = '600px';
  document.body.appendChild(container);
  modeler = new Modeler({ container, additionalModules: [bestbpmnModule], moddleExtensions: bestbpmnModdleExtensions });
  await modeler.importXML(xml);
}

const get = (id: string) => modeler.get('elementRegistry').get(id);
const ids = (id: string) => modeler.get('bestbpmnNavigation').list(get(id)).map((el: any) => el.id);

describe('Blättern im Eigenschaftenbereich', () => {
  it('teilt Elemente in Arten ein', async () => {
    await setup(pool());
    expect(['S', 'A', 'B', 'C', 'G', 'P1', 'L1'].map((id) => navigationGroup(get(id)))).toEqual([
      'event',
      'activity',
      'activity',
      'activity',
      'gateway',
      'swimlane',
      'swimlane',
    ]);
    expect(navigationGroup(modeler.get('canvas').getRootElement())).toBeUndefined();
  });

  it('geht bei waagrechten Prozessen von links nach rechts, bei Pools und Lanes von oben nach unten', async () => {
    await setup(pool());
    expect(ids('A')).toEqual(['A', 'B', 'C']);
    expect(ids('L2')).toEqual(['P1', 'L1', 'L2']);
  });

  it('geht bei senkrechten Prozessen von oben nach unten, bei Pools und Lanes von links nach rechts', async () => {
    await setup(pool(false));
    expect(ids('A')).toEqual(['A', 'B', 'C']);
    expect(ids('L2')).toEqual(['P1', 'L1', 'L2']);
  });

  it('erkennt ohne Pool die Richtung an der Form des Diagramms', async () => {
    const body = '<bpmn:task id="A" /><bpmn:task id="B" /><bpmn:task id="C" />';
    // Hoch statt breit: von oben nach unten, auch wenn B weiter links liegt.
    await setup(diagram(body, shape('A', 200, 0) + shape('B', 0, 200) + shape('C', 150, 400)));
    expect(ids('A')).toEqual(['A', 'B', 'C']);
    modeler.destroy();
    container.remove();
    await setup(diagram(body, shape('A', 400, 0) + shape('B', 0, 50) + shape('C', 200, 20)));
    expect(ids('A')).toEqual(['B', 'C', 'A']);
  });

  it('wählt mit den Pfeilen das vorherige und nächste Element aus', async () => {
    await setup(pool());
    const parent = document.createElement('div');
    container.appendChild(parent);
    mountNavigation(parent, modeler, createI18n('de').t);
    const nav = parent.querySelector<HTMLElement>('.element-nav')!;
    const [back, forward] = [...nav.querySelectorAll('button')];
    const selected = () => modeler.get('selection').get().map((el: any) => el.id);

    // Ohne Auswahl (oder beim Prozess) gibt es nichts zu blättern.
    expect(nav.hidden).toBe(true);
    modeler.get('selection').select(get('A'));
    expect(nav.hidden).toBe(false);
    expect(nav.textContent).toContain('1 von 3');
    expect(back!.disabled).toBe(true);

    forward!.click();
    expect(selected()).toEqual(['B']);
    forward!.click();
    expect(selected()).toEqual(['C']);
    expect(nav.textContent).toContain('3 von 3');
    expect(forward!.disabled).toBe(true);
    back!.click();
    expect(selected()).toEqual(['B']);

    // Allein in seiner Art: keine Pfeile.
    modeler.get('selection').select(get('G'));
    expect(nav.hidden).toBe(true);
  });
});
