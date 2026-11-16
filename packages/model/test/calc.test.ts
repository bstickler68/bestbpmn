import { describe, expect, it } from 'vitest';
import { calculateDefinitions, createModdle, deriveStatusModels, type ProcessCalculation } from '../src/index.js';

const head = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" xmlns:raci="urn:bestadd:raci:1.0" id="D" targetNamespace="t">`;

const owner = (assignee: string) =>
  `<bpmn:potentialOwner><bpmn:resourceAssignmentExpression><bpmn:formalExpression>${assignee}</bpmn:formalExpression></bpmn:resourceAssignmentExpression></bpmn:potentialOwner>`;
const timing = (attrs: string, children = '') => `<bpmn:extensionElements><bestadd:timing ${attrs}>${children}</bestadd:timing></bpmn:extensionElements>`;
const flow = (id: string, from: string, to: string, probability?: number) =>
  `<bpmn:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}"${probability === undefined ? '' : ` bestadd:probability="${probability}"`} />`;

async function calc(body: string, runs = 4000, extra = ''): Promise<ProcessCalculation> {
  const { rootElement } = await createModdle().fromXML(`${head}<bpmn:process id="P">${body}</bpmn:process>${extra}</bpmn:definitions>`);
  return calculateDefinitions(rootElement, { runs, minutesPerDay: 480 })[0]!;
}
const visits = (r: ProcessCalculation, id: string) => r.elements.find((e) => e.elementId === id)?.visits;
const holder = (r: ProcessCalculation, h: string | null) => r.effortByHolder.find((e) => e.holder === h)?.minutes;

describe('Rechnung aus den Planwerten', () => {
  it('rechnet Schleifen über das Gleichungssystem: 20 % Rückfrage ergibt 1,25 Ausführungen', async () => {
    const r = await calc(`
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="A">${timing('effort="PT30M" duration="PT1H"')}${owner('role(clerk)')}</bpmn:userTask>
      <bpmn:exclusiveGateway id="G" />
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'G')}${flow('Back', 'G', 'A', 20)}${flow('Ok', 'G', 'E', 80)}`);
    expect(visits(r, 'A')).toBe(1.25);
    expect(r.effort).toBe(37.5);
    expect(r.effortByHolder).toEqual([{ holder: 'role(clerk)', minutes: 37.5 }]);
    expect(r.complete).toBe(true);
    expect(r.cycleTime!.mean).toBeGreaterThan(72);
    expect(r.cycleTime!.mean).toBeLessThan(78);
    expect(r.cycleTime!.median).toBe(60);
    expect(r.cycleTime!.p95).toBeGreaterThanOrEqual(120);
    expect(r.criticalPath).toEqual(['A']);
  });

  it('rechnet ein Szenario mit überschriebenen Werten, ohne das Modell zu ändern', async () => {
    const xml = `${head}<bpmn:process id="P">
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="A">${timing('effort="PT30M" duration="PT1H"')}${owner('role(clerk)')}</bpmn:userTask>
      <bpmn:exclusiveGateway id="G" />
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'G')}${flow('Back', 'G', 'A', 20)}${flow('Ok', 'G', 'E', 80)}</bpmn:process></bpmn:definitions>`;
    const { rootElement } = await createModdle().fromXML(xml);
    const [r] = calculateDefinitions(rootElement, {
      runs: 0,
      overrides: { probabilities: { Back: 50, Ok: 50 }, timing: { A: { effort: { days: 0, minutes: 10 } } } },
    });
    expect(visits(r!, 'A')).toBe(2);
    expect(r!.effort).toBe(20);
    // Das Modell selbst bleibt unverändert.
    expect(calculateDefinitions(rootElement, { runs: 0 })[0]!.effort).toBe(37.5);
  });

  it('nimmt bei parallelen Zweigen den längsten als kritischen Pfad', async () => {
    const r = await calc(`
      <bpmn:startEvent id="S" />
      <bpmn:parallelGateway id="Split" />
      <bpmn:userTask id="B">${timing('effort="PT20M" duration="PT2H"')}${owner('role(a)')}</bpmn:userTask>
      <bpmn:userTask id="C">${timing('effort="PT10M" duration="PT1H"')}${owner('role(b)')}</bpmn:userTask>
      <bpmn:parallelGateway id="Join" />
      <bpmn:userTask id="Z">${timing('effort="PT5M" duration="P1D"')}${owner('role(a)')}</bpmn:userTask>
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'Split')}${flow('F2', 'Split', 'B')}${flow('F3', 'Split', 'C')}${flow('F4', 'B', 'Join')}${flow('F5', 'C', 'Join')}${flow('F6', 'Join', 'Z')}${flow('F7', 'Z', 'E')}`);
    expect(visits(r, 'Z')).toBe(1);
    expect(r.cycleTime).toEqual({ mean: 600, median: 600, p85: 600, p95: 600 });
    expect(r.criticalPath).toEqual(['B', 'Z']);
    expect(holder(r, 'role(a)')).toBe(25);
    expect(holder(r, 'role(b)')).toBe(10);
  });

  it('zählt ein zusammenführendes Oder-Gateway einmal, wenn mindestens ein Weg genommen wurde', async () => {
    const r = await calc(`
      <bpmn:startEvent id="S" />
      <bpmn:inclusiveGateway id="Split" />
      <bpmn:manualTask id="B">${timing('effort="PT10M" duration="PT10M"')}</bpmn:manualTask>
      <bpmn:manualTask id="C">${timing('effort="PT10M" duration="PT10M"')}</bpmn:manualTask>
      <bpmn:inclusiveGateway id="Join" />
      <bpmn:manualTask id="Z">${timing('effort="PT10M" duration="PT10M"')}</bpmn:manualTask>
      ${flow('F1', 'S', 'Split')}${flow('F2', 'Split', 'B', 50)}${flow('F3', 'Split', 'C', 50)}${flow('F4', 'B', 'Join')}${flow('F5', 'C', 'Join')}${flow('F6', 'Join', 'Z')}`);
    expect(visits(r, 'B')).toBe(0.5);
    expect(visits(r, 'Z')).toBe(0.75);
    // Ohne D steht der Aufwand bei „ohne Zuständigkeit“.
    expect(r.effortByHolder).toEqual([{ holder: null, minutes: 17.5 }]);
  });

  it('nimmt dem normalen Weg den Anteil eines unterbrechenden Grenzereignisses weg', async () => {
    const r = await calc(`
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="A">${timing('effort="PT10M" duration="PT1H"')}${owner('role(a)')}</bpmn:userTask>
      <bpmn:boundaryEvent id="Esc" attachedToRef="A"><bpmn:timerEventDefinition /></bpmn:boundaryEvent>
      <bpmn:userTask id="X">${timing('effort="PT30M" duration="PT30M"')}${owner('role(lead)')}</bpmn:userTask>
      <bpmn:userTask id="B">${timing('effort="PT10M" duration="PT10M"')}${owner('role(a)')}</bpmn:userTask>
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'B')}${flow('F3', 'Esc', 'X', 10)}`);
    expect(visits(r, 'B')).toBe(0.9);
    expect(visits(r, 'X')).toBe(0.1);
    expect(holder(r, 'role(lead)')).toBe(3);
    expect(holder(r, 'role(a)')).toBe(19);
  });

  it('meldet bei der Prüfung ein Grenzereignis ohne Wahrscheinlichkeit, wenn das Modell Planwerte nutzt', async () => {
    const xml = (p = '') => `${head}<bpmn:process id="P"><bpmn:startEvent id="S" />
      <bpmn:manualTask id="A">${timing('effort="PT10M"')}</bpmn:manualTask>
      <bpmn:boundaryEvent id="Esc" attachedToRef="A"><bpmn:timerEventDefinition /></bpmn:boundaryEvent><bpmn:endEvent id="X" />
      ${flow('F1', 'S', 'A')}<bpmn:sequenceFlow id="F2" sourceRef="Esc" targetRef="X"${p} /></bpmn:process></bpmn:definitions>`;
    const codes = async (text: string) => (await deriveStatusModels(text, { planningValues: true })).flatMap((m) => m.issues.map((i) => [i.code, i.elementId]));
    expect(await codes(xml())).toContainEqual(['boundary-without-probability', 'Esc']);
    expect(await codes(xml(' bestadd:probability="5"'))).not.toContainEqual(['boundary-without-probability', 'Esc']);
  });

  it('rechnet E und M mit, D aus der Lane, und listet fehlende Angaben', async () => {
    const r = await calc(`
      <bpmn:laneSet id="LS"><bpmn:lane id="L" raci:assignee="role(clerk)"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="A"><bpmn:extensionElements>
        <bestadd:timing effort="PT1H" accountableEffort="PT15M" duration="P1D"><bestadd:consultedEffort assignee="role(expert)" effort="PT20M" /></bestadd:timing>
        <raci:accountable><raci:role ref="head" /></raci:accountable><raci:consulted><raci:role ref="expert" /><raci:role ref="other" /></raci:consulted></bpmn:extensionElements></bpmn:userTask>
      <bpmn:exclusiveGateway id="G" />
      <bpmn:userTask id="B"><bpmn:extensionElements><raci:accountable><raci:role ref="head" /></raci:accountable></bpmn:extensionElements></bpmn:userTask>
      <bpmn:endEvent id="E" />
      ${flow('F1', 'S', 'A')}${flow('F2', 'A', 'G')}${flow('F3', 'G', 'B', 40)}${flow('F4', 'G', 'E')}${flow('F5', 'B', 'E')}`);
    expect(r.missing).toEqual([
      { code: 'effort', elementId: 'B' },
      { code: 'accountable-effort', elementId: 'B' },
      { code: 'probability', elementId: 'G' },
    ]);
    expect(r.complete).toBe(false);
    // Der fehlende Wert bekommt den Rest auf 100 %.
    expect(visits(r, 'B')).toBe(0.4);
    expect(r.effortByHolder).toEqual([
      { holder: 'role(clerk)', minutes: 60 },
      { holder: 'role(expert)', minutes: 20 },
      { holder: 'role(head)', minutes: 15 },
    ]);
    expect(r.cycleTime!.median).toBe(480);
  });

  it('rechnet Teilprozesse, Aufrufaktivitäten und Mehrfachinstanzen ein', async () => {
    const called = `<bpmn:process id="Q"><bpmn:startEvent id="QS" /><bpmn:userTask id="QA">${timing('effort="PT10M" duration="PT20M"')}${owner('role(q)')}</bpmn:userTask>${flow('QF', 'QS', 'QA')}</bpmn:process>`;
    const r = await calc(
      `
      <bpmn:startEvent id="S" />
      <bpmn:subProcess id="Sub">
        <bpmn:startEvent id="SS" />
        <bpmn:userTask id="SA">${timing('effort="PT15M" duration="PT30M"')}${owner('role(a)')}</bpmn:userTask>
        ${flow('SF', 'SS', 'SA')}
      </bpmn:subProcess>
      <bpmn:callActivity id="Call" calledElement="Q" />
      <bpmn:userTask id="M">${timing('effort="PT5M" duration="PT10M"')}${owner('role(x), role(y), role(z)')}<bpmn:multiInstanceLoopCharacteristics isSequential="true" /></bpmn:userTask>
      ${flow('F1', 'S', 'Sub')}${flow('F2', 'Sub', 'Call')}${flow('F3', 'Call', 'M')}`,
      200,
      called,
    );
    expect(visits(r, 'SA')).toBe(1);
    expect(holder(r, 'role(a)')).toBe(15);
    expect(holder(r, 'role(q)')).toBe(10);
    expect(holder(r, 'role(x)')).toBe(5);
    expect(r.effort).toBe(40);
    expect(r.cycleTime!.mean).toBe(30 + 20 + 30);
    expect(r.missing).toEqual([]);
  });

  it('meldet einen fehlenden aufgerufenen Prozess und eine Schleife ohne Ausgang', async () => {
    const r = await calc(
      `<bpmn:startEvent id="S" /><bpmn:callActivity id="Call" calledElement="Nope" />
       <bpmn:manualTask id="A">${timing('effort="PT1M" duration="PT1M"')}</bpmn:manualTask>
       ${flow('F1', 'S', 'Call')}${flow('F2', 'Call', 'A')}${flow('F3', 'A', 'A')}`,
      10,
    );
    expect(r.missing.map((m) => [m.code, m.elementId])).toEqual([
      ['called-process', 'Call'],
      ['endless-loop', 'P'],
    ]);
    expect(r.cycleTime).toBeUndefined();
  });
});
