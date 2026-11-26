import { describe, expect, it } from 'vitest';
import { calculateStaffing, checkAnnualOccurrence, DEFAULT_HOURS_PER_FTE, hoursPerFte, createModdle, deriveStatusModels, readAnnualOccurrence } from '../src/index.js';

const head = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" xmlns:raci="urn:bestadd:raci:1.0" id="D" targetNamespace="t">`;

const owner = (assignee: string) =>
  `<bpmn:potentialOwner><bpmn:resourceAssignmentExpression><bpmn:formalExpression>${assignee}</bpmn:formalExpression></bpmn:resourceAssignmentExpression></bpmn:potentialOwner>`;
const timing = (attrs: string) => `<bpmn:extensionElements><bestadd:timing ${attrs} /></bpmn:extensionElements>`;
const flow = (id: string, from: string, to: string, probability?: number) =>
  `<bpmn:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}"${probability === undefined ? '' : ` bestadd:probability="${probability}"`} />`;

async function load(xml: string) {
  return (await createModdle().fromXML(`${head}${xml}</bpmn:definitions>`)).rootElement;
}

const simple = (occurrence: string) => `<bpmn:process id="P" name="Antrag bearbeiten" bestadd:annualOccurrence="${occurrence}">
  <bpmn:startEvent id="S" />
  <bpmn:userTask id="A" name="Prüfen">${timing('effort="PT30M"')}${owner('role(clerk)')}</bpmn:userTask>
  <bpmn:userTask id="B" name="Freigeben">${timing('effort="PT1H" accountableEffort="PT15M"')}${owner('role(lead)')}</bpmn:userTask>
  <bpmn:userTask id="C" name="Ablegen">${timing('effort="PT10M"')}${owner('role(clerk)')}</bpmn:userTask>
  <bpmn:endEvent id="E" />
  ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'B')}${flow('F3', 'B', 'C')}${flow('F4', 'C', 'E')}
</bpmn:process>`;

describe('Personalbedarf je Durchführungsverantwortung', () => {
  it('multipliziert den Aufwand des D mit dem jährlichen Vorkommen und teilt durch 1694 h', async () => {
    const report = calculateStaffing(await load(simple('1200')));
    expect(report.hoursPerFte).toBe(1694);
    expect(report.processes).toEqual([{ processId: 'P', name: 'Antrag bearbeiten', annualOccurrence: 1200, hours: 2000, fte: 1.18 }]);
    const clerk = report.holders.find((h) => h.holder === 'role(clerk)')!;
    // (30 + 10) min × 1200 = 800 h; 800 / 1694 = 0,4722…
    expect(clerk.hours).toBe(800);
    expect(clerk.fte).toBe(0.47);
    expect(clerk.tasks.map((t) => [t.elementId, t.effortPerExecution, t.executionsPerYear, t.hours, t.fte])).toEqual([
      ['A', 30, 1200, 600, 0.35],
      ['C', 10, 1200, 200, 0.12],
    ]);
    // Nur der Aufwand des D zählt, nicht der des E.
    const lead = report.holders.find((h) => h.holder === 'role(lead)')!;
    expect(lead.hours).toBe(1200);
    expect(lead.fte).toBe(0.71);
    // Größter Bedarf zuerst.
    expect(report.holders.map((h) => h.holder)).toEqual(['role(lead)', 'role(clerk)']);
    expect(report.hours).toBe(2000);
    // Summe aus ungerundeten Werten: 2000 / 1694 = 1,1806…
    expect(report.fte).toBe(1.18);
  });

  it('nimmt eine andere Jahresarbeitszeit, wenn sie eingestellt ist', async () => {
    const report = calculateStaffing(await load(simple('1200')), { hoursPerFte: 1600 });
    expect(report.hoursPerFte).toBe(1600);
    expect(report.fte).toBe(1.25);
  });

  it('zählt Wege und Schleifen mit ihrer Wahrscheinlichkeit', async () => {
    const xml = `<bpmn:process id="P" bestadd:annualOccurrence="100">
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="A">${timing('effort="PT1H"')}${owner('role(clerk)')}</bpmn:userTask>
      <bpmn:exclusiveGateway id="G" />
      <bpmn:userTask id="X">${timing('effort="PT30M"')}${owner('role(lead)')}</bpmn:userTask>
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'G')}${flow('Back', 'G', 'A', 20)}${flow('Rare', 'G', 'X', 10)}${flow('Ok', 'G', 'E', 70)}${flow('F3', 'X', 'E')}
    </bpmn:process>`;
    const report = calculateStaffing(await load(xml));
    const clerk = report.holders.find((h) => h.holder === 'role(clerk)')!;
    // 1 / 0,8 = 1,25 Ausführungen je Durchlauf.
    expect(clerk.tasks[0]!.executionsPerYear).toBe(125);
    expect(clerk.hours).toBe(125);
    const lead = report.holders.find((h) => h.holder === 'role(lead)')!;
    expect(lead.tasks[0]!.executionsPerYear).toBe(12.5);
    expect(lead.hours).toBe(6.25);
  });

  it('teilt den Aufwand bei mehreren D und zählt Teilprozesse und aufgerufene Prozesse mit', async () => {
    const xml = `<bpmn:process id="P" bestadd:annualOccurrence="10">
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="A">${timing('effort="PT2H"')}${owner('role(clerk), role(lead)')}</bpmn:userTask>
      <bpmn:subProcess id="Sub">
        <bpmn:startEvent id="SS" />
        <bpmn:userTask id="Inner">${timing('effort="PT6M"')}${owner('role(clerk)')}</bpmn:userTask>
        <bpmn:endEvent id="SE" />
        ${flow('S1', 'SS', 'Inner')}${flow('S2', 'Inner', 'SE')}
      </bpmn:subProcess>
      <bpmn:callActivity id="Call" calledElement="Q" />
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'Sub')}${flow('F3', 'Sub', 'Call')}${flow('F4', 'Call', 'E')}
    </bpmn:process>
    <bpmn:process id="Q">
      <bpmn:startEvent id="QS" />
      <bpmn:userTask id="Called">${timing('effort="PT12M"')}${owner('role(other)')}</bpmn:userTask>
      <bpmn:endEvent id="QE" />
      ${flow('Q1', 'QS', 'Called')}${flow('Q2', 'Called', 'QE')}
    </bpmn:process>`;
    const report = calculateStaffing(await load(xml));
    const of = (holder: string) => report.holders.find((h) => h.holder === holder)!;
    expect(of('role(lead)').hours).toBe(10);
    expect(of('role(clerk)').tasks.map((t) => [t.elementId, t.path, t.hours])).toEqual([
      ['A', undefined, 10],
      ['Inner', 'Sub/Inner', 1],
    ]);
    expect(of('role(other)').tasks.map((t) => [t.elementId, t.path, t.hours])).toEqual([['Called', 'Call/Called', 2]]);
    // Der aufgerufene Prozess hat kein eigenes Vorkommen und zählt nur über den Aufruf.
    expect(report.processes.find((p) => p.processId === 'Q')).toEqual({ processId: 'Q', hours: 0, fte: 0 });
    expect(report.hours).toBe(23);
  });

  it('lässt Prozesse ohne Vorkommen weg und meldet Aufgaben ohne Aufwand des D', async () => {
    const xml = `<bpmn:process id="P">
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="A">${timing('effort="PT1H"')}${owner('role(clerk)')}</bpmn:userTask>
      <bpmn:endEvent id="E" />${flow('F1', 'S', 'A')}${flow('F2', 'A', 'E')}
    </bpmn:process>`;
    expect(calculateStaffing(await load(xml)).holders).toEqual([]);
    const withMissing = `<bpmn:process id="P" bestadd:annualOccurrence="12">
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="A" name="Ohne Aufwand">${owner('role(clerk)')}</bpmn:userTask>
      <bpmn:userTask id="B">${timing('effort="PT1H"')}</bpmn:userTask>
      <bpmn:endEvent id="E" />${flow('F1', 'S', 'A')}${flow('F2', 'A', 'B')}${flow('F3', 'B', 'E')}
    </bpmn:process>`;
    const report = calculateStaffing(await load(withMissing));
    expect(report.missingEffort.map((m) => m.elementId)).toEqual(['A']);
    // Aufgaben ohne D stehen in einer eigenen Gruppe.
    expect(report.holders).toEqual([{ holder: null, hours: 12, fte: 0.01, tasks: [expect.objectContaining({ elementId: 'B', hours: 12 })] }]);
  });

  it('liest das Vorkommen mit Komma und meldet unlesbare Werte', async () => {
    const definitions = await load(simple('0,5'));
    const process = (definitions as any).rootElements[0];
    expect(readAnnualOccurrence(process)).toBe(0.5);
    expect(checkAnnualOccurrence(process)).toEqual([]);
    process.annualOccurrence = 'oft';
    expect(readAnnualOccurrence(process)).toBeNaN();
    expect(checkAnnualOccurrence(process)).toEqual([
      expect.objectContaining({ code: 'invalid-planning-value', elementId: 'P', params: expect.objectContaining({ attribute: 'annualOccurrence', value: 'oft' }) }),
    ]);
    process.annualOccurrence = '0';
    expect(readAnnualOccurrence(process)).toBeNaN();
    const report = calculateStaffing(definitions);
    expect(report.processes[0]).toMatchObject({ processId: 'P', invalidOccurrence: true });
    expect(report.holders).toEqual([]);
  });

  it('meldet ein unlesbares Vorkommen in der Modellprüfung, nur bei Planwerten', async () => {
    const xml = `${head}${simple('viele')}</bpmn:definitions>`;
    const issues = (await deriveStatusModels(xml, { planningValues: true })).flatMap((m) => m.issues);
    expect(issues.some((i) => i.code === 'invalid-planning-value' && i.params?.attribute === 'annualOccurrence')).toBe(true);
    const off = (await deriveStatusModels(xml, { planningValues: false })).flatMap((m) => m.issues);
    expect(off.some((i) => i.params?.attribute === 'annualOccurrence')).toBe(false);
  });

  it('schreibt das Vorkommen als Attribut am Prozess zurück', async () => {
    const definitions = await load(simple('250'));
    const { xml } = await createModdle().toXML(definitions);
    expect(xml).toContain('bestadd:annualOccurrence="250"');
  });

  it('rechnet die Jahresarbeitszeit aus Wochenarbeitszeit und Arbeitstagen, aufgerundet auf ganze Stunden', () => {
    expect(hoursPerFte(38.5, 220, 5)).toBe(1694);
    expect(DEFAULT_HOURS_PER_FTE).toBe(1694);
    // 40 × 225 ÷ 5 = 1800; 38,5 × 221 ÷ 5 = 1701,7 → 1702; 20 h an 4 Tagen, 220 Tage → 1100.
    expect(hoursPerFte(40, 225, 5)).toBe(1800);
    expect(hoursPerFte(38.5, 221, 5)).toBe(1702);
    expect(hoursPerFte(20, 220, 4)).toBe(1100);
    expect(() => hoursPerFte(38.5, 0, 5)).toThrow(RangeError);
  });
});
