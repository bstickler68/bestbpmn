import { describe, expect, it } from 'vitest';
import { analyzeValueDefinitions, createModdle, deriveStatusModels, type ValueAnalysis } from '../src/index.js';

const head = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" xmlns:raci="urn:bestadd:raci:1.0" id="D" targetNamespace="t">`;

const timing = (attrs: string) => `<bpmn:extensionElements><bestadd:timing ${attrs} /></bpmn:extensionElements>`;
const task = (id: string, attrs: string) => `<bpmn:userTask id="${id}" name="${id}">${timing(attrs)}</bpmn:userTask>`;
const flow = (id: string, from: string, to: string, probability?: number) =>
  `<bpmn:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}"${probability === undefined ? '' : ` bestadd:probability="${probability}"`} />`;

async function analyze(body: string): Promise<ValueAnalysis> {
  const { rootElement } = await createModdle().fromXML(`${head}<bpmn:process id="P">${body}</bpmn:process></bpmn:definitions>`);
  return analyzeValueDefinitions(rootElement, { minutesPerDay: 480 })[0]!;
}
const ids = (a: ValueAnalysis) => a.paths.map((p) => p.steps.map((s) => s.elementId).join(','));

describe('Wertschöpfungsanalyse', () => {
  it('rechnet Anteile, Durchlaufzeit und Flussrate auf einem einfachen Weg', async () => {
    const a = await analyze(`
      <bpmn:startEvent id="S" />
      ${task('A', 'effort="PT30M" duration="PT2H" valueClass="value_adding"')}
      ${task('B', 'effort="PT20M" accountableEffort="PT10M" duration="PT1H" valueClass="supporting"')}
      ${task('C', 'effort="PT60M" valueClass="non_value_adding"')}
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'B')}${flow('F3', 'B', 'C')}${flow('F4', 'C', 'E')}`);
    expect(a.paths).toHaveLength(1);
    const [p] = a.paths;
    expect(p!.probability).toBe(100);
    expect(p!.count).toEqual({ value_adding: 1, supporting: 1, non_value_adding: 1, unrated: 0 });
    expect(p!.countShare.value_adding).toBe(33.33);
    // Bearbeitungszeit = D + E: 30 + 30 + 60 = 120 Minuten.
    expect(p!.processingTotal).toBe(120);
    expect(p!.processingShare).toEqual({ value_adding: 25, supporting: 25, non_value_adding: 50, unrated: 0 });
    // Durchlaufzeit = 120 + 60 + 60 (C ohne Dauer hat keine Liegezeit).
    expect(p!.cycleTime).toBe(240);
    expect(p!.waiting).toBe(120);
    expect(p!.flowRate).toBe(50);
    expect(a.unrated).toEqual([]);
    expect(a.coverage).toBe(100);
  });

  it('zeigt jeden Weg durch ein Entweder-oder-Gateway mit seiner Wahrscheinlichkeit und einen gewichteten Mittelwert', async () => {
    const a = await analyze(`
      <bpmn:startEvent id="S" />
      ${task('A', 'effort="PT60M" valueClass="value_adding"')}
      <bpmn:exclusiveGateway id="G" />
      ${task('B', 'effort="PT60M" duration="PT3H" valueClass="non_value_adding"')}
      <bpmn:exclusiveGateway id="J" />
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'G')}${flow('Yes', 'G', 'B', 25)}${flow('No', 'G', 'J', 75)}${flow('F3', 'B', 'J')}${flow('F4', 'J', 'E')}`);
    expect(ids(a)).toEqual(['A', 'A,B']);
    expect(a.paths.map((p) => p.probability)).toEqual([75, 25]);
    expect(a.paths[1]!.cycleTime).toBe(240);
    expect(a.paths[1]!.flowRate).toBe(50);
    // Mittel: Durchlaufzeit 0,75 · 60 + 0,25 · 240 = 105; Bearbeitung 0,75 · 60 + 0,25 · 120 = 75.
    expect(a.mean!.cycleTime).toBe(105);
    expect(a.mean!.criticalProcessing).toBe(75);
    expect(a.mean!.processingShare.value_adding).toBe(80);
  });

  it('zählt eine Schleife einmal ohne und einmal mit einer Wiederholung', async () => {
    const a = await analyze(`
      <bpmn:startEvent id="S" />
      ${task('A', 'effort="PT30M" valueClass="value_adding"')}
      ${task('Check', 'effort="PT10M" valueClass="supporting"')}
      <bpmn:exclusiveGateway id="G" />
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'Check')}${flow('F3', 'Check', 'G')}${flow('Back', 'G', 'A', 20)}${flow('Ok', 'G', 'E', 80)}`);
    expect(ids(a)).toEqual(['A,Check', 'A,Check,A,Check']);
    expect(a.paths[1]!.count.value_adding).toBe(2);
    expect(a.paths[1]!.probability).toBe(16);
    // Der dritte Durchlauf fehlt: 80 % + 16 % = 96 %.
    expect(a.coverage).toBe(96);
  });

  it('rechnet Durchlaufzeit und Flussrate entlang des längsten parallelen Zweigs, Anteile über alle Aufgaben', async () => {
    const a = await analyze(`
      <bpmn:startEvent id="S" />
      <bpmn:parallelGateway id="Split" />
      ${task('Long', 'effort="PT60M" duration="PT4H" valueClass="value_adding"')}
      ${task('Short', 'effort="PT30M" duration="PT1H" valueClass="supporting"')}
      <bpmn:parallelGateway id="Join" />
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'Split')}${flow('F2', 'Split', 'Long')}${flow('F3', 'Split', 'Short')}${flow('F4', 'Long', 'Join')}${flow('F5', 'Short', 'Join')}${flow('F6', 'Join', 'E')}`);
    expect(a.paths).toHaveLength(1);
    const [p] = a.paths;
    expect(p!.count.value_adding + p!.count.supporting).toBe(2);
    expect(p!.processingTotal).toBe(90);
    expect(p!.cycleTime).toBe(240);
    expect(p!.criticalProcessing).toBe(60);
    expect(p!.flowRate).toBe(25);
  });

  it('zählt die Wartezeit an Zwischenereignissen als Liegezeit und meldet nicht bewertete Aufgaben', async () => {
    const a = await analyze(`
      <bpmn:startEvent id="S" />
      ${task('A', 'effort="PT60M"')}
      <bpmn:intermediateCatchEvent id="W">${timing('duration="P1D"')}<bpmn:messageEventDefinition /></bpmn:intermediateCatchEvent>
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'W')}${flow('F3', 'W', 'E')}`);
    const [p] = a.paths;
    expect(p!.cycleTime).toBe(540);
    expect(p!.waiting).toBe(480);
    expect(p!.count.unrated).toBe(1);
    expect(a.unrated).toEqual(['A']);
  });

  it('nimmt die Aufgaben eines Teilprozesses in den Weg auf', async () => {
    const a = await analyze(`
      <bpmn:startEvent id="S" />
      <bpmn:subProcess id="Sub">
        <bpmn:startEvent id="SS" />
        <bpmn:exclusiveGateway id="SG" />
        ${task('X', 'effort="PT10M" valueClass="value_adding"')}
        ${task('Y', 'effort="PT20M" valueClass="non_value_adding"')}
        <bpmn:endEvent id="SE1" /><bpmn:endEvent id="SE2" />
        ${flow('S1', 'SS', 'SG')}${flow('S2', 'SG', 'X', 50)}${flow('S3', 'SG', 'Y', 50)}${flow('S4', 'X', 'SE1')}${flow('S5', 'Y', 'SE2')}
      </bpmn:subProcess>
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'Sub')}${flow('F2', 'Sub', 'E')}`);
    expect(ids(a).sort()).toEqual(['X', 'Y']);
    expect(a.paths.map((p) => p.probability)).toEqual([50, 50]);
  });

  it('warnt bei unbewerteten Aufgaben erst, wenn das Modell Bewertungen nutzt', async () => {
    const codes = async (attrs: string) => {
      const xml = `${head}<bpmn:process id="P" isExecutable="false">
        <bpmn:startEvent id="S" />${task('A', attrs)}${task('B', 'effort="PT5M"')}<bpmn:endEvent id="E" />
        ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'B')}${flow('F3', 'B', 'E')}</bpmn:process></bpmn:definitions>`;
      return (await deriveStatusModels(xml, { planningValues: true })).flatMap((m) => m.issues.map((i) => [i.code, i.elementId]));
    };
    expect(await codes('effort="PT5M"')).not.toContainEqual(['task-without-value-class', 'B']);
    expect(await codes('effort="PT5M" valueClass="value_adding"')).toContainEqual(['task-without-value-class', 'B']);
    expect(await codes('valueClass="wichtig"')).toContainEqual(['invalid-planning-value', 'A']);
  });
});
