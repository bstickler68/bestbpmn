import { describe, expect, it } from 'vitest';
import { canConnectSymbols, createModdle, deriveFromDefinitions, deriveProcessChain, deriveProfile, symbolKind } from '../src/index.js';

// Bestellung: Einkauf (Prozess) → Bestellanforderung (Dokument) → Start → Prüfen → Ende → Bestellung (Ereignis) → Lieferant (Prozess).
// Dazu „Rechnungsprüfung“ direkt hinter dem Ende, eine Schnittstelle ohne Typ und ein Datenobjekt am Start (altes Notkonstrukt).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" id="D" targetNamespace="urn:test">
  <bpmn:collaboration id="C" name="Bestellung">
    <bpmn:participant id="Pool" name="Einkauf" processRef="P" />
    <bpmn:textAnnotation id="Vor" bestadd:symbol="process" bestadd:processRef="P-12"><bpmn:text>Bedarf melden</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="In" bestadd:symbol="interface" bestadd:interfaceType="document">
      <bpmn:documentation>Formular im DMS</bpmn:documentation>
      <bpmn:text>Bestellanforderung</bpmn:text>
    </bpmn:textAnnotation>
    <bpmn:textAnnotation id="Out" bestadd:symbol="interface" bestadd:interfaceType="event"><bpmn:text>Bestellung</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="Nach" bestadd:symbol="process"><bpmn:text>Lieferant beliefert</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="Nach2" bestadd:symbol="process"><bpmn:text>Rechnungsprüfung</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="Lose" bestadd:symbol="interface"><bpmn:text>Lose</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="Notiz"><bpmn:text>Nur eine Anmerkung</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="a1" sourceRef="Vor" targetRef="In" associationDirection="One" />
    <bpmn:association id="a2" sourceRef="In" targetRef="Start" associationDirection="One" />
    <bpmn:association id="a3" sourceRef="Ende" targetRef="Out" associationDirection="One" />
    <bpmn:association id="a4" sourceRef="Out" targetRef="Nach" associationDirection="One" />
    <bpmn:association id="a5" sourceRef="Ende" targetRef="Nach2" associationDirection="One" />
    <bpmn:association id="a6" sourceRef="Start" targetRef="Vor" associationDirection="One" />
    <bpmn:association id="a7" sourceRef="Notiz" targetRef="Pruefen" />
  </bpmn:collaboration>
  <bpmn:process id="P">
    <bpmn:dataObject id="DO" />
    <bpmn:dataObjectReference id="Ref_Alt" name="Altes Formular" dataObjectRef="DO" />
    <bpmn:startEvent id="Start" name="Anforderung eingegangen">
      <bpmn:dataOutputAssociation id="d1"><bpmn:targetRef>Ref_Alt</bpmn:targetRef></bpmn:dataOutputAssociation>
    </bpmn:startEvent>
    <bpmn:task id="Pruefen" name="Prüfen" />
    <bpmn:endEvent id="Ende" name="Bestellt" />
    <bpmn:sequenceFlow id="f1" sourceRef="Start" targetRef="Pruefen" />
    <bpmn:sequenceFlow id="f2" sourceRef="Pruefen" targetRef="Ende" />
  </bpmn:process>
</bpmn:definitions>`;

async function load(xml = XML) {
  return (await createModdle().fromXML(xml)).rootElement as any;
}

describe('Prozess- und Schnittstellensymbole', () => {
  it('erkennt die Symbole und lässt gewöhnliche Anmerkungen in Ruhe', async () => {
    const defs = await load();
    const artifacts = defs.rootElements[0].artifacts as any[];
    expect(artifacts.map((a) => symbolKind(a))).toEqual([
      'process',
      'interface',
      'interface',
      'process',
      'process',
      'interface',
      undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    ]);
  });

  it('leitet vor- und nachgelagerte Prozesse, Inputs und Outputs ab', async () => {
    const chain = deriveProcessChain(await load());
    expect(chain.upstream).toEqual([{ id: 'Vor', name: 'Bedarf melden', processRef: 'P-12' }]);
    expect(chain.downstream.map((p) => p.name)).toEqual(['Lieferant beliefert', 'Rechnungsprüfung']);
    expect(chain.inputs).toEqual([
      {
        id: 'In',
        name: 'Bestellanforderung',
        type: 'document',
        description: 'Formular im DMS',
        processes: [{ id: 'Vor', name: 'Bedarf melden', processRef: 'P-12' }],
        events: ['Anforderung eingegangen'],
      },
    ]);
    expect(chain.outputs).toEqual([
      { id: 'Out', name: 'Bestellung', type: 'event', processes: [{ id: 'Nach', name: 'Lieferant beliefert' }], events: ['Bestellt'] },
    ]);
  });

  it('der Steckbrief nimmt die Symbole statt der Datenobjekte', async () => {
    const profile = deriveProfile(await load());
    expect(profile.inputs.map((i) => i.id)).toEqual(['In']);
    expect(profile.outputs.map((i) => i.id)).toEqual(['Out']);
    expect(profile.upstream.map((p) => p.id)).toEqual(['Vor']);
    expect(profile.downstream.map((p) => p.id)).toEqual(['Nach', 'Nach2']);
  });

  it('prüft Typ, Verbindungen und das alte Notkonstrukt', async () => {
    const [model] = deriveFromDefinitions(await load());
    const issues = model!.issues.filter((i) =>
      ['interface-without-type', 'symbol-not-connected', 'symbol-invalid-connection', 'data-at-start-or-end'].includes(i.code),
    );
    expect(issues.map((i) => [i.code, i.elementId])).toEqual([
      ['symbol-invalid-connection', 'a6'],
      ['interface-without-type', 'Lose'],
      ['symbol-not-connected', 'Lose'],
      ['data-at-start-or-end', 'Start'],
    ]);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('erlaubt nur Verbindungen in Flussrichtung und keine Schnittstelle als Input und Output zugleich', async () => {
    const defs = await load();
    const byId = (id: string) => defs.rootElements.flatMap((r: any) => [...(r.artifacts ?? []), ...(r.flowElements ?? [])]).find((e: any) => e.id === id);
    const associations = defs.rootElements[0].artifacts.filter((a: any) => a.$type === 'bpmn:Association');
    expect(canConnectSymbols(byId('Vor'), byId('Start'), associations)).toBe(true);
    expect(canConnectSymbols(byId('Start'), byId('Vor'), associations)).toBe(false);
    expect(canConnectSymbols(byId('Vor'), byId('Pruefen'), associations)).toBe(false);
    expect(canConnectSymbols(byId('Vor'), byId('Ende'), associations)).toBe(false);
    expect(canConnectSymbols(byId('Ende'), byId('Vor'), associations)).toBe(true);
    // „Bestellanforderung“ ist schon Input; vom Ende her wäre sie zugleich Output.
    expect(canConnectSymbols(byId('Ende'), byId('In'), associations)).toBe(false);
    expect(canConnectSymbols(byId('Lose'), byId('Start'), associations)).toBe(true);
  });

  it('schreibt die Attribute wieder in die Datei', async () => {
    const moddle = createModdle();
    const { rootElement } = await moddle.fromXML(XML);
    const { xml } = await moddle.toXML(rootElement);
    expect(xml).toContain('bestadd:symbol="process" bestadd:processRef="P-12"');
    expect(xml).toContain('bestadd:interfaceType="document"');
  });
});
