import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { disabledRulesOf, readRuleMarks, type StatusDefinition } from '@bestbpmn/model';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import states from '../../../templates/catalog/states.json';
import {
  bestbpmnModdleExtensions,
  bestbpmnModule,
  bestbpmnPropertiesProviderModule,
  UPDATE_RULES,
  type StatusCheck,
} from '@bestbpmn/bpmn-js-extension';

let container: HTMLDivElement;
let modeler: any;
const get = <T = any>(name: string): T => modeler.get(name) as T;

async function setup(xml = template) {
  container = document.createElement('div');
  container.innerHTML = '<div id="c" style="width:1000px;height:600px"></div><div id="p"></div>';
  document.body.appendChild(container);
  modeler = new Modeler({
    container: container.querySelector<HTMLElement>('#c')!,
    additionalModules: [BpmnPropertiesPanelModule, BpmnPropertiesProviderModule, bestbpmnModule, bestbpmnPropertiesProviderModule],
    moddleExtensions: bestbpmnModdleExtensions,
    propertiesPanel: { parent: container.querySelector('#p') },
    bestbpmn: { states: states as StatusDefinition[], language: 'de', disabledRules: disabledRulesOf('complete') },
  });
  await modeler.importXML(xml);
  // Das Eigenschaftenpanel braucht nach dem Import einen Moment, bevor es der Auswahl folgt.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const element = (id: string) => get('elementRegistry').get(id);
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 150));
/** Klappt eine Gruppe im Eigenschaftenpanel auf; zugeklappte Gruppen zeigen ihre Einträge nicht. */
const open = async (group: string) => {
  const header = container.querySelector<HTMLElement>(`[data-group-id="group-${group}"] .bio-properties-panel-group-header`)!;
  if (!header.classList.contains('open')) {
    header.click();
  }
  await nextTick();
};
const choose = (select: HTMLSelectElement, value: string) => {
  select.value = value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
const BRANCHING = ['flow-without-condition', 'unknown-result-condition', 'conditional-flows-without-default', 'either-or-at-task', 'result-condition-at-task'];
const issues = () =>
  get<StatusCheck>('bestbpmnStatusCheck')
    .check()
    .flatMap((m) => m.issues.filter((i) => BRANCHING.includes(i.code)).map((i) => [i.code, i.elementId]));
const resultSelect = () => container.querySelector<HTMLSelectElement>('[data-entry-id="bestbpmn-condition-result"] select')!;

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Bedingung am Sequenzfluss', () => {
  it('bietet nach dem Gateway das Ergebnis von „Dokument prüfen“ an und schreibt die Bedingung', async () => {
    await setup();
    expect(issues()).toEqual([]);
    expect(container.querySelector('.bestbpmn-gateway')!.textContent).toBe('👤');

    get('selection').select(element('Flow_4'));
    await nextTick();
    expect([...resultSelect().options].map((o) => o.value)).toEqual(['', 'reviewed', '__custom']);
    expect(resultSelect().value).toBe('reviewed');

    choose(resultSelect(), '');
    expect(element('Flow_4').businessObject.conditionExpression).toBeUndefined();
    // Ohne Bedingung nimmt eine Engine einfach den ersten Weg.
    expect(issues()).toEqual([['flow-without-condition', 'Flow_4']]);
    expect(container.querySelector('.bestbpmn-gateway')).toBeNull();

    await nextTick();
    choose(resultSelect(), 'reviewed');
    expect(element('Flow_4').businessObject.conditionExpression.body).toBe("${result == 'reviewed'}");
    expect(issues()).toEqual([]);
    const { xml } = await modeler.saveXML();
    expect(xml).toContain(`<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${result == 'reviewed'}</bpmn:conditionExpression>`);
  });

  it('erkennt Bedingungen mit der älteren Variable und zeigt bei Feldwerten ⚙', async () => {
    await setup(template.replace("${result == 'reviewed'}", "${praxiqResult == 'reviewed'}"));
    expect(issues()).toEqual([]);
    get('selection').select(element('Flow_4'));
    await nextTick();
    expect(resultSelect().value).toBe('reviewed');

    get('modeling').updateProperties(element('Ok'), { default: undefined });
    const expression = get('bpmnFactory').create('bpmn:FormalExpression', { body: '${seiten > 10}' });
    get('modeling').updateProperties(element('Flow_5'), { conditionExpression: expression });
    expect(container.querySelector('.bestbpmn-gateway')!.textContent).toBe('👤⚙');
  });

  it('zeigt am Standardfluss nur einen Hinweis und an Flüssen aus Ereignissen nichts', async () => {
    await setup();
    get('selection').select(element('Flow_5'));
    await nextTick();
    expect(container.querySelector('[data-entry-id="bestbpmn-condition-default"]')).not.toBeNull();
    expect(container.querySelector('[data-entry-id="bestbpmn-condition-result"]')).toBeNull();

    get('selection').select(element('Flow_1'));
    await nextTick();
    expect(container.querySelector('[data-group-id="group-bestbpmn-condition"]')).toBeNull();
  });
});

describe('Regel-Kennzeichen an Aktivitäten', () => {
  it('setzt Kennzeichen und Beschreibung in einem Schritt und zeigt ein Symbol', async () => {
    await setup();
    const task = element('Freigeben');
    get('commandStack').execute(UPDATE_RULES, { element: task, kinds: ['follow_action', 'condition'] });
    get('commandStack').execute(UPDATE_RULES, { element: task, description: 'Nicht dieselbe Person wie beim Prüfen.' });
    expect(readRuleMarks(task.businessObject)).toEqual({
      kinds: ['condition', 'follow_action'],
      unknownKinds: [],
      description: 'Nicht dieselbe Person wie beim Prüfen.',
    });
    const { xml } = await modeler.saveXML();
    expect(xml).toContain('<bestadd:rules kinds="condition follow_action">Nicht dieselbe Person wie beim Prüfen.</bestadd:rules>');
    const overlay = container.querySelector<HTMLElement>('.bestbpmn-rules')!;
    expect(overlay.textContent).toBe('§ 2');
    expect(overlay.title).toBe('Bedingung, Folgeaktion\nNicht dieselbe Person wie beim Prüfen.');

    get('commandStack').execute(UPDATE_RULES, { element: task, kinds: [], description: '' });
    expect(readRuleMarks(task.businessObject)).toBeUndefined();
    expect(container.querySelector('.bestbpmn-rules')).toBeNull();
    get('commandStack').undo();
    expect(readRuleMarks(task.businessObject)?.kinds).toEqual(['condition', 'follow_action']);
  });

  it('bietet an Benutzeraufgaben alle fünf Kennzeichen an, an Skriptaufgaben nur Aktionen', async () => {
    await setup();
    get('selection').select(element('Pruefen'));
    await nextTick();
    await open('bestbpmn-rules');
    const ids = () =>
      [...container.querySelectorAll('[data-group-id="group-bestbpmn-rules"] [data-entry-id]')].map((e) => e.getAttribute('data-entry-id'));
    expect(ids()).toEqual([
      'bestbpmn-rules-condition',
      'bestbpmn-rules-validator',
      'bestbpmn-rules-screen',
      'bestbpmn-rules-start_action',
      'bestbpmn-rules-follow_action',
      'bestbpmn-rules-description',
    ]);

    const checkbox = container.querySelector<HTMLInputElement>('[data-entry-id="bestbpmn-rules-validator"] input')!;
    checkbox.click();
    expect(readRuleMarks(element('Pruefen').businessObject)?.kinds).toEqual(['validator']);

    const script = get('bpmnReplace').replaceElement(element('Freigeben'), { type: 'bpmn:ScriptTask' });
    get('selection').select(script);
    await nextTick();
    await open('bestbpmn-rules');
    expect(ids()).toEqual(['bestbpmn-rules-hint', 'bestbpmn-rules-start_action', 'bestbpmn-rules-follow_action', 'bestbpmn-rules-description']);
  });
});

const CHOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="urn:bestadd:test">
  <bpmn:process id="P" name="Wahl" isExecutable="true">
    <bpmn:startEvent id="S"><bpmn:outgoing>F0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="T" name="Prüfen"><bpmn:incoming>F0</bpmn:incoming><bpmn:outgoing>F1</bpmn:outgoing></bpmn:userTask>
    <bpmn:exclusiveGateway id="G"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>A</bpmn:outgoing><bpmn:outgoing>B</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:endEvent id="E"><bpmn:incoming>A</bpmn:incoming><bpmn:incoming>B</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="T" />
    <bpmn:sequenceFlow id="F1" sourceRef="T" targetRef="G" />
    <bpmn:sequenceFlow id="A" name="Weiter" sourceRef="G" targetRef="E" />
    <bpmn:sequenceFlow id="B" name="Zurück an Ersteller" sourceRef="G" targetRef="E" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="DI"><bpmndi:BPMNPlane id="PL" bpmnElement="P">
    <bpmndi:BPMNShape id="S_di" bpmnElement="S"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="T_di" bpmnElement="T"><dc:Bounds x="200" y="78" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="G_di" bpmnElement="G" isMarkerVisible="true"><dc:Bounds x="350" y="93" width="50" height="50" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="E_di" bpmnElement="E"><dc:Bounds x="500" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F0_di" bpmnElement="F0"><di:waypoint x="136" y="118" /><di:waypoint x="200" y="118" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="300" y="118" /><di:waypoint x="350" y="118" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="A_di" bpmnElement="A"><di:waypoint x="400" y="118" /><di:waypoint x="500" y="118" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="B_di" bpmnElement="B"><di:waypoint x="375" y="143" /><di:waypoint x="375" y="200" /><di:waypoint x="518" y="200" /><di:waypoint x="518" y="136" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe('Wahl am Gateway und Text in der Auswahl', () => {
  it('bietet die Wahl des Bearbeiters an, wenn die Aufgabe keine Ergebnisse hat, und zeigt ☑', async () => {
    await setup(CHOICE_XML);
    for (const id of ['A', 'B']) {
      get('selection').select(element(id));
      await nextTick();
      const select = container.querySelector<HTMLSelectElement>('[data-entry-id="bestbpmn-condition-result"] select')!;
      expect([...select.options].map((o) => o.value)).toContain('__choice');
      choose(select, '__choice');
      expect(element(id).businessObject.conditionExpression.body).toBe(`\${choice == '${id}'}`);
    }
    const all = get<StatusCheck>('bestbpmnStatusCheck').check().flatMap((m) => m.issues.map((i) => i.code));
    expect(all.filter((code) => code.startsWith('choice') || code.includes('condition'))).toEqual([]);
    expect(container.querySelector('.bestbpmn-gateway')!.textContent).toBe('☑');
  });

  it('bietet die Wahl nicht an, wenn die Aufgabe davor alternative Ergebnisse hat', async () => {
    await setup();
    get('selection').select(element('Flow_4'));
    await nextTick();
    expect([...resultSelect().options].map((o) => o.value)).not.toContain('__choice');
  });

  it('speichert den Text in der Auswahl an der Ausgabe auf „Prozess“', async () => {
    await setup();
    get('selection').select(element('Out_Pruefen'));
    await nextTick();
    await open('bestbpmn-result-label');
    const input = container.querySelector<HTMLInputElement>('[data-entry-id="bestbpmn-result-label-text"] input')!;
    input.value = 'Weiter zur Freigabe';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(element('Out_Pruefen').businessObject.resultLabel).toBe('Weiter zur Freigabe');
    const { xml } = await modeler.saveXML();
    expect(xml).toContain('bestadd:resultLabel="Weiter zur Freigabe"');
    // Die Bedingung am Gateway zeigt Text und Status gemeinsam.
    get('selection').select(element('Flow_4'));
    await nextTick();
    expect([...resultSelect().options].find((o) => o.value === 'reviewed')!.textContent).toBe('Weiter zur Freigabe · Geprüft (reviewed)');
  });
});
