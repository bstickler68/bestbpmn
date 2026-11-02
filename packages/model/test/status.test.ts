import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createModdle, deriveStatusModels as derive, type StatusDefinition } from '../src/index.js';

/** Diese Tests prüfen Status und Zuständigkeit; die Regel für IT-Services hat eigene Tests. */
const deriveStatusModels = (...[xml, catalog, options]: Parameters<typeof derive>) =>
  derive(xml, catalog, { ...options, disabledRules: ['task-without-service', ...(options?.disabledRules ?? [])] });

const states = JSON.parse(
  readFileSync(new URL('../../../templates/catalog/states.json', import.meta.url), 'utf8'),
) as StatusDefinition[];

const template = (name: string) =>
  readFileSync(new URL(`../../../templates/processes/${name}`, import.meta.url), 'utf8');

/** Baut ein kleines Modell aus Prozessinhalt, ohne Diagramm. */
const model = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:process id="P" isExecutable="true">${body}</bpmn:process>
</bpmn:definitions>`;

/** Nur die Statusregeln; RACI wird in raci.test.ts geprüft. */
const statusIssues = (m: { issues: { code: string }[] }) => m.issues.filter((i) => !i.code.startsWith('raci-'));

const ref = (id: string, state?: string, label = 'Prozess') =>
  `<bpmn:dataObjectReference id="${id}" name="${label}" dataObjectRef="Vorgang">${
    state ? `<bpmn:dataState id="${id}_s" name="${state}" />` : ''
  }</bpmn:dataObjectReference>`;

const task = (id: string, inputs: string[], outputs: string[]) => `
  <bpmn:userTask id="${id}" name="${id}">
    <bpmn:property id="${id}_p" name="__targetRef_placeholder" />
    ${inputs
      .map(
        (r, i) =>
          `<bpmn:dataInputAssociation id="${id}_in${i}"><bpmn:sourceRef>${r}</bpmn:sourceRef><bpmn:targetRef>${id}_p</bpmn:targetRef></bpmn:dataInputAssociation>`,
      )
      .join('')}
    ${outputs
      .map(
        (r, i) =>
          `<bpmn:dataOutputAssociation id="${id}_out${i}"><bpmn:targetRef>${r}</bpmn:targetRef></bpmn:dataOutputAssociation>`,
      )
      .join('')}
  </bpmn:userTask>`;

describe('deriveStatusModels – Vorlage Dokumentenfreigabe', () => {
  it('leitet Status, Anfangsstatus und Statuswechsel ab', async () => {
    const [model, ...rest] = await deriveStatusModels(template('dokumentenfreigabe.bpmn'));
    expect(rest).toHaveLength(0);
    expect(model).toBeDefined();
    expect(model!.issues).toEqual([]);
    expect(model!.dataObjectName).toBe('Prozess');
    expect(model!.language).toBe('de');
    expect(model!.statuses).toEqual(['in_review', 'reviewed', 'approved']);
    expect(model!.initialStatuses).toEqual(['in_review']);
    expect(model!.changes.map((c) => [c.elementId, c.outputs, c.documentedInputs])).toEqual([
      ['Erstellen', ['in_review'], []],
      ['Pruefen', ['reviewed'], ['in_review']],
      ['Freigeben', ['approved'], ['reviewed']],
      ['Ueberarbeiten', ['in_review'], ['reviewed']],
    ]);
  });

  it('nimmt Namen und Übersetzungen aus der Statustabelle', async () => {
    const [model] = await deriveStatusModels(template('dokumentenfreigabe.bpmn'), { states });
    expect(model!.issues).toEqual([]);
    expect(model!.statusNames).toEqual({ in_review: 'In Prüfung', reviewed: 'Geprüft', approved: 'Freigegeben' });
    expect(model!.statusTranslations.in_review).toEqual({ en: 'In review', de: 'In Prüfung' });
  });

  it('prüft die Vorlage Incident ohne Meldungen: drei Startereignisse, Lanes, Multi-Instanz', async () => {
    const roles = JSON.parse(readFileSync(new URL('../../../templates/catalog/roles.json', import.meta.url), 'utf8'));
    const [m] = await deriveStatusModels(template('incident.bpmn'), { states, roles });
    expect(m!.issues).toEqual([]);
    expect(m!.initialStatuses).toEqual(['new']);
    expect(m!.statuses).toEqual(['new', 'resolved', 'closed']);
  });

  it('liest die RACI-Erweiterungen als typisierte Elemente', async () => {
    const { elementsById } = await createModdle().fromXML(template('dokumentenfreigabe.bpmn'));
    const pruefen = elementsById['Pruefen'] as any;
    const [accountable, consulted] = pruefen.extensionElements.values;
    expect(accountable.$type).toBe('raci:Accountable');
    expect(accountable.assignees[0]).toMatchObject({ $type: 'raci:Group', ref: 'quality_management' });
    expect(consulted.assignees[0]).toMatchObject({ $type: 'raci:Dynamic', field: 'autor' });

    const freigeben = elementsById['Freigeben'] as any;
    expect(freigeben.extensionElements.values[0].assignees[0]).toMatchObject({
      $type: 'raci:Dynamic',
      initiator: true,
    });
  });

  it('schreibt die RACI-Erweiterungen unverändert zurück', async () => {
    const moddle = createModdle();
    const { rootElement } = await moddle.fromXML(template('dokumentenfreigabe.bpmn'));
    const { xml } = await moddle.toXML(rootElement);
    expect(xml).toContain('<raci:consulted><raci:dynamic field="autor" /></raci:consulted>');
    expect(xml).toContain('xmlns:raci="urn:bestadd:raci:1.0"');
  });
});

describe('deriveStatusModels – Modellierregeln', () => {
  it('erlaubt weitere Datenobjekte, aber nur ein „Prozess“', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" /><bpmn:dataObject id="Zweites" name="prozess" />
         <bpmn:dataObject id="Dokument" name="Dokument" />`,
      ),
    );
    expect(statusIssues(m!)).toEqual([
      expect.objectContaining({ code: 'multiple-process-objects', severity: 'error', elementId: 'Zweites' }),
    ]);
  });

  it('kommt ohne Datenobjekt „Prozess“ aus, dann ohne Status', async () => {
    const [m] = await deriveStatusModels(model('<bpmn:dataObject id="Dokument" name="Dokument" />'));
    expect(statusIssues(m!)).toEqual([]);
    expect(m!.statuses).toEqual([]);
  });

  it('verlangt an jeder Referenz auf „Prozess“ einen Status', async () => {
    const [m] = await deriveStatusModels(model(`<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1')}`));
    expect(statusIssues(m!)).toEqual([
      expect.objectContaining({ code: 'reference-without-state', severity: 'error', elementId: 'R1' }),
    ]);
  });

  it('ignoriert Status an anderen Datenobjekten', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" /><bpmn:dataObject id="Dok" name="Dokument" />
         <bpmn:dataObjectReference id="D1" name="Dokument [Entwurf]" dataObjectRef="Dok"><bpmn:dataState id="D1_s" name="Entwurf" /></bpmn:dataObjectReference>
         <bpmn:dataObjectReference id="D2" name="Dokument" dataObjectRef="Dok" />
         ${ref('R1', 'Erledigt')}${task('A', ['D1'], ['R1', 'D2'])}`,
      ),
    );
    expect(m!.statuses).toEqual(['erledigt']);
    expect(m!.changes).toEqual([expect.objectContaining({ elementId: 'A', outputs: ['erledigt'], documentedInputs: [] })]);
    expect(statusIssues(m!)).toEqual([]);
  });

  it('behandelt Input-Verknüpfungen nur als Dokumentation', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" />
         ${ref('R1', 'Offen')}${ref('R2', 'Nirgends gesetzt')}${ref('R3', 'Erledigt')}
         ${task('Anlegen', [], ['R1'])}${task('A', ['R1'], ['R3'])}${task('B', ['R2'], ['R3'])}`,
      ),
    );
    expect(m!.changes.find((c) => c.elementId === 'B')).toMatchObject({
      outputs: ['erledigt'],
      documentedInputs: ['nirgends_gesetzt'],
    });
    expect(statusIssues(m!)).toEqual([
      expect.objectContaining({ code: 'input-state-never-set', severity: 'warning', elementId: 'B' }),
    ]);
  });

  it('nimmt den Anfangsstatus von den ersten Aktivitäten nach jedem Startereignis', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', 'Neu')}${ref('R2', 'In Arbeit')}
         <bpmn:startEvent id="Mail" /><bpmn:startEvent id="Telefon" />
         <bpmn:exclusiveGateway id="G" />
         ${task('AusMail', [], ['R1'])}${task('AmTelefon', [], ['R2'])}${task('Bearbeiten', [], [])}
         <bpmn:sequenceFlow id="f1" sourceRef="Mail" targetRef="G" />
         <bpmn:sequenceFlow id="f2" sourceRef="G" targetRef="AusMail" />
         <bpmn:sequenceFlow id="f3" sourceRef="Telefon" targetRef="AmTelefon" />
         <bpmn:sequenceFlow id="f4" sourceRef="AusMail" targetRef="Bearbeiten" />
         <bpmn:sequenceFlow id="f5" sourceRef="AmTelefon" targetRef="Bearbeiten" />`,
      ),
    );
    expect(m!.initialStatuses).toEqual(['neu', 'in_arbeit']);
    expect(statusIssues(m!)).toEqual([]);
  });

  it('überspringt Aktivitäten ohne Status vor der ersten mit Status', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', 'Neu')}${ref('R2', 'Erledigt')}
         <bpmn:startEvent id="S" />${task('Manuell', [], [])}${task('B', [], ['R1'])}${task('C', [], ['R2'])}
         <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Manuell" />
         <bpmn:sequenceFlow id="f2" sourceRef="Manuell" targetRef="B" />
         <bpmn:sequenceFlow id="f3" sourceRef="B" targetRef="C" />`,
      ),
    );
    expect(m!.initialStatuses).toEqual(['neu']);
    expect(statusIssues(m!)).toEqual([]);
  });

  it('meldet einen Status am Startereignis als Fehler', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', 'Neu')}
         <bpmn:startEvent id="S"><bpmn:dataOutputAssociation id="S_out"><bpmn:targetRef>R1</bpmn:targetRef></bpmn:dataOutputAssociation></bpmn:startEvent>`,
      ),
    );
    expect(m!.changes).toEqual([]);
    expect(statusIssues(m!)).toEqual([expect.objectContaining({ code: 'start-event-state', severity: 'error', elementId: 'S' })]);
  });

  it('warnt bei einem Status, den die Statustabelle nicht kennt', async () => {
    const [m] = await deriveStatusModels(
      model(`<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', 'in_review')}${ref('R2', 'Gibt es nicht')}`),
      { states },
    );
    expect(statusIssues(m!)).toEqual([
      expect.objectContaining({ code: 'unknown-state', severity: 'warning', elementId: 'R2', params: { state: 'gibt_es_nicht' } }),
    ]);
  });

  it('findet den Status in der Tabelle auch über seinen Namen', async () => {
    const [m] = await deriveStatusModels(
      model(`<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', 'In Prüfung')}`),
      { states },
    );
    expect(m!.statuses).toEqual(['in_review']);
    expect(statusIssues(m!)).toEqual([]);
  });

  it('liefert alternative Status, wenn eine Aktivität mehrere Outputs hat', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', 'Freigegeben')}${ref('R2', 'Abgelehnt')}
         ${task('Pruefen', [], ['R1', 'R2'])}`,
      ),
    );
    expect(m!.changes).toEqual([
      expect.objectContaining({ elementId: 'Pruefen', outputs: ['freigegeben', 'abgelehnt'] }),
    ]);
    expect(statusIssues(m!)).toEqual([]);
  });

  it('nimmt den Status aus der Beschriftung, wenn der dataState fehlt', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', undefined, 'Prozess [Offen]')}${ref('R2', 'Erledigt')}
         ${task('A', ['R1'], ['R2'])}`,
      ),
    );
    expect(m!.statuses).toEqual(['offen', 'erledigt']);
    expect(statusIssues(m!)).toContainEqual(
      expect.objectContaining({ code: 'state-only-in-label', severity: 'warning', elementId: 'R1' }),
    );
  });

  it('warnt, wenn Beschriftung und dataState sich widersprechen', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', 'Offen', 'Prozess [Neu]')}${ref('R2', 'Erledigt')}
         ${task('A', ['R1'], ['R2'])}`,
      ),
    );
    expect(m!.statuses).toEqual(['offen', 'erledigt']);
    expect(statusIssues(m!)).toContainEqual(expect.objectContaining({ code: 'label-state-mismatch', elementId: 'R1' }));
  });

  it('nimmt den Schlüssel aus bestadd:key und bleibt beim Umbenennen stabil', async () => {
    const keyed = (id: string, name: string, key: string) =>
      `<bpmn:dataObjectReference id="${id}" name="Prozess" dataObjectRef="Vorgang"><bpmn:dataState id="${id}_s" name="${name}" bestadd:key="${key}" /></bpmn:dataObjectReference>`;
    const xml = model(`<bpmn:dataObject id="Vorgang" name="Prozess" />${keyed('R1', 'Wird geprüft', 'in_review')}${task('A', [], ['R1'])}`)
      .replace('<bpmn:definitions ', '<bpmn:definitions xmlns:bestadd="urn:bestadd:schema:1.0" ');
    const [m] = await deriveStatusModels(xml);
    expect(m!.statuses).toEqual(['in_review']);
    expect(m!.statusNames).toEqual({ in_review: 'Wird geprüft' });
    expect(m!.language).toBe('en');
  });

  it('warnt, wenn ein Schlüssel für verschiedene Namen steht', async () => {
    const keyed = (id: string, name: string) =>
      `<bpmn:dataObjectReference id="${id}" name="Prozess" dataObjectRef="Vorgang"><bpmn:dataState id="${id}_s" name="${name}" bestadd:key="done" /></bpmn:dataObjectReference>`;
    const xml = model(`<bpmn:dataObject id="Vorgang" name="Prozess" />${keyed('R1', 'Erledigt')}${keyed('R2', 'Fertig')}${task('A', [], ['R1', 'R2'])}`)
      .replace('<bpmn:definitions ', '<bpmn:definitions xmlns:bestadd="urn:bestadd:schema:1.0" ');
    const [m] = await deriveStatusModels(xml);
    expect(statusIssues(m!)).toEqual([
      expect.objectContaining({ code: 'state-key-conflict', elementId: 'R2', params: { key: 'done', state: 'Fertig', other: 'Erledigt' } }),
    ]);
  });

  it('berücksichtigt Schritte in Unterprozessen', async () => {
    const [m] = await deriveStatusModels(
      model(
        `<bpmn:dataObject id="Vorgang" name="Prozess" />${ref('R1', 'Offen')}${ref('R2', 'Erledigt')}
         <bpmn:subProcess id="Sub">${task('Innen', ['R1'], ['R2'])}</bpmn:subProcess>`,
      ),
    );
    expect(m!.changes.map((c) => c.elementId)).toEqual(['Innen']);
    expect(m!.statuses).toEqual(['offen', 'erledigt']);
  });
});

describe('Kollaboration mit mehreren Pools', () => {
  /** Zwei Pools: Service-Desk startet und schickt eine Nachricht an den Fachbereich. */
  const collaboration = (messageTarget: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:collaboration id="C" name="Antrag bearbeiten">
    <bpmn:participant id="PoolA" name="Service-Desk" processRef="A" />
    <bpmn:participant id="PoolB" name="Fachbereich" processRef="B" />
    <bpmn:participant id="Kunde" name="Kunde" />
    <bpmn:messageFlow id="M1" sourceRef="Send" targetRef="${messageTarget}" />
  </bpmn:collaboration>
  <bpmn:process id="A">
    <bpmn:startEvent id="StartA" />
    <bpmn:sequenceFlow id="a1" sourceRef="StartA" targetRef="Send" />
    <bpmn:sendTask id="Send" />
  </bpmn:process>
  <bpmn:process id="B">
    <bpmn:dataObject id="Vorgang" name="Prozess" />
    <bpmn:startEvent id="StartB"><bpmn:messageEventDefinition /></bpmn:startEvent>
    <bpmn:sequenceFlow id="b1" sourceRef="StartB" targetRef="Check" />
    ${task('Check', [], ['RefB'])}
    ${ref('RefB', 'in_review')}
  </bpmn:process>
</bpmn:definitions>`;

  it('liefert einen Vorgang für die ganze Kollaboration', async () => {
    const models = await deriveStatusModels(collaboration('StartB'), { states });
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ processId: 'C', processName: 'Antrag bearbeiten', processIds: ['A', 'B'] });
    expect(models[0]!.statuses).toEqual(['in_review']);
  });

  it('folgt dem Nachrichtenfluss zum Anfangsstatus; das ausgelöste Startereignis ist kein eigener Anfang', async () => {
    const [m] = await deriveStatusModels(collaboration('StartB'), { states });
    expect(m!.initialStatuses).toEqual(['in_review']);
  });

  it('folgt auch einem Nachrichtenfluss, der am Pool endet', async () => {
    const [m] = await deriveStatusModels(collaboration('PoolB'), { states });
    expect(m!.initialStatuses).toEqual(['in_review']);
  });

  it('erlaubt je Pool ein Datenobjekt „Prozess“', async () => {
    const xml = collaboration('StartB').replace(
      '<bpmn:startEvent id="StartA" />',
      '<bpmn:dataObject id="VorgangA" name="Prozess" /><bpmn:startEvent id="StartA" />',
    );
    const [m] = await deriveStatusModels(xml, { states });
    expect(m!.issues.filter((i) => i.code === 'multiple-process-objects')).toEqual([]);
  });
});
