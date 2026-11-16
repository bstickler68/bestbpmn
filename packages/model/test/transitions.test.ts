import { describe, expect, it } from 'vitest';
import {
  choiceCondition,
  choicesForTask,
  createModdle,
  deriveElementTables,
  deriveStatusModels,
  disabledRulesOf,
  gatewayDeciders,
  parseChoiceCondition,
  parseResultCondition,
  readRuleMarks,
  resultCondition,
  type IssueCode,
} from '../src/index.js';

const NEW_CODES: IssueCode[] = [
  'flow-without-condition',
  'conditional-flows-without-default',
  'unknown-result-condition',
  'either-or-at-task',
  'result-condition-at-task',
  'unknown-rule-kind',
  'rule-kind-not-allowed',
  'script-task-with-script',
  'choice-without-name',
  'choice-not-after-user-task',
  'choice-mixed',
  'unknown-choice-condition',
];

const head = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bestadd="urn:bestadd:schema:1.0" id="D" targetNamespace="t">`;
/** Meldungen der neuen Regeln; ohne Angabe im Profil „Vollständig“. */
const issues = async (xml: string, profile: 'complete' | 'document' = 'complete') =>
  (await deriveStatusModels(xml, {}, { disabledRules: disabledRulesOf(profile) })).flatMap((m) =>
    m.issues.filter((i) => NEW_CODES.includes(i.code)).map((i) => [i.code, i.elementId, i.severity]),
  );
const cond = (body: string) => `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${body}</bpmn:conditionExpression>`;

/** Prüfen mit zwei Ergebnissen, danach ein Gateway mit den Wegen J und N. */
const review = (flows: string, gatewayAttrs = '') => `${head}
  <bpmn:process id="P">
    <bpmn:dataObject id="Prozess" name="Prozess" />
    <bpmn:dataObjectReference id="Ok" name="Prozess [reviewed]" dataObjectRef="Prozess"><bpmn:dataState id="S1" name="reviewed" /></bpmn:dataObjectReference>
    <bpmn:dataObjectReference id="Nok" name="Prozess [rejected]" dataObjectRef="Prozess"><bpmn:dataState id="S2" name="rejected" /></bpmn:dataObjectReference>
    <bpmn:startEvent id="Start" />
    <bpmn:manualTask id="Pruefen">
      <bpmn:dataOutputAssociation id="O1"><bpmn:targetRef>Ok</bpmn:targetRef></bpmn:dataOutputAssociation>
      <bpmn:dataOutputAssociation id="O2"><bpmn:targetRef>Nok</bpmn:targetRef></bpmn:dataOutputAssociation>
    </bpmn:manualTask>
    <bpmn:exclusiveGateway id="G"${gatewayAttrs} />
    <bpmn:manualTask id="A" /><bpmn:manualTask id="B" />
    <bpmn:sequenceFlow id="F0" sourceRef="Start" targetRef="Pruefen" />
    <bpmn:sequenceFlow id="F1" sourceRef="Pruefen" targetRef="G" />
    ${flows}
  </bpmn:process></bpmn:definitions>`;

describe('Bedingungen an Sequenzflüssen', () => {
  it('schreibt die Bedingung auf ein Ergebnis neutral und liest auch ältere Schreibweisen', () => {
    expect(resultCondition('approved')).toBe("${result == 'approved'}");
    expect(parseResultCondition(' ${ result == "approved" } ')).toBe('approved');
    expect(parseResultCondition("${praxiqResult == 'approved'}")).toBe('approved');
    expect(parseResultCondition('${betrag > 10000}')).toBeUndefined();
    expect(parseResultCondition("${result == 'a\"}")).toBeUndefined();
    expect(parseResultCondition("${myresult == 'a'}")).toBeUndefined();
  });

  it('verlangt im Profil „Vollständig“ nach einem Gateway an jedem Weg außer dem Standardfluss eine Bedingung', async () => {
    const flows = `<bpmn:sequenceFlow id="J" sourceRef="G" targetRef="A" />
      <bpmn:sequenceFlow id="N" sourceRef="G" targetRef="B" />`;
    expect(await issues(review(flows))).toEqual([
      ['flow-without-condition', 'J', 'error'],
      ['flow-without-condition', 'N', 'error'],
    ]);
    // Diagramme zur Dokumentation dürfen „ja/nein“ ohne Bedingung zeigen.
    expect(await issues(review(flows), 'document')).toEqual([]);
  });

  it('akzeptiert Ergebnisse der Aufgabe davor und einen Standardfluss', async () => {
    const flows = `<bpmn:sequenceFlow id="J" sourceRef="G" targetRef="A">${cond("${result == 'reviewed'}")}</bpmn:sequenceFlow>
      <bpmn:sequenceFlow id="N" sourceRef="G" targetRef="B" />`;
    expect(await issues(review(flows, ' default="N"'))).toEqual([]);
  });

  it('meldet Ergebnisse, die die Aufgabe davor nicht setzen kann, in beiden Profilen', async () => {
    const flows = `<bpmn:sequenceFlow id="J" sourceRef="G" targetRef="A">${cond("${praxiqResult == 'approved'}")}</bpmn:sequenceFlow>
      <bpmn:sequenceFlow id="N" sourceRef="G" targetRef="B">${cond('${betrag > 10000}')}</bpmn:sequenceFlow>`;
    expect(await issues(review(flows))).toEqual([['unknown-result-condition', 'J', 'error']]);
    expect(await issues(review(flows), 'document')).toEqual([['unknown-result-condition', 'J', 'error']]);
  });

  it('findet die Ergebnisse auch über mehrere Gateways hinweg', async () => {
    const flows = `<bpmn:exclusiveGateway id="G2" />
      <bpmn:sequenceFlow id="J" sourceRef="G" targetRef="G2" />
      <bpmn:sequenceFlow id="K" sourceRef="G2" targetRef="A">${cond("${result == 'rejected'}")}</bpmn:sequenceFlow>
      <bpmn:sequenceFlow id="Back" sourceRef="G2" targetRef="G">${cond("${result == 'reviewed'}")}</bpmn:sequenceFlow>`;
    expect(await issues(review(flows), 'document')).toEqual([]);
  });

  it('warnt bei einer Aufgabe mit nur bedingten Wegen ohne Standardfluss', async () => {
    const xml = `${head}<bpmn:process id="P">
      <bpmn:startEvent id="Start" /><bpmn:manualTask id="T" /><bpmn:manualTask id="A" /><bpmn:manualTask id="B" />
      <bpmn:sequenceFlow id="F0" sourceRef="Start" targetRef="T" />
      <bpmn:sequenceFlow id="X" sourceRef="T" targetRef="A">${cond('${betrag > 10000}')}</bpmn:sequenceFlow>
      <bpmn:sequenceFlow id="Y" sourceRef="T" targetRef="B">${cond('${betrag &lt;= 10000}')}</bpmn:sequenceFlow>
    </bpmn:process></bpmn:definitions>`;
    expect(await issues(xml)).toEqual([['conditional-flows-without-default', 'T', 'warning']]);
    expect(await issues(xml, 'document')).toEqual([]);
    // Mit Standardfluss ist es ein Entweder-oder, und das gehört in ein Gateway.
    expect(await issues(xml.replace('<bpmn:manualTask id="T" />', '<bpmn:manualTask id="T" default="Y" />'))).toEqual([
      ['either-or-at-task', 'T', 'warning'],
    ]);
  });

  it('erlaubt an einer Aufgabe einen zusätzlichen bedingten Weg neben dem normalen, aber nicht nach dem Ergebnis', async () => {
    const xml = (body: string) => `${head}<bpmn:process id="P">
      <bpmn:dataObject id="Prozess" name="Prozess" />
      <bpmn:dataObjectReference id="Ok" name="Prozess [reviewed]" dataObjectRef="Prozess"><bpmn:dataState id="S1" name="reviewed" /></bpmn:dataObjectReference>
      <bpmn:startEvent id="Start" />
      <bpmn:manualTask id="T"><bpmn:dataOutputAssociation id="O1"><bpmn:targetRef>Ok</bpmn:targetRef></bpmn:dataOutputAssociation></bpmn:manualTask>
      <bpmn:manualTask id="A" /><bpmn:manualTask id="B" />
      <bpmn:sequenceFlow id="F0" sourceRef="Start" targetRef="T" />
      <bpmn:sequenceFlow id="Normal" sourceRef="T" targetRef="A" />
      <bpmn:sequenceFlow id="Extra" sourceRef="T" targetRef="B">${cond(body)}</bpmn:sequenceFlow>
    </bpmn:process></bpmn:definitions>`;
    expect(await issues(xml('${betrag > 10000}'))).toEqual([]);
    expect(await issues(xml("${result == 'reviewed'}"))).toEqual([['result-condition-at-task', 'Extra', 'warning']]);
  });

  it('erkennt am Gateway, ob eine Person oder das System entscheidet', async () => {
    const flows = `<bpmn:sequenceFlow id="J" sourceRef="G" targetRef="A">${cond("${result == 'reviewed'}")}</bpmn:sequenceFlow>
      <bpmn:sequenceFlow id="N" sourceRef="G" targetRef="B">${cond('${betrag > 10000}')}</bpmn:sequenceFlow>`;
    const { rootElement } = await createModdle().fromXML(review(flows));
    const elements = (rootElement as any).rootElements[0].flowElements;
    const gateway = elements.find((e: any) => e.id === 'G');
    expect(gatewayDeciders(gateway, elements)).toEqual({ person: true, system: true, choice: false });
    expect(gatewayDeciders(gateway, elements.filter((e: any) => e.id !== 'N'))).toEqual({ person: true, system: false, choice: false });
  });
});

describe('Regel-Kennzeichen an Aktivitäten', () => {
  const rules = (kinds: string, text = '') => `<bpmn:extensionElements><bestadd:rules kinds="${kinds}">${text}</bestadd:rules></bpmn:extensionElements>`;

  it('liest Kennzeichen und Beschreibung', async () => {
    const { rootElement } = await createModdle().fromXML(
      `${head}<bpmn:process id="P"><bpmn:userTask id="U">${rules('follow_action condition', 'Vier-Augen-Prinzip')}</bpmn:userTask></bpmn:process></bpmn:definitions>`,
    );
    const task = (rootElement as any).rootElements[0].flowElements[0];
    expect(readRuleMarks(task)).toEqual({ kinds: ['condition', 'follow_action'], unknownKinds: [], description: 'Vier-Augen-Prinzip' });
  });

  it('erlaubt an Aufgaben ohne Person nur Aktionen und meldet unbekannte Kennzeichen', async () => {
    const xml = `${head}<bpmn:process id="P">
      <bpmn:manualTask id="M">${rules('condition validator screen start_action follow_action')}</bpmn:manualTask>
      <bpmn:scriptTask id="S">${rules('screen start_action')}</bpmn:scriptTask>
      <bpmn:manualTask id="X">${rules('magic')}</bpmn:manualTask>
    </bpmn:process></bpmn:definitions>`;
    expect(await issues(xml, 'document')).toEqual([
      ['rule-kind-not-allowed', 'S', 'error'],
      ['unknown-rule-kind', 'X', 'error'],
    ]);
  });

  it('nimmt Kennzeichen und Beschreibung in die Elementtabelle auf', async () => {
    const { rootElement } = await createModdle().fromXML(
      `${head}<bpmn:process id="P"><bpmn:userTask id="U" name="Freigeben">${rules('condition', 'Vier-Augen-Prinzip')}</bpmn:userTask><bpmn:userTask id="V" /></bpmn:process></bpmn:definitions>`,
    );
    const [table] = deriveElementTables(rootElement as any);
    expect(table!.rows.find((r) => r.id === 'U')?.rules).toEqual({ kinds: ['condition'], description: 'Vier-Augen-Prinzip' });
    expect(table!.rows.find((r) => r.id === 'V')).not.toHaveProperty('rules');
  });

  it('lehnt Skripttext in Skriptaufgaben ab', async () => {
    const xml = `${head}<bpmn:process id="P">
      <bpmn:scriptTask id="S" scriptFormat="groovy"><bpmn:script>println 1</bpmn:script></bpmn:scriptTask>
      <bpmn:scriptTask id="Leer" />
    </bpmn:process></bpmn:definitions>`;
    expect(await issues(xml, 'document')).toEqual([['script-task-with-script', 'S', 'error']]);
  });

  it('schreibt Kennzeichen und Beschreibung ins XML und behält unbekannte Kennzeichen', async () => {
    const moddle = createModdle();
    const marks = moddle.create('bestadd:Rules', { kinds: 'validator screen magic', description: 'Begründung bei Ablehnung' });
    const task = moddle.create('bpmn:UserTask', { id: 'U', extensionElements: moddle.create('bpmn:ExtensionElements', { values: [marks] }) });
    const process = moddle.create('bpmn:Process', { id: 'P', flowElements: [task] });
    const definitions = moddle.create('bpmn:Definitions', { id: 'D', targetNamespace: 't', rootElements: [process] });
    const { xml } = await moddle.toXML(definitions);
    expect(xml).toContain('<bestadd:rules kinds="validator screen magic">Begründung bei Ablehnung</bestadd:rules>');
  });
});

describe('Wahl des Bearbeiters am Gateway', () => {
  /** Eine Benutzeraufgabe ohne Ergebnis, danach ein exklusives Gateway mit den Wegen J und N. */
  const choose = (flows: string, outputs = '', task = 'userTask') => `${head}
    <bpmn:process id="P" isExecutable="true">
      <bpmn:dataObject id="Prozess" name="Prozess" />
      <bpmn:dataObjectReference id="Ok" name="Prozess [reviewed]" dataObjectRef="Prozess"><bpmn:dataState id="S1" name="reviewed" /></bpmn:dataObjectReference>
      <bpmn:dataObjectReference id="Nok" name="Prozess [rejected]" dataObjectRef="Prozess"><bpmn:dataState id="S2" name="rejected" /></bpmn:dataObjectReference>
      <bpmn:startEvent id="Start" />
      <bpmn:${task} id="T" name="Weiter?">${outputs}</bpmn:${task}>
      <bpmn:exclusiveGateway id="G" />
      <bpmn:userTask id="A" />
      <bpmn:userTask id="B" />
      <bpmn:sequenceFlow id="F0" sourceRef="Start" targetRef="T" />
      <bpmn:sequenceFlow id="F1" sourceRef="T" targetRef="G" />
      ${flows}
    </bpmn:process></bpmn:definitions>`;
  const choice = (id: string, name: string, target: string, body = `\${choice == '${id}'}`) =>
    `<bpmn:sequenceFlow id="${id}" name="${name}" sourceRef="G" targetRef="${target}">${cond(body)}</bpmn:sequenceFlow>`;

  it('schreibt neutral choice und liest auch praxiqChoice', () => {
    expect(choiceCondition('Flow_1')).toBe("${choice == 'Flow_1'}");
    expect(parseChoiceCondition(' ${ choice == "Flow_1" } ')).toBe('Flow_1');
    expect(parseChoiceCondition("${praxiqChoice == 'Flow_1'}")).toBe('Flow_1');
    expect(parseChoiceCondition("${result == 'x'}")).toBeUndefined();
    expect(parseResultCondition("${choice == 'x'}")).toBeUndefined();
  });

  it('akzeptiert eine Wahl ohne Status und ohne Feldbedingung und liefert die Namen der Wege', async () => {
    const xml = choose(choice('J', 'Weiter', 'A') + choice('N', 'Zurück an Ersteller', 'B'));
    expect(await issues(xml)).toEqual([]);
    const { rootElement } = await createModdle().fromXML(xml);
    const elements = (rootElement as any).rootElements[0].flowElements;
    const task = elements.find((e: any) => e.id === 'T');
    expect(choicesForTask(task, elements)).toEqual([
      { flowId: 'J', name: 'Weiter' },
      { flowId: 'N', name: 'Zurück an Ersteller' },
    ]);
    expect(gatewayDeciders(elements.find((e: any) => e.id === 'G'), elements)).toEqual({ person: false, system: false, choice: true });
  });

  it('verlangt Namen, die eigene ID und eine Benutzeraufgabe davor, auch im Profil „Dokumentieren“', async () => {
    expect(await issues(choose(choice('J', '', 'A') + choice('N', 'Nein', 'B', "\${choice == 'J'}")), 'document')).toEqual([
      ['choice-without-name', 'J', 'error'],
      ['unknown-choice-condition', 'N', 'error'],
    ]);
    expect((await issues(choose(choice('J', 'Ja', 'A') + choice('N', 'Nein', 'B'), '', 'manualTask'))).map((i) => i[0])).toEqual([
      'choice-not-after-user-task',
      'choice-not-after-user-task',
    ]);
  });

  it('lehnt eine Wahl neben Ergebnissen oder Feldbedingungen ab', async () => {
    const outputs = `<bpmn:dataOutputAssociation id="O1"><bpmn:targetRef>Ok</bpmn:targetRef></bpmn:dataOutputAssociation>
      <bpmn:dataOutputAssociation id="O2"><bpmn:targetRef>Nok</bpmn:targetRef></bpmn:dataOutputAssociation>`;
    expect(await issues(choose(choice('J', 'Ja', 'A') + choice('N', 'Nein', 'B'), outputs))).toEqual([['choice-mixed', 'G', 'error']]);
    const mixed = choice('J', 'Ja', 'A') + `<bpmn:sequenceFlow id="N" name="Nein" sourceRef="G" targetRef="B">${cond('${betrag > 10}')}</bpmn:sequenceFlow>`;
    expect(await issues(choose(mixed))).toEqual([['choice-mixed', 'G', 'error']]);
  });
});

describe('Text in der Auswahl an einem Ergebnis', () => {
  it('liest den eigenen Text eines Ergebnisses mit Übersetzung', async () => {
    const xml = `${head}<bpmn:process id="P">
      <bpmn:dataObject id="Prozess" name="Prozess" />
      <bpmn:dataObjectReference id="Ok" name="Prozess [reviewed]" dataObjectRef="Prozess"><bpmn:dataState id="S1" name="reviewed" /></bpmn:dataObjectReference>
      <bpmn:dataObjectReference id="Nok" name="Prozess [rejected]" dataObjectRef="Prozess"><bpmn:dataState id="S2" name="rejected" /></bpmn:dataObjectReference>
      <bpmn:userTask id="T">
        <bpmn:dataOutputAssociation id="O1"><bpmn:targetRef>Ok</bpmn:targetRef></bpmn:dataOutputAssociation>
        <bpmn:dataOutputAssociation id="O2" bestadd:resultLabel="Zurückweisen">
          <bpmn:extensionElements><bestadd:translations><bestadd:translation lang="en" name="Send back" /></bestadd:translations></bpmn:extensionElements>
          <bpmn:targetRef>Nok</bpmn:targetRef>
        </bpmn:dataOutputAssociation>
      </bpmn:userTask>
    </bpmn:process></bpmn:definitions>`;
    const [model] = await deriveStatusModels(xml);
    const change = model!.changes.find((c) => c.elementId === 'T')!;
    expect(change.outputs).toEqual(['reviewed', 'rejected']);
    expect(change.outputLabels).toEqual({ rejected: { label: 'Zurückweisen', translations: { en: 'Send back' } } });
  });
});
