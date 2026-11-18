import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { readProbability, readTiming } from '@bestbpmn/model';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import states from '../../../templates/catalog/states.json';
import { bestbpmnModdleExtensions, bestbpmnModule, bestbpmnPropertiesProviderModule, UPDATE_TIMING, type StatusCheck } from '@bestbpmn/bpmn-js-extension';

let container: HTMLDivElement;
let modeler: any;
const get = <T = any>(name: string): T => modeler.get(name) as T;

async function setup(xml = template, enabled = true) {
  container = document.createElement('div');
  container.innerHTML = '<div id="c" style="width:1000px;height:600px"></div><div id="p"></div>';
  document.body.appendChild(container);
  modeler = new Modeler({
    container: container.querySelector<HTMLElement>('#c')!,
    additionalModules: [BpmnPropertiesPanelModule, BpmnPropertiesProviderModule, bestbpmnModule, bestbpmnPropertiesProviderModule],
    moddleExtensions: bestbpmnModdleExtensions,
    propertiesPanel: { parent: container.querySelector('#p') },
    bestbpmn: { states, language: 'de', planning: { enabled } },
  });
  await modeler.importXML(xml);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const element = (id: string) => get('elementRegistry').get(id);
const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
const open = async (group: string) => {
  const header = container.querySelector<HTMLElement>(`[data-group-id="group-${group}"] .bio-properties-panel-group-header`)!;
  if (!header.classList.contains('open')) {
    header.click();
  }
  await wait();
};
const input = (entry: string) => container.querySelector<HTMLInputElement>(`[data-entry-id="${entry}"] input`)!;
/** Tippt in ein Textfeld und wartet, bis das Panel die Eingabe übernommen hat. */
async function type(field: HTMLInputElement, text: string) {
  field.focus();
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(450);
  // Das Panel übernimmt die Eingabe spätestens beim Verlassen des Felds.
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.blur();
  await wait();
}
const PLANNING_CODES = ['invalid-planning-value', 'gateway-without-probabilities', 'probabilities-not-100', 'boundary-without-probability', 'accountable-without-effort', 'task-without-value-class'];
/** Nur die Hinweise zu Planwerten; die übrigen Regeln haben eigene Tests. */
const issues = () =>
  get<StatusCheck>('bestbpmnStatusCheck')
    .check()
    .flatMap((m) => m.issues.filter((i) => PLANNING_CODES.includes(i.code)).map((i) => [i.code, i.elementId]));

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Planwerte im Modell', () => {
  it('nimmt den Aufwand von D, E und M als Eingabe wie 1h30m und speichert ISO-8601', async () => {
    await setup();
    get('selection').select(element('Pruefen'));
    await wait();
    await open('bestbpmn-timing');
    expect(input('bestbpmn-timing-effort')).toBeTruthy();
    // „Dokument prüfen“ hat ein E (Qualitätsmanagement) und ein M.
    expect(input('bestbpmn-timing-accountableEffort')).toBeTruthy();
    expect(container.querySelectorAll('[data-entry-id^="bestbpmn-timing-consulted-"]').length).toBe(1);

    await type(input('bestbpmn-timing-effort'), '1h30m');
    await type(input('bestbpmn-timing-duration'), '2d');
    const timing = readTiming(element('Pruefen').businessObject)!;
    expect(timing.effort).toEqual({ days: 0, minutes: 90 });
    expect(timing.duration).toEqual({ days: 2, minutes: 0 });
    expect(input('bestbpmn-timing-effort').value).toBe('1 h 30 min');

    // Mit Aufwand des D fehlt jetzt der des E.
    expect(issues()).toContainEqual(['accountable-without-effort', 'Pruefen']);
    await type(input('bestbpmn-timing-accountableEffort'), '0');
    expect(issues()).not.toContainEqual(['accountable-without-effort', 'Pruefen']);

    const { xml } = await modeler.saveXML();
    expect(xml).toMatch(/<bestadd:timing effort="PT1H30M" accountableEffort="PT0M" duration="P2D"\s*\/>/);
  });

  it('meldet fehlende Wahrscheinlichkeiten und eine Summe ungleich 100 % erst, wenn das Modell Planwerte nutzt', async () => {
    await setup();
    expect(issues()).toEqual([]);
    get('selection').select(element('Flow_4'));
    await wait();
    await open('bestbpmn-timing');
    await type(input('bestbpmn-timing-probability'), '80');
    expect(readProbability(element('Flow_4').businessObject)).toBe(80);
    expect(issues()).toEqual([['gateway-without-probabilities', 'Ok']]);

    get('selection').select(element('Flow_5'));
    await wait();
    await open('bestbpmn-timing');
    await type(input('bestbpmn-timing-probability'), '10');
    expect(issues()).toEqual([['probabilities-not-100', 'Ok']]);
    await type(input('bestbpmn-timing-probability'), '20 %');
    expect(issues()).toEqual([]);

    const { xml } = await modeler.saveXML();
    expect(xml).toContain('bestadd:probability="80"');
    expect(xml).toContain('bestadd:probability="20"');
  });

  it('räumt einen leeren Bereich wieder auf und lässt sich rückgängig machen', async () => {
    await setup();
    const task = element('Erstellen');
    get('commandStack').execute(UPDATE_TIMING, { element: task, attribute: 'effort', value: 'PT20M' });
    expect(readTiming(task.businessObject)?.effort).toEqual({ days: 0, minutes: 20 });
    get('commandStack').execute(UPDATE_TIMING, { element: task, attribute: 'effort', value: '' });
    expect(readTiming(task.businessObject)).toBeUndefined();
    get('commandStack').undo();
    expect(readTiming(task.businessObject)?.effort).toEqual({ days: 0, minutes: 20 });
  });

  it('zeigt am Prozess die Rechnung und an der Aufgabe die erwarteten Ausführungen', async () => {
    await setup();
    const root = get('canvas').getRootElement();
    get('selection').select(root);
    await wait();
    await open('bestbpmn-calculation');
    expect(container.querySelector('[data-group-id="group-bestbpmn-calculation"]')?.textContent).toContain('Noch keine Planwerte');

    const stack = get('commandStack');
    stack.execute(UPDATE_TIMING, { element: element('Erstellen'), attribute: 'effort', value: 'PT1H' });
    stack.execute(UPDATE_TIMING, { element: element('Pruefen'), attribute: 'effort', value: 'PT30M' });
    get('modeling').updateModdleProperties(element('Flow_4'), element('Flow_4').businessObject, { probability: '80' });
    get('modeling').updateModdleProperties(element('Flow_5'), element('Flow_5').businessObject, { probability: '20' });

    get('selection').select(element('Pruefen'));
    await wait();
    await open('bestbpmn-timing');
    expect(container.querySelector('[data-entry-id="bestbpmn-timing-visits"]')?.textContent).toMatch(/Im Mittel [\d,]+ Ausführungen/);

    get('selection').deselect(element('Pruefen'));
    get('selection').select(root);
    await wait();
    await open('bestbpmn-calculation');
    const text = container.querySelector('[data-group-id="group-bestbpmn-calculation"]')?.textContent ?? '';
    expect(text).toContain('Aufwand je Durchlauf');
    expect(text).toContain('Durchlaufzeit');
    expect(text).toContain('group(authors)');
    expect(text).toContain('Unvollständig');
  });

  it('zeigt ohne eingeschaltete Planwerte weder Bereich noch Hinweise (Standard aus)', async () => {
    await setup(template, false);
    get('commandStack').execute(UPDATE_TIMING, { element: element('Pruefen'), attribute: 'effort', value: 'PT30M' });
    get('selection').select(element('Pruefen'));
    await wait();
    expect(container.querySelector('[data-group-id="group-bestbpmn-timing"]')).toBeNull();
    get('selection').select(get('canvas').getRootElement());
    await wait();
    expect(container.querySelector('[data-group-id="group-bestbpmn-calculation"]')).toBeNull();
    expect(issues()).toEqual([]);
  });

  it('bewertet Aufgaben und zeigt am Prozess die Wertschöpfungsanalyse', async () => {
    await setup();
    get('selection').select(element('Erstellen'));
    await wait();
    await open('bestbpmn-timing');
    const select = container.querySelector<HTMLSelectElement>('[data-entry-id="bestbpmn-timing-valueClass"] select')!;
    expect([...select.options].map((o) => o.textContent)).toEqual(['nicht bewertet', 'wertschöpfend', 'unterstützend', 'nicht wertschöpfend']);
    select.value = 'value_adding';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await wait();
    expect(readTiming(element('Erstellen').businessObject)?.valueClass).toBe('value_adding');
    expect(issues()).toContainEqual(['task-without-value-class', 'Pruefen']);

    const stack = get('commandStack');
    stack.execute(UPDATE_TIMING, { element: element('Erstellen'), attribute: 'effort', value: 'PT1H' });
    stack.execute(UPDATE_TIMING, { element: element('Pruefen'), attribute: 'effort', value: 'PT30M' });
    stack.execute(UPDATE_TIMING, { element: element('Pruefen'), attribute: 'valueClass', value: 'supporting' });
    get('selection').deselect(element('Erstellen'));
    get('selection').select(get('canvas').getRootElement());
    await wait();
    await open('bestbpmn-value');
    const text = container.querySelector('[data-group-id="group-bestbpmn-value"]')?.textContent ?? '';
    expect(text).toContain('Weg 1');
    expect(text).toContain('Flussrate');
    expect(text).toContain('wertschöpfend');
    const { xml } = await modeler.saveXML();
    expect(xml).toMatch(/<bestadd:timing [^>]*valueClass="value_adding"/);
  });

  it('weist eine Eingabe ab, die keine Dauer ist', async () => {
    await setup();
    get('selection').select(element('Erstellen'));
    await wait();
    await open('bestbpmn-timing');
    await type(input('bestbpmn-timing-effort'), 'bald');
    expect(readTiming(element('Erstellen').businessObject)).toBeUndefined();
    expect(container.querySelector('[data-entry-id="bestbpmn-timing-effort"] .bio-properties-panel-error')?.textContent).toContain('Keine Dauer');
  });
});
