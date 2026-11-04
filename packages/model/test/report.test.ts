import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createModdle, deriveElementTables, deriveProfile } from '../src/index.js';

const shape = (id: string, x: number, y: number) =>
  `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="100" height="80" /></bpmndi:BPMNShape>`;
const flow = (id: string, from: string, to: string, name = '') =>
  `<bpmn:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}"${name ? ` name="${name}"` : ''} />`;

// Antrag: Start → Erfassen → Entscheidung (Ja: Genehmigen, Nein: Ablehnen) → Zusammenführung → Mitteilen → Ende.
// Genehmigen hat einen angehefteten Zeitgeber, „Nachfragen“ springt zurück zu „Erfassen“.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:bestadd="urn:bestadd:schema:1.0" xmlns:raci="urn:bestadd:raci:1.0" id="D" targetNamespace="urn:test">
  <bpmn:process id="Antrag" name="Antrag bearbeiten">
    <bpmn:documentation>Ein Antrag wird geprüft und beschieden.</bpmn:documentation>
    <bpmn:dataObject id="DO_Antrag" />
    <bpmn:dataObject id="DO_Prozess" />
    <bpmn:dataObjectReference id="Ref_Antrag" name="Antrag [eingegangen]" dataObjectRef="DO_Antrag"><bpmn:dataState id="S1" name="eingegangen" /></bpmn:dataObjectReference>
    <bpmn:dataObjectReference id="Ref_Antrag2" name="Antrag [geprüft]" dataObjectRef="DO_Antrag"><bpmn:dataState id="S2" name="geprüft" /></bpmn:dataObjectReference>
    <bpmn:dataObjectReference id="Ref_Bescheid" name="Bescheid" dataObjectRef="DO_Antrag" />
    <bpmn:dataObjectReference id="Ref_Prozess" name="Prozess [erfasst]" dataObjectRef="DO_Prozess"><bpmn:dataState id="S3" name="erfasst" /></bpmn:dataObjectReference>
    <bpmn:dataStoreReference id="Ref_Akte" name="Akte" />
    <bpmn:startEvent id="Start" name="Antrag eingegangen">
      <bpmn:documentation>Per Post oder E-Mail.</bpmn:documentation>
      <bpmn:messageEventDefinition id="M1" />
      <bpmn:dataOutputAssociation id="A1"><bpmn:targetRef>Ref_Antrag</bpmn:targetRef></bpmn:dataOutputAssociation>
      <bpmn:dataOutputAssociation id="A1b"><bpmn:targetRef>Ref_Prozess</bpmn:targetRef></bpmn:dataOutputAssociation>
    </bpmn:startEvent>
    <bpmn:userTask id="Erfassen" name="Antrag erfassen">
      <bpmn:documentation>Daten ins System übernehmen.</bpmn:documentation>
      <bpmn:extensionElements>
        <bestadd:attributes>
          <bestadd:attribute key="links"><bestadd:link href="https://example.org/anleitung" title="Anleitung" /></bestadd:attribute>
          <bestadd:attribute key="services"><bestadd:serviceRef ref="svc-crm" name="CRM" /></bestadd:attribute>
        </bestadd:attributes>
      </bpmn:extensionElements>
      <bpmn:dataInputAssociation id="A2"><bpmn:sourceRef>Ref_Antrag</bpmn:sourceRef></bpmn:dataInputAssociation>
      <bpmn:potentialOwner id="O1"><bpmn:resourceAssignmentExpression id="E1"><bpmn:formalExpression>group(Sachbearbeitung)</bpmn:formalExpression></bpmn:resourceAssignmentExpression></bpmn:potentialOwner>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Entscheidung" name="Genehmigt?" default="F_Nein" />
    <bpmn:manualTask id="Genehmigen" name="Genehmigen">
      <bpmn:extensionElements>
        <bestadd:attributes>
          <bestadd:attribute key="services"><bestadd:serviceRef ref="svc-crm" name="CRM" /><bestadd:serviceRef ref="svc-dms" name="DMS" /></bestadd:attribute>
        </bestadd:attributes>
      </bpmn:extensionElements>
      <bpmn:dataInputAssociation id="A3"><bpmn:sourceRef>Ref_Antrag2</bpmn:sourceRef></bpmn:dataInputAssociation>
    </bpmn:manualTask>
    <bpmn:boundaryEvent id="Frist" name="Frist abgelaufen" attachedToRef="Genehmigen" cancelActivity="false"><bpmn:timerEventDefinition id="T1" /></bpmn:boundaryEvent>
    <bpmn:task id="Erinnern" name="Erinnern" />
    <bpmn:endEvent id="EndeErinnert" name="Erinnert" />
    <bpmn:serviceTask id="Ablehnen" name="Ablehnen" />
    <bpmn:task id="Nachfragen" name="Nachfragen" />
    <bpmn:exclusiveGateway id="Zusammen" />
    <bpmn:sendTask id="Mitteilen" name="Bescheid mitteilen" />
    <bpmn:endEvent id="Ende" name="Antrag beschieden">
      <bpmn:dataInputAssociation id="A4"><bpmn:sourceRef>Ref_Bescheid</bpmn:sourceRef></bpmn:dataInputAssociation>
      <bpmn:dataInputAssociation id="A5"><bpmn:sourceRef>Ref_Akte</bpmn:sourceRef></bpmn:dataInputAssociation>
    </bpmn:endEvent>
    ${flow('F1', 'Start', 'Erfassen')}
    ${flow('F2', 'Erfassen', 'Entscheidung')}
    ${flow('F_Ja', 'Entscheidung', 'Genehmigen', 'Ja')}
    ${flow('F_Nein', 'Entscheidung', 'Ablehnen', 'Nein')}
    ${flow('F_Frage', 'Entscheidung', 'Nachfragen', 'Unklar')}
    ${flow('F3', 'Genehmigen', 'Zusammen')}
    ${flow('F4', 'Ablehnen', 'Zusammen')}
    ${flow('F5', 'Nachfragen', 'Erfassen')}
    ${flow('F6', 'Zusammen', 'Mitteilen')}
    ${flow('F7', 'Mitteilen', 'Ende')}
    ${flow('F8', 'Frist', 'Erinnern')}
    ${flow('F9', 'Erinnern', 'EndeErinnert')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="P" bpmnElement="Antrag">
    ${shape('Start', 0, 200)}${shape('Erfassen', 100, 200)}${shape('Entscheidung', 250, 200)}
    ${shape('Genehmigen', 400, 100)}${shape('Ablehnen', 400, 250)}${shape('Nachfragen', 400, 400)}
    ${shape('Frist', 420, 160)}${shape('Erinnern', 500, 0)}${shape('EndeErinnert', 650, 0)}
    ${shape('Zusammen', 550, 200)}${shape('Mitteilen', 650, 200)}${shape('Ende', 800, 200)}
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function load(xml = XML) {
  return (await createModdle().fromXML(xml)).rootElement;
}

describe('Elementtabelle', () => {
  it('nummeriert in Ablaufreihenfolge, Zweige von oben nach unten', async () => {
    const [table] = deriveElementTables(await load());
    expect(table!.processName).toBe('Antrag bearbeiten');
    expect(table!.rows.map((r) => `${r.number} ${r.id}`)).toEqual([
      '1 Start',
      '2 Erfassen',
      '3 Entscheidung',
      // Seitenzweige zuerst, damit am Schluss das Endereignis des Hauptwegs steht.
      '4 Nachfragen',
      '5 Genehmigen',
      '6 Frist',
      '7 Erinnern',
      '8 EndeErinnert',
      '9 Ablehnen',
      '10 Zusammen',
      '11 Mitteilen',
      '12 Ende',
    ]);
  });

  it('kennt Elementtyp und Elementart', async () => {
    const rows = deriveElementTables(await load())[0]!.rows;
    const of = (id: string) => rows.find((r) => r.id === id)!;
    expect([of('Start').type, of('Start').kind]).toEqual(['startEvent', 'message']);
    expect([of('Erfassen').type, of('Erfassen').kind]).toEqual(['task', 'user']);
    expect([of('Genehmigen').kind, of('Ablehnen').kind, of('Mitteilen').kind, of('Erinnern').kind]).toEqual([
      'manual',
      'service',
      'send',
      'none',
    ]);
    expect([of('Entscheidung').type, of('Entscheidung').kind]).toEqual(['gateway', 'exclusive']);
    expect(of('Frist')).toMatchObject({ type: 'boundaryEvent', kind: 'timer', nonInterrupting: true });
    expect([of('Ende').type, of('Ende').kind]).toEqual(['endEvent', 'none']);
  });

  it('übernimmt Beschreibung, IT-Systeme und Links', async () => {
    const erfassen = deriveElementTables(await load())[0]!.rows[1]!;
    expect(erfassen.description).toBe('Daten ins System übernehmen.');
    expect(erfassen.services).toEqual([{ ref: 'svc-crm', name: 'CRM' }]);
    expect(erfassen.links).toEqual([{ href: 'https://example.org/anleitung', title: 'Anleitung' }]);
  });

  it('verweist bei Zweigen, Sprüngen, Rücksprüngen und angehefteten Ereignissen', async () => {
    const rows = deriveElementTables(await load())[0]!.rows;
    const next = (id: string) => rows.find((r) => r.id === id)!.next;
    expect(next('Entscheidung')).toEqual([
      { target: '5', direction: 'forward', label: 'Ja' },
      { target: '9', direction: 'forward', label: 'Nein', isDefault: true },
      { target: '4', direction: 'forward', label: 'Unklar' },
    ]);
    expect(next('Genehmigen')).toEqual([
      { target: '10', direction: 'forward' },
      { target: '6', direction: 'forward', boundary: { name: 'Frist abgelaufen', kind: 'timer' } },
    ]);
    expect(next('Ablehnen')).toEqual([]);
    expect(next('Nachfragen')).toEqual([{ target: '2', direction: 'back' }]);
    expect(next('Ende')).toEqual([]);
  });

  it('endet immer mit dem Endereignis des Hauptwegs', async () => {
    // Hauptweg oben, Abbruch unten und ein angeheftetes Ereignis mit eigenem Ende.
    const shape = (id: string, x: number, y: number) =>
      `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="36" height="36" /></bpmndi:BPMNShape>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="D" targetNamespace="urn:test">
  <bpmn:process id="P">
    <bpmn:startEvent id="S" /><bpmn:task id="A" /><bpmn:exclusiveGateway id="G" />
    <bpmn:task id="B" /><bpmn:endEvent id="E" />
    <bpmn:task id="Abbruch" /><bpmn:endEvent id="EAbbruch" />
    <bpmn:boundaryEvent id="Frist" attachedToRef="B"><bpmn:timerEventDefinition /></bpmn:boundaryEvent><bpmn:endEvent id="EFrist" />
    ${flow('f1', 'S', 'A')}${flow('f2', 'A', 'G')}${flow('f3', 'G', 'B')}${flow('f4', 'B', 'E')}
    ${flow('f5', 'G', 'Abbruch')}${flow('f6', 'Abbruch', 'EAbbruch')}${flow('f7', 'Frist', 'EFrist')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="Pl" bpmnElement="P">
    ${shape('S', 0, 100)}${shape('A', 100, 100)}${shape('G', 200, 100)}${shape('B', 300, 100)}${shape('E', 500, 100)}
    ${shape('Abbruch', 300, 300)}${shape('EAbbruch', 400, 300)}${shape('Frist', 320, 140)}${shape('EFrist', 400, 200)}
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
    const rows = deriveElementTables(await load(xml))[0]!.rows;
    expect(rows.map((r) => r.id)).toEqual(['S', 'A', 'G', 'Abbruch', 'EAbbruch', 'B', 'Frist', 'EFrist', 'E']);
    expect(rows.at(-1)!.type).toBe('endEvent');
    expect(deriveProfile(await load(xml)).endStates.map((e) => e.id)).toEqual(['E', 'EAbbruch', 'EFrist']);
  });

  it('nummeriert Teilprozesse mit Punkt', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:test">
  <bpmn:process id="P">
    <bpmn:startEvent id="S" /><bpmn:subProcess id="Sub" name="Prüfen">
      <bpmn:startEvent id="S2" /><bpmn:task id="T2" /><bpmn:endEvent id="E2" />
      ${flow('g1', 'S2', 'T2')}${flow('g2', 'T2', 'E2')}
    </bpmn:subProcess><bpmn:endEvent id="E" />
    ${flow('f1', 'S', 'Sub')}${flow('f2', 'Sub', 'E')}
  </bpmn:process>
</bpmn:definitions>`;
    const rows = deriveElementTables(await load(xml))[0]!.rows;
    expect(rows.map((r) => [r.number, r.id, r.depth])).toEqual([
      ['1', 'S', 0],
      ['2', 'Sub', 0],
      ['2.1', 'S2', 1],
      ['2.2', 'T2', 1],
      ['2.3', 'E2', 1],
      ['3', 'E', 0],
    ]);
    expect(rows[1]).toMatchObject({ type: 'subProcess', kind: 'embedded' });
  });
});

describe('Steckbrief', () => {
  it('leitet alle Angaben aus dem Modell ab', async () => {
    const profile = deriveProfile(await load());
    expect(profile.name).toBe('Antrag bearbeiten');
    expect(profile.description).toBe('Ein Antrag wird geprüft und beschieden.');
    expect(profile.triggers).toEqual([
      { id: 'Start', name: 'Antrag eingegangen', description: 'Per Post oder E-Mail.', kind: 'message' },
    ]);
    expect(profile.endStates.map((e) => e.name)).toEqual(['Antrag beschieden', 'Erinnert']);
    expect(profile.firstActivities.map((e) => e.name)).toEqual(['Antrag erfassen']);
    // Über die Zusammenführung zurück: Genehmigen und Ablehnen führen zu „Bescheid mitteilen“, das ist die letzte Aktivität.
    expect(profile.lastActivities.map((e) => e.name)).toEqual(['Bescheid mitteilen', 'Erinnern']);
    // Das Datenobjekt „Prozess“ trägt nur den Status.
    expect(profile.inputs).toEqual([{ id: 'Ref_Antrag', name: 'Antrag', state: 'eingegangen' }]);
    expect(profile.outputs).toEqual([
      { id: 'Ref_Bescheid', name: 'Bescheid' },
      { id: 'Ref_Akte', name: 'Akte', store: true },
    ]);
    expect(profile.resources.people).toEqual(['group(Sachbearbeitung)']);
    expect(profile.resources.documents).toEqual([{ id: 'Ref_Antrag', name: 'Antrag' }]);
    expect(profile.resources.links).toEqual([{ href: 'https://example.org/anleitung', title: 'Anleitung' }]);
    expect(profile.resources.systems).toEqual([
      { ref: 'svc-crm', name: 'CRM' },
      { ref: 'svc-dms', name: 'DMS' },
    ]);
  });

  it('funktioniert mit den Vorlagen', async () => {
    for (const name of ['dokumentenfreigabe', 'incident']) {
      const xml = readFileSync(new URL(`../../../templates/processes/${name}.bpmn`, import.meta.url), 'utf8');
      const definitions = await load(xml);
      const profile = deriveProfile(definitions);
      expect(profile.name).toBeTruthy();
      expect(profile.triggers.length).toBeGreaterThan(0);
      expect(profile.firstActivities.length).toBeGreaterThan(0);
      const rows = deriveElementTables(definitions).flatMap((t) => t.rows);
      expect(new Set(rows.map((r) => r.number)).size).toBe(rows.length);
    }
  });
});
