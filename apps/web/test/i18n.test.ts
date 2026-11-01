import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { createI18n } from '@bestbpmn/i18n';
import { readTranslations, type StatusDefinition } from '@bestbpmn/model';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import states from '../../../templates/catalog/states.json';
import incident from '../../../templates/processes/incident.bpmn?raw';
import { EMPTY_DIAGRAM } from '../src/emptyDiagram';
import {
  fileNameFor,
  modelName,
  bestbpmnModdleExtensions,
  bestbpmnModule,
  bestbpmnPropertiesProviderModule,
  translateModule,
  UPDATE_TRANSLATION,
} from '@bestbpmn/bpmn-js-extension';
import { renderStatusPanel } from '../src/statusPanel';

let container: HTMLDivElement;
let modeler: any;
const get = <T = any>(name: string): T => modeler.get(name) as T;
const element = (id: string) => get('elementRegistry').get(id);
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 150));

async function setup(xml = template, language = 'en') {
  container = document.createElement('div');
  container.innerHTML = '<div id="c" style="width:1000px;height:600px"></div><div id="p"></div>';
  document.body.appendChild(container);
  modeler = new Modeler({
    container: container.querySelector<HTMLElement>('#c')!,
    additionalModules: [
      BpmnPropertiesPanelModule,
      BpmnPropertiesProviderModule,
      bestbpmnModule,
      bestbpmnPropertiesProviderModule,
      translateModule(language),
    ],
    moddleExtensions: bestbpmnModdleExtensions,
    propertiesPanel: { parent: container.querySelector('#p') },
    bestbpmn: { language, states: states as StatusDefinition[] },
  });
  await modeler.importXML(xml);
}

function createReference(x: number) {
  const shape = get('elementFactory').createShape({ type: 'bpmn:DataObjectReference' });
  return get('modeling').createShape(shape, { x, y: 300 }, get('canvas').getRootElement());
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Übersetzungen im Modell', () => {
  it('übersetzt Name und Beschreibung einer Aktivität und räumt leere wieder auf', async () => {
    await setup();
    const task = element('Pruefen');
    const before = task.businessObject.extensionElements.values.length;
    get('commandStack').execute(UPDATE_TRANSLATION, { element: task, target: task.businessObject, lang: 'en', name: 'Review document' });
    expect(readTranslations(task.businessObject)).toEqual({ en: { name: 'Review document' } });

    get('commandStack').execute(UPDATE_TRANSLATION, { element: task, target: task.businessObject, lang: 'en', name: '' });
    expect(readTranslations(task.businessObject)).toEqual({});
    expect(task.businessObject.extensionElements.values).toHaveLength(before);
  });
});

describe('Oberfläche in zwei Sprachen', () => {
  it('zeigt im Panel die Übersetzungsfelder der anderen Sprache', async () => {
    await setup(template, 'de');
    await nextTick();
    get('selection').select(element('Erstellen'));
    await nextTick();

    const panel = container.querySelector('#p')!;
    const group = panel.querySelector('[data-group-id="group-bestbpmn-translations"]')!;
    expect(group.textContent).toContain('Übersetzungen');
    expect(group.textContent).toContain('Name (English)');
    expect(panel.textContent).toContain('Allgemein');
    expect(panel.textContent).toContain('Weiterführende Dokumentation');
  });

  it('bietet an der Referenz auf „Prozess“ die Status aus der Statustabelle an', async () => {
    await setup(template, 'de');
    await nextTick();
    get('selection').select(element('Ref_Freigegeben'));
    await nextTick();

    const group = container.querySelector('[data-group-id="group-bestbpmn-status"]')!;
    const select = group.querySelector<HTMLSelectElement>('select')!;
    expect(select.value).toBe('approved');
    expect(group.textContent).toContain('Datenobjekt-ID');
    expect(group.querySelector<HTMLInputElement>('input[name="bestbpmn-status-data-object"]')?.value).toBe('Prozess');
    expect([...select.options].map((o) => o.textContent)).toContain('In Arbeit (in_progress)');

    select.value = 'rejected';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    expect(element('Ref_Freigegeben').businessObject.name).toBe('Prozess [rejected]');
    expect(element('Ref_Freigegeben').businessObject.dataState.name).toBe('rejected');
    get('selection').select(null);
    await nextTick();
  });

  it('zeigt an anderen Datenobjekten nur einen Hinweis statt einer Statusauswahl', async () => {
    await setup(template, 'de');
    await nextTick();
    get('selection').select(element('Ref_Dokument'));
    await nextTick();

    const group = container.querySelector('[data-group-id="group-bestbpmn-status"]')!;
    expect(group.querySelector('select')).toBeNull();
    expect(group.textContent).toContain('Nur das Datenobjekt „Prozess“ hat einen Status');
    get('selection').select(null);
    await nextTick();
  });

  it('zeigt Status und Meldungen in der gewählten Sprache', async () => {
    await setup();
    const models = get('bestbpmnStatusCheck').getModels();
    const panel = document.createElement('div');

    renderStatusPanel(panel, models, { language: 'en', t: createI18n('en').t });
    expect(panel.textContent).toContain('In review');
    expect(panel.textContent).toContain('Status changes');

    renderStatusPanel(panel, models, { language: 'de', t: createI18n('de').t });
    expect(panel.textContent).toContain('In Prüfung');
    expect(panel.textContent).toContain('Statuswechsel');

    const issues = [{ code: 'state-only-in-label', severity: 'warning', params: { state: 'Offen' } }];
    renderStatusPanel(panel, [{ ...models[0], issues }], { language: 'en', t: createI18n('en').t });
    expect(panel.textContent).toContain('The status “Offen” is only in the label, not a dataState.');
  });
});

describe('Kollaboration mit einem Pool', () => {
  it('zeigt die Kollaboration mit Name und Beschreibung des Prozesses', async () => {
    await setup(incident, 'de');
    await nextTick();
    get('selection').select(get('canvas').getRootElement());
    await nextTick();

    const panel = container.querySelector('#p')!;
    expect(panel.querySelector('.bio-properties-panel-header-type')?.textContent).toBe('Kollaboration');
    const name = panel.querySelector<HTMLInputElement>('input[name="bestbpmn-process-name"]')!;
    expect(name.value).toBe('Incident bearbeiten');
    expect(panel.querySelector<HTMLTextAreaElement>('textarea[name="bestbpmn-process-documentation"]')?.value).toMatch(/^Ein Incident/);
    get('selection').select(null);
    await nextTick();
  });

  it('benennt Kollaboration und Prozess gemeinsam um, der Pool behält seinen Namen', async () => {
    await setup(incident, 'de');
    const root = get('canvas').getRootElement();
    const pool = element('Pool_Incident');
    get('commandStack').execute('bestbpmn.process.rename', { element: root, name: 'Störung beheben' });
    expect(pool.businessObject.processRef.name).toBe('Störung beheben');
    expect(root.businessObject.name).toBe('Störung beheben');
    expect(pool.businessObject.name).toBe('IT-Service');

    get('commandStack').undo();
    expect(pool.businessObject.processRef.name).toBe('Incident bearbeiten');
    expect(root.businessObject.name).toBe('Incident bearbeiten');

    get('modeling').updateLabel(pool, 'IT-Betrieb');
    expect(pool.businessObject.processRef.name).toBe('Incident bearbeiten');
    expect(root.businessObject.name).toBe('Incident bearbeiten');
  });

  it('benennt bei mehreren Pools nur die Kollaboration um', async () => {
    await setup(incident, 'de');
    const root = get('canvas').getRootElement();
    const pool = get('elementFactory').createParticipantShape({ type: 'bpmn:Participant', isExpanded: true });
    const second = get('modeling').createShape(pool, { x: 600, y: 900 }, root);
    expect(second.businessObject.processRef).toBeTruthy();
    get('commandStack').execute('bestbpmn.process.rename', { element: root, name: 'Störung beheben' });
    expect(root.businessObject.name).toBe('Störung beheben');
    expect(element('Pool_Incident').businessObject.processRef.name).toBe('Incident bearbeiten');
    expect(second.businessObject.processRef.name).toBeUndefined();
  });

  it('liefert den Modellnamen für Fenstertitel und Dateiname', async () => {
    await setup(incident, 'de');
    expect(modelName(modeler.getDefinitions())).toBe('Incident bearbeiten');
    expect(fileNameFor('Incident bearbeiten')).toBe('Incident bearbeiten.bpmn');
    expect(fileNameFor('A/B: C?')).toBe('A-B- C-.bpmn');
    expect(fileNameFor(undefined)).toBe('process.bpmn');
  });

  it('bildet Dateinamen, die unter Windows gültig sind', () => {
    expect(fileNameFor('Ende.')).toBe('Ende.bpmn');
    expect(fileNameFor('Ende . . ')).toBe('Ende.bpmn');
    expect(fileNameFor('Zeile\nZwei')).toBe('Zeile-Zwei.bpmn');
    expect(fileNameFor('CON')).toBe('CON-process.bpmn');
    expect(fileNameFor('lpt1')).toBe('lpt1-process.bpmn');
    expect(fileNameFor('Console')).toBe('Console.bpmn');
    expect(fileNameFor('...')).toBe('process.bpmn');
  });
});
