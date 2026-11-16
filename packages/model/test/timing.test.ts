import { describe, expect, it } from 'vitest';
import { createModdle, deriveStatusModels, describeTimeSpan, formatTimeSpan, parseTimeInput, parseTimeSpan, readTiming } from '../src/index.js';

const head = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" xmlns:raci="urn:bestadd:raci:1.0" id="D" targetNamespace="t">`;

/** Aufgabe A, danach ein Entweder-oder-Gateway G mit den Wegen J und N. */
const model = (task = '', yes = '', no = '') => `${head}
  <bpmn:process id="P">
    <bpmn:startEvent id="Start" />
    <bpmn:manualTask id="A" name="Prüfen">${task}</bpmn:manualTask>
    <bpmn:exclusiveGateway id="G" />
    <bpmn:manualTask id="B" /><bpmn:manualTask id="C" />
    <bpmn:sequenceFlow id="F0" sourceRef="Start" targetRef="A" />
    <bpmn:sequenceFlow id="F1" sourceRef="A" targetRef="G" />
    <bpmn:sequenceFlow id="J" sourceRef="G" targetRef="B"${yes} />
    <bpmn:sequenceFlow id="N" sourceRef="G" targetRef="C"${no} />
  </bpmn:process></bpmn:definitions>`;
const PLANNING_CODES = ['invalid-planning-value', 'gateway-without-probabilities', 'probabilities-not-100', 'boundary-without-probability', 'accountable-without-effort'];
/** Nur die Hinweise zu Planwerten; die übrigen Regeln haben eigene Tests. */
const issues = async (xml: string, planningValues = true) =>
  (await deriveStatusModels(xml, { planningValues }))
    .flatMap((m) => m.issues.filter((i) => PLANNING_CODES.includes(i.code)).map((i) => [i.code, i.elementId, i.severity]));

describe('Dauern', () => {
  it('liest ISO-8601 und schreibt es wieder', () => {
    expect(parseTimeSpan('PT1H30M')).toEqual({ days: 0, minutes: 90 });
    expect(parseTimeSpan('P2DT4H')).toEqual({ days: 2, minutes: 240 });
    expect(parseTimeSpan('P1W')).toBeUndefined();
    expect(parseTimeSpan('PT')).toBeUndefined();
    expect(formatTimeSpan({ days: 0, minutes: 90 })).toBe('PT1H30M');
    expect(formatTimeSpan({ days: 1.5, minutes: 0 })).toBe('P1.5D');
    expect(formatTimeSpan({ days: 0, minutes: 0 })).toBe('PT0M');
  });

  it('versteht Eingaben wie 30, 1,5h, 1h30m und 2d', () => {
    expect(parseTimeInput('30')).toEqual({ days: 0, minutes: 30 });
    expect(parseTimeInput('1,5h')).toEqual({ days: 0, minutes: 90 });
    expect(parseTimeInput('1 h 30 min')).toEqual({ days: 0, minutes: 90 });
    expect(parseTimeInput('2d')).toEqual({ days: 2, minutes: 0 });
    expect(parseTimeInput('2 AT 4 h')).toEqual({ days: 2, minutes: 240 });
    expect(parseTimeInput('PT45M')).toEqual({ days: 0, minutes: 45 });
    expect(parseTimeInput('bald')).toBeUndefined();
    expect(describeTimeSpan({ days: 2, minutes: 90 })).toBe('2 AT 1 h 30 min');
  });
});

describe('Planwerte im Modell', () => {
  it('liest Aufwand von D, E und M, Dauer und Instanzen', async () => {
    const xml = model(
      `<bpmn:extensionElements><bestadd:timing effort="PT30M" accountableEffort="PT5M" duration="P1D" instances="3">
         <bestadd:consultedEffort assignee="role(clerk)" effort="PT10M" />
       </bestadd:timing></bpmn:extensionElements>`,
    );
    const { rootElement } = await createModdle().fromXML(xml);
    const task = (rootElement as any).rootElements[0].flowElements.find((e: any) => e.id === 'A');
    expect(readTiming(task)).toEqual({
      effort: { days: 0, minutes: 30 },
      accountableEffort: { days: 0, minutes: 5 },
      duration: { days: 1, minutes: 0 },
      instances: 3,
      consultedEfforts: [{ assignee: 'role(clerk)', effort: { days: 0, minutes: 10 } }],
      invalid: {},
    });
  });

  it('meldet nichts, solange das Modell keine Planwerte nutzt', async () => {
    expect(await issues(model())).toEqual([]);
  });

  it('meldet nichts, solange die Planwerte ausgeschaltet sind', async () => {
    expect(await issues(model('', ' bestadd:probability="70"'), false)).toEqual([]);
  });

  it('meldet fehlende Wahrscheinlichkeiten und eine Summe ungleich 100 % als Hinweis', async () => {
    expect(await issues(model('', ' bestadd:probability="70"'))).toEqual([['gateway-without-probabilities', 'G', 'warning']]);
    expect(await issues(model('', ' bestadd:probability="70"', ' bestadd:probability="20"'))).toEqual([['probabilities-not-100', 'G', 'warning']]);
    expect(await issues(model('', ' bestadd:probability="70"', ' bestadd:probability="30"'))).toEqual([]);
    expect(await issues(model('', ' bestadd:probability="viel"', ' bestadd:probability="30"'))).toEqual([['invalid-planning-value', 'J', 'warning']]);
  });

  it('erinnert an den Aufwand des E, sobald der des D eingetragen ist', async () => {
    const raci = '<raci:accountable><raci:role ref="lead" /></raci:accountable>';
    expect(await issues(model(`<bpmn:extensionElements>${raci}<bestadd:timing effort="PT30M" /></bpmn:extensionElements>`))).toContainEqual([
      'accountable-without-effort',
      'A',
      'warning',
    ]);
    expect(
      await issues(model(`<bpmn:extensionElements>${raci}<bestadd:timing effort="PT30M" accountableEffort="PT0M" /></bpmn:extensionElements>`)),
    ).not.toContainEqual(['accountable-without-effort', 'A', 'warning']);
  });
});
