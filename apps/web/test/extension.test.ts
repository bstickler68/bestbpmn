import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import states from '../../../templates/catalog/states.json';
import type { StatusDefinition } from '@bestbpmn/model';
import { EMPTY_DIAGRAM } from '../src/emptyDiagram';
import { bestbpmnModdleExtensions, bestbpmnModule, type StatusCheck } from '@bestbpmn/bpmn-js-extension';

let container: HTMLDivElement;
let modeler: any;

const get = <T = any>(name: string): T => modeler.get(name) as T;

async function setup(xml = EMPTY_DIAGRAM) {
  container = document.createElement('div');
  container.style.width = '1000px';
  container.style.height = '600px';
  document.body.appendChild(container);
  modeler = new Modeler({
    container,
    additionalModules: [bestbpmnModule],
    moddleExtensions: bestbpmnModdleExtensions,
    bestbpmn: { states: states as StatusDefinition[] },
  });
  await modeler.importXML(xml);
}

function root() {
  return get('canvas').getRootElement();
}

function createReference(x: number, y = 300) {
  const shape = get('elementFactory').createShape({ type: 'bpmn:DataObjectReference' });
  return get('modeling').createShape(shape, { x, y }, root());
}

function dataObjectsInProcess() {
  return root().businessObject.flowElements.filter((el: any) => el.$type === 'bpmn:DataObject');
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Datenobjekt „Prozess“', () => {
  beforeEach(() => setup());

  it('hängt jede Referenz „Prozess“ an dasselbe Datenobjekt', () => {
    const a = createReference(200);
    const b = createReference(320);
    get('modeling').updateLabel(a, 'Prozess [new]');
    get('modeling').updateLabel(b, 'Prozess [approved]');

    expect(a.businessObject.dataObjectRef.name).toBe('Prozess');
    expect(b.businessObject.dataObjectRef).toBe(a.businessObject.dataObjectRef);
    expect(dataObjectsInProcess()).toHaveLength(1);
  });

  it('erlaubt weitere Datenobjekte ohne Status', () => {
    const a = createReference(200);
    const b = createReference(320);
    get('modeling').updateLabel(a, 'Prozess [new]');
    get('modeling').updateLabel(b, 'Dokument [Entwurf]');

    expect(b.businessObject.dataObjectRef.name).toBe('Dokument');
    expect(b.businessObject.dataState).toBeUndefined();
    expect(dataObjectsInProcess()).toHaveLength(2);
  });

  it('löst eine umbenannte Referenz vom Datenobjekt „Prozess“ und nimmt ihr den Status', () => {
    const a = createReference(200);
    const b = createReference(320);
    get('modeling').updateLabel(a, 'Prozess [new]');
    get('modeling').updateLabel(b, 'Prozess [approved]');
    get('modeling').updateLabel(b, 'Dokument');

    expect(a.businessObject.dataObjectRef.name).toBe('Prozess');
    expect(b.businessObject.dataObjectRef.name).toBe('Dokument');
    expect(b.businessObject.dataState).toBeUndefined();
  });

  it('behält das Datenobjekt, wenn eine von mehreren Referenzen gelöscht wird', () => {
    const a = createReference(200);
    const b = createReference(320);
    get('modeling').updateLabel(a, 'Prozess [new]');
    get('modeling').updateLabel(b, 'Prozess [approved]');
    const dataObject = a.businessObject.dataObjectRef;

    get('modeling').removeShape(a);

    expect(dataObjectsInProcess()).toEqual([dataObject]);
    expect(b.businessObject.dataObjectRef).toBe(dataObject);

    get('commandStack').undo();
    expect(a.businessObject.dataObjectRef).toBe(dataObject);
    expect(dataObjectsInProcess()).toEqual([dataObject]);
  });

  it('entfernt das Datenobjekt mit der letzten Referenz', () => {
    const a = createReference(200);
    get('modeling').removeShape(a);
    expect(dataObjectsInProcess()).toHaveLength(0);
  });

  it('schreibt genau ein Datenobjekt „Prozess“ in die Datei', async () => {
    for (const [x, label] of [[200, 'Prozess [new]'], [320, 'prozess [in_progress]'], [440, 'Prozess [closed]']] as const) {
      get('modeling').updateLabel(createReference(x), label);
    }
    const { xml } = await modeler.saveXML();
    expect(xml.match(/<bpmn:dataObject /g)).toHaveLength(1);
    expect(xml).toContain('name="Prozess [in_progress]"');
    expect(xml.match(/<bpmn:dataObjectReference /g)).toHaveLength(3);
  });
});

describe('Status aus der Beschriftung', () => {
  beforeEach(() => setup());

  it('macht aus „Prozess [in_progress]“ einen dataState mit der Status-ID', () => {
    const ref = createReference(200);
    get('modeling').updateLabel(ref, 'Prozess [in_progress]');

    expect(ref.businessObject.dataState?.$type).toBe('bpmn:DataState');
    expect(ref.businessObject.dataState).toMatchObject({ name: 'in_progress', key: 'in_progress' });
    expect(ref.businessObject.dataObjectRef.name).toBe('Prozess');
  });

  it('ersetzt einen Namen aus der Statustabelle durch die ID', () => {
    const ref = createReference(200);
    get('modeling').updateLabel(ref, 'Prozess [In Arbeit]');
    expect(ref.businessObject.name).toBe('Prozess [in_progress]');
    expect(ref.businessObject.dataState.name).toBe('in_progress');
  });

  it('übernimmt auch eine Änderung des Namens im Eigenschaftenpanel', () => {
    const ref = createReference(200);
    get('modeling').updateProperties(ref, { name: 'Prozess [approved]' });
    expect(ref.businessObject.dataState?.name).toBe('approved');
  });

  it('ändert den dataState mit der Beschriftung und entfernt ihn ohne Klammer', () => {
    const ref = createReference(200);
    get('modeling').updateLabel(ref, 'Prozess [in_progress]');
    get('modeling').updateLabel(ref, 'Prozess [approved]');
    expect(ref.businessObject.dataState.name).toBe('approved');

    get('modeling').updateLabel(ref, 'Prozess');
    expect(ref.businessObject.dataState).toBeUndefined();
  });

  it('nimmt den dataState mit Rückgängig wieder zurück', () => {
    const ref = createReference(200);
    get('modeling').updateLabel(ref, 'Prozess [in_progress]');
    get('commandStack').undo();

    expect(ref.businessObject.name).toBeFalsy();
    expect(ref.businessObject.dataState).toBeUndefined();
  });

  it('schreibt den dataState in die Datei', async () => {
    const ref = createReference(200);
    get('modeling').updateLabel(ref, 'Prozess [approved]');
    const { xml } = await modeler.saveXML();
    expect(xml).toContain('<bpmn:dataState name="approved" bestadd:key="approved" />');
  });
});

describe('Live-Prüfung', () => {
  it('liefert das Statusmodell der Vorlage ohne Meldungen', async () => {
    await setup(template);
    const [model] = get<StatusCheck>('bestbpmnStatusCheck').getModels();
    expect(model?.statuses).toEqual(['in_review', 'reviewed', 'approved']);
    expect(model?.initialStatuses).toEqual(['in_review']);
    expect(model?.statusNames.in_review).toBe('In Prüfung');
    // Die Vorlage hat nur an einer Aufgabe einen IT-Service; diese Regel hat eigene Tests.
    expect(model?.issues.filter((i) => i.code !== 'task-without-service')).toEqual([]);
  });

  it('markiert eine Referenz auf „Prozess“ ohne Status', async () => {
    await setup(template);
    get('modeling').updateLabel(get('elementRegistry').get('Ref_Freigegeben'), 'Prozess');

    const issues = get<StatusCheck>('bestbpmnStatusCheck').getModels()[0]!.issues;
    expect(issues).toContainEqual(expect.objectContaining({ code: 'reference-without-state', elementId: 'Ref_Freigegeben' }));
    expect(get('canvas').hasMarker('Ref_Freigegeben', 'bestbpmn-error')).toBe(true);

    get('commandStack').undo();
    expect(get('canvas').hasMarker('Ref_Freigegeben', 'bestbpmn-error')).toBe(false);
  });

  it('meldet das Statusmodell über ein Event', async () => {
    await setup();
    const seen: unknown[] = [];
    modeler.on('bestbpmn.status.changed', (e: any) => seen.push(e.models));
    createReference(200);
    expect(seen.length).toBeGreaterThan(0);
  });
});
