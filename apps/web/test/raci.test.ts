import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { createI18n } from '@bestbpmn/i18n';
import { deriveRaciMatrices, readRaci, type RoleDefinition } from '@bestbpmn/model';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import roles from '../../../templates/catalog/roles.json';
import {
  praxiqModdleExtensions,
  praxiqModule,
  praxiqPropertiesProviderModule,
  translateModule,
  UPDATE_RACI,
} from '@bestbpmn/bpmn-js-extension';
import { renderRaciMatrix } from '../src/raciMatrix';

let container: HTMLDivElement;
let modeler: any;
const get = <T = any>(name: string): T => modeler.get(name) as T;
const element = (id: string) => get('elementRegistry').get(id);
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 150));

async function setup(language = 'en') {
  container = document.createElement('div');
  container.innerHTML = '<div id="c" style="width:1000px;height:600px"></div><div id="p"></div>';
  document.body.appendChild(container);
  modeler = new Modeler({
    container: container.querySelector<HTMLElement>('#c')!,
    additionalModules: [
      BpmnPropertiesPanelModule,
      BpmnPropertiesProviderModule,
      praxiqModule,
      praxiqPropertiesProviderModule,
      translateModule(language),
    ],
    moddleExtensions: praxiqModdleExtensions,
    propertiesPanel: { parent: container.querySelector('#p') },
    praxiq: { language, roles: roles as RoleDefinition[] },
  });
  await modeler.importXML(template);
}

/** Tippt in ein Suchfeld und wartet auf die Trefferliste. */
async function type(input: HTMLInputElement, text: string) {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));
}

/** Wählt einen Treffer wie mit der Maus. */
function pick(entry: Element, value: string) {
  entry.querySelector(`.praxiq-picker-results li[data-value="${value}"]`)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('RACI an Aktivitäten (ADR 0003)', () => {
  it('schreibt R als potentialOwner und nimmt es mit Rückgängig zurück', async () => {
    await setup();
    const task = element('Pruefen');
    get('commandStack').execute(UPDATE_RACI, {
      element: task,
      role: 'responsible',
      assignees: [{ kind: 'group', ref: 'reviewers' }, { kind: 'notPerformerOf', ref: 'Erstellen' }],
    });
    expect(readRaci(task.businessObject).responsible).toHaveLength(2);
    const { xml } = await modeler.saveXML();
    expect(xml).toMatch(/tFormalExpression" id="Formal_Pruefen">group\(reviewers\), notPerformerOf\(Erstellen\)</);

    get('commandStack').undo();
    expect(readRaci(task.businessObject).responsible).toEqual([{ kind: 'group', ref: 'reviewers' }]);
  });

  it('legt potentialOwner neu an und entfernt ihn wieder', async () => {
    await setup();
    const shape = get('elementFactory').createShape({ type: 'bpmn:UserTask' });
    const task = get('modeling').createShape(shape, { x: 300, y: 550 }, get('canvas').getRootElement());
    get('commandStack').execute(UPDATE_RACI, { element: task, role: 'responsible', assignees: [{ kind: 'user', ref: 'mmeier' }] });
    expect(task.businessObject.resources[0].$type).toBe('bpmn:PotentialOwner');

    get('commandStack').execute(UPDATE_RACI, { element: task, role: 'responsible', assignees: [] });
    expect(task.businessObject.resources ?? []).toHaveLength(0);
  });

  it('schreibt A, C und I in den raci-Namensraum und räumt leere auf', async () => {
    await setup();
    const task = element('Ueberarbeiten');
    get('commandStack').execute(UPDATE_RACI, {
      element: task,
      role: 'consulted',
      assignees: [{ kind: 'orgRole', ref: 'Leitung', of: 'autor' }],
    });
    get('commandStack').execute(UPDATE_RACI, { element: task, role: 'informed', assignees: [{ kind: 'initiator' }] });
    const { xml } = await modeler.saveXML();
    expect(xml).toContain('<raci:consulted><raci:dynamic orgRole="Leitung" of="autor" /></raci:consulted>');
    expect(xml).toContain('<raci:informed><raci:dynamic initiator="true" /></raci:informed>');

    get('commandStack').execute(UPDATE_RACI, { element: task, role: 'consulted', assignees: [] });
    get('commandStack').execute(UPDATE_RACI, { element: task, role: 'informed', assignees: [] });
    expect(task.businessObject.extensionElements).toBeUndefined();
  });

  it('zeigt die Rollen als Suchfelder mit Kästchen, auf Deutsch als DEMI', async () => {
    await setup('de');
    await nextTick();
    get('selection').select(element('Pruefen'));
    await nextTick();
    const entry = (role: string) => container.querySelector(`[data-entry-id="praxiq-raci-${role}"]`)!;
    const chips = (role: string) => [...entry(role).querySelectorAll('.praxiq-chip')].map((c) => c.getAttribute('data-value'));
    const group = container.querySelector('[data-group-id="group-praxiq-raci"]')!;
    expect(group.textContent).toContain('Verantwortlichkeiten (DEMI)');
    expect(group.textContent).toContain('D – Durchführungsverantwortlich');
    expect(chips('responsible')).toEqual(['group(reviewers)']);
    expect(entry('responsible').textContent).toContain('Prüfer (Gruppe)');
    expect(chips('accountable')).toEqual(['group(quality_management)']);
    expect(chips('consulted')).toEqual(['field(autor)']);
    expect(entry('consulted').textContent).toContain('field(autor) (nicht im Katalog)');
    // Einfachauswahl mit Wert: kein Suchfeld, erst nach dem Entfernen
    expect(entry('responsible').querySelector('input')).toBeNull();

    entry('responsible').querySelector<HTMLButtonElement>('.praxiq-chip-remove')!.click();
    await nextTick();
    expect(readRaci(element('Pruefen').businessObject).responsible).toEqual([]);

    await type(entry('responsible').querySelector('input')!, 'prozess');
    const results = [...entry('responsible').querySelectorAll('.praxiq-picker-results li')].map((li) => li.textContent);
    expect(results).toEqual(['Prozessverantwortlicher (Rolle)']);
    pick(entry('responsible'), 'role(process_owner)');
    expect(readRaci(element('Pruefen').businessObject).responsible).toEqual([{ kind: 'role', ref: 'process_owner' }]);

    // Mehrfachauswahl: nach der Auswahl weitersuchen
    await type(entry('informed').querySelector('input')!, 'desk');
    pick(entry('informed'), 'group(service_desk)');
    await nextTick();
    await type(entry('informed').querySelector('input')!, 'manager');
    pick(entry('informed'), 'role(incident_manager)');
    expect(readRaci(element('Pruefen').businessObject).informed).toEqual([
      { kind: 'group', ref: 'service_desk' },
      { kind: 'role', ref: 'incident_manager' },
    ]);
    get('selection').select(null);
    await nextTick();
  });

  it('zeigt die Matrix mit Buchstaben in der gewählten Sprache', async () => {
    await setup();
    const matrices = deriveRaciMatrices(modeler.getDefinitions());
    const panel = document.createElement('div');

    renderRaciMatrix(panel, matrices, createI18n('de').t);
    const row = panel.querySelector('tr[data-element-id="Pruefen"]')!;
    expect([...row.querySelectorAll('td')].map((td) => td.textContent).join('')).toBe('EDM');

    renderRaciMatrix(panel, matrices, createI18n('en').t);
    const rowEn = panel.querySelector('tr[data-element-id="Pruefen"]')!;
    expect([...rowEn.querySelectorAll('td')].map((td) => td.textContent).join('')).toBe('ARC');
  });
});

const LANE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:raci="https://praxiq.org/schema/raci/1.0" id="D" targetNamespace="t">
  <bpmn:collaboration id="C"><bpmn:participant id="Pool" name="Pool" processRef="P" /></bpmn:collaboration>
  <bpmn:process id="P">
    <bpmn:laneSet id="LS">
      <bpmn:lane id="Lane" name="Autoren"><bpmn:flowNodeRef>InLane</bpmn:flowNodeRef><bpmn:flowNodeRef>Multi</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane2" name="Service desk" raci:assignee="group(service_desk)" />
    </bpmn:laneSet>
    <bpmn:userTask id="InLane" name="In der Lane" />
    <bpmn:userTask id="Multi" name="Mehrfach"><bpmn:multiInstanceLoopCharacteristics /></bpmn:userTask>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="DI"><bpmndi:BPMNPlane id="Plane" bpmnElement="C">
    <bpmndi:BPMNShape id="Pool_di" bpmnElement="Pool" isHorizontal="true"><dc:Bounds x="100" y="50" width="600" height="400" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Lane_di" bpmnElement="Lane" isHorizontal="true"><dc:Bounds x="130" y="50" width="570" height="200" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Lane2_di" bpmnElement="Lane2" isHorizontal="true"><dc:Bounds x="130" y="250" width="570" height="200" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="InLane_di" bpmnElement="InLane"><dc:Bounds x="250" y="110" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Multi_di" bpmnElement="Multi"><dc:Bounds x="450" y="110" width="100" height="80" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe('D aus der Swimlane (ADR 0013)', () => {
  const issues = () =>
    get('praxiqStatusCheck')
      .getModels()[0]
      .issues.filter((i: any) => i.code.startsWith('raci-') && i.code !== 'raci-unknown-assignee')
      .map((i: any) => [i.code, i.elementId]);

  it('liest D aus der Lane und sperrt das Feld', async () => {
    await setup('de');
    await modeler.importXML(LANE_XML);
    expect(issues()).toEqual([]);

    await nextTick();
    get('selection').select(element('InLane'));
    await nextTick();
    const d = container.querySelector('[data-entry-id="praxiq-raci-responsible"]')!;
    expect(d.querySelector('.praxiq-picker-disabled')).not.toBeNull();
    expect(d.querySelector('input')).toBeNull();
    expect(d.querySelector('.praxiq-chip-remove')).toBeNull();
    expect(d.querySelector('.praxiq-chip')?.getAttribute('data-value')).toBe('group(Autoren)');
    expect(container.querySelector('[data-entry-id="praxiq-raci-responsible"]')!.textContent).toContain('Kommt aus der Swimlane');

    const matrix = document.createElement('div');
    renderRaciMatrix(matrix, deriveRaciMatrices(modeler.getDefinitions()), createI18n('de').t);
    expect(matrix.querySelector('td.from-lane')?.textContent).toBe('D');
    get('selection').select(null);
    await nextTick();
  });

  it('setzt Rolle/Gruppe und Namen der Lane aus der Tabelle und schreibt D in die Aufgaben', async () => {
    await setup('en');
    await modeler.importXML(LANE_XML);
    const lane = element('Lane');
    get('modeling').updateModdleProperties(lane, lane.businessObject, { assignee: 'group(authors)' });

    expect(lane.businessObject.name).toBe('Authors');
    expect(readRaci(element('InLane').businessObject).responsible).toEqual([{ kind: 'group', ref: 'authors' }]);

    get('modeling').updateLabel(lane, 'Something else');
    expect(lane.businessObject.name).toBe('Authors');

    get('commandStack').undo();
    get('commandStack').undo();
    expect(lane.businessObject.assignee).toBeUndefined();
    expect(lane.businessObject.name).toBe('Autoren');
  });

  it('aktualisiert D beim Verschieben in eine andere Lane', async () => {
    await setup('en');
    await modeler.importXML(LANE_XML);
    get('modeling').moveElements([element('InLane')], { x: 0, y: 200 });

    expect(readRaci(element('InLane').businessObject).responsible).toEqual([{ kind: 'group', ref: 'service_desk' }]);
    get('commandStack').undo();
    expect(readRaci(element('InLane').businessObject).responsible).toEqual([]);
  });

  it('erlaubt an Multi-Instanz-Aufgaben mehrere D, auch in einer Lane', async () => {
    await setup('de');
    await modeler.importXML(LANE_XML);
    const multi = element('Multi');
    get('commandStack').execute(UPDATE_RACI, {
      element: multi,
      role: 'responsible',
      assignees: [{ kind: 'group', ref: 'service_desk' }, { kind: 'role', ref: 'incident_manager' }],
    });
    get('modeling').moveElements([multi], { x: 0, y: 200 });
    expect(readRaci(multi.businessObject).responsible).toHaveLength(2);
    expect(issues()).toEqual([]);

    await nextTick();
    get('selection').select(multi);
    await nextTick();
    const entry = container.querySelector('[data-entry-id="praxiq-raci-responsible"]')!;
    expect(entry.querySelectorAll('.praxiq-chip')).toHaveLength(2);
    expect(entry.querySelector('input')).not.toBeNull();
    expect(entry.textContent).toContain('Multi-Instanz-Aufgabe');
    get('selection').select(null);
    await nextTick();
  });

  it('meldet eine Aufgabe ohne D, wenn die Lane keine Zuordnung hat', async () => {
    await setup('de');
    await modeler.importXML(LANE_XML);
    // Eine Lane ohne Rolle/Gruppe ist ein Modellierungsfehler und wird rot markiert.
    expect(get('canvas').hasMarker('Lane', 'praxiq-error')).toBe(true);
    expect(get('canvas').hasMarker('Lane2', 'praxiq-error')).toBe(false);
    get('modeling').updateLabel(element('Lane'), '');
    expect(issues()).toEqual([
      ['raci-missing-responsible', 'InLane'],
      ['raci-missing-responsible', 'Multi'],
    ]);
  });
});
