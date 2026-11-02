import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  combineRaciMatrices,
  createModdle,
  deriveRaciMatrices,
  deriveStatusModels,
  formatAssignees,
  parseAssignees,
  readRaci,
} from '../src/index.js';

const template = readFileSync(
  new URL('../../../templates/processes/dokumentenfreigabe.bpmn', import.meta.url),
  'utf8',
);

describe('RACI-Schreibweise', () => {
  it('liest und schreibt alle Arten von Zuordnungen', () => {
    const text =
      'user(mmeier), group(Autoren), field(autor), initiator(), performerOf(Erstellen), notPerformerOf(Erstellen), orgRole(Leitung, autor)';
    const { assignees, invalid } = parseAssignees(text);
    expect(invalid).toEqual([]);
    expect(assignees).toHaveLength(7);
    expect(assignees[6]).toEqual({ kind: 'orgRole', ref: 'Leitung', of: 'autor' });
    expect(formatAssignees(assignees)).toBe(text);
  });

  it('meldet nicht lesbare Teile, statt sie stillschweigend zu verwerfen', () => {
    expect(parseAssignees('group(Autoren), Autoren, foo(x), initiator(x)')).toEqual({
      assignees: [{ kind: 'group', ref: 'Autoren' }],
      invalid: ['Autoren', 'foo(x)', 'initiator(x)'],
    });
    expect(parseAssignees('')).toEqual({ assignees: [], invalid: [] });
  });
});

describe('RACI im Modell', () => {
  it('liest R aus potentialOwner und A, C, I aus dem raci-Namensraum', async () => {
    const { elementsById } = await createModdle().fromXML(template);
    expect(readRaci(elementsById['Pruefen']!)).toEqual({
      responsible: [{ kind: 'group', ref: 'reviewers' }],
      accountable: [{ kind: 'group', ref: 'quality_management' }],
      consulted: [{ kind: 'field', ref: 'autor' }],
      informed: [],
    });
    expect(readRaci(elementsById['Freigeben']!).informed).toEqual([{ kind: 'initiator' }]);
  });

  it('leitet die RACI-Matrix der Vorlage ab', async () => {
    const { rootElement } = await createModdle().fromXML(template);
    const [matrix] = deriveRaciMatrices(rootElement);
    expect(matrix!.columns).toEqual(['group(authors)', 'group(quality_management)', 'group(reviewers)', 'field(autor)', 'initiator()']);
    expect(matrix!.rows.map((r) => [r.elementId, r.cells])).toEqual([
      ['Erstellen', { 'group(authors)': ['responsible'], 'group(quality_management)': ['informed'] }],
      ['Pruefen', { 'group(reviewers)': ['responsible'], 'group(quality_management)': ['accountable'], 'field(autor)': ['consulted'] }],
      ['Freigeben', { 'group(quality_management)': ['responsible'], 'initiator()': ['informed'] }],
      ['Ueberarbeiten', { 'group(authors)': ['responsible'] }],
    ]);
  });
});

describe('RACI-Prüfregeln', () => {
  const head = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:raci="urn:bestadd:raci:1.0" id="D" targetNamespace="t">`;
  const owner = (text: string) =>
    `<bpmn:potentialOwner><bpmn:resourceAssignmentExpression><bpmn:formalExpression>${text}</bpmn:formalExpression></bpmn:resourceAssignmentExpression></bpmn:potentialOwner>`;
  const codes = async (body: string, lanes = '') => {
    const { deriveStatusModels: derive } = await import('../src/index.js');
    // Die Regel für IT-Services hat eigene Tests.
    const deriveStatusModels = (...[xml, catalog, options]: Parameters<typeof derive>) =>
      derive(xml, catalog, { ...options, disabledRules: ['task-without-service', ...(options?.disabledRules ?? [])] });
    const [m] = await deriveStatusModels(
      `${head}<bpmn:process id="P"><bpmn:dataObject id="V" name="Prozess" />${lanes}${body}</bpmn:process></bpmn:definitions>`,
    );
    return m!.issues.map((i) => [i.code, i.elementId]);
  };

  it('verlangt genau ein D je Benutzeraufgabe', async () => {
    expect(await codes('<bpmn:userTask id="A" />')).toEqual([['raci-missing-responsible', 'A']]);
    expect(await codes(`<bpmn:userTask id="A">${owner('group(X), user(y)')}</bpmn:userTask>`)).toEqual([
      ['raci-multiple-responsible', 'A'],
    ]);
    expect(await codes(`<bpmn:userTask id="A">${owner('group(X), notPerformerOf(B)')}</bpmn:userTask>`)).toEqual([]);
    expect(await codes('<bpmn:serviceTask id="S" />')).toEqual([]);
  });

  it('nimmt D aus der Swimlane, die Lane geht der Aufgabe vor', async () => {
    const lanes = `<bpmn:laneSet id="LS"><bpmn:lane id="L" name="Autoren"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef>
      <bpmn:childLaneSet id="CLS"><bpmn:lane id="L2" name="field(autor)"><bpmn:flowNodeRef>C</bpmn:flowNodeRef></bpmn:lane></bpmn:childLaneSet></bpmn:lane></bpmn:laneSet>`;
    const body = `<bpmn:userTask id="A" /><bpmn:userTask id="B">${owner('user(chef), notPerformerOf(A)')}</bpmn:userTask><bpmn:userTask id="C" />`;
    // Lanes aus fremden Werkzeugen: D aus dem Namen, aber die innerste Lane ohne Rolle/Gruppe ist ein Fehler.
    expect(await codes(body, lanes)).toEqual([['lane-without-role', 'L2']]);

    const { rootElement } = await createModdle().fromXML(
      `${head}<bpmn:process id="P">${lanes}${body}</bpmn:process></bpmn:definitions>`,
    );
    const [matrix] = deriveRaciMatrices(rootElement);
    expect(matrix!.rows.map((r) => [r.elementId, formatAssignees(r.raci.responsible), r.responsibleFromLane])).toEqual([
      ['A', 'group(Autoren)', true],
      ['B', 'group(Autoren), notPerformerOf(A)', true],
      ['C', 'field(autor)', true],
    ]);
  });

  it('nimmt bei Lanes im Pool immer die Lane, den Pool nur ohne Lanes', async () => {
    const pool = `<bpmn:collaboration id="C1"><bpmn:participant id="Pool" name="Firma" processRef="P" raci:assignee="role(process_owner)" /></bpmn:collaboration>`;
    const withLanes = `${head}${pool}
      <bpmn:process id="P"><bpmn:laneSet id="LS">
        <bpmn:lane id="L" name="Service-Desk" raci:assignee="group(service_desk)"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane>
        <bpmn:lane id="L2"><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane>
      </bpmn:laneSet><bpmn:userTask id="A" /><bpmn:userTask id="B" /></bpmn:process></bpmn:definitions>`;
    const rows = async (xml: string) => {
      const { rootElement } = await createModdle().fromXML(xml);
      return deriveRaciMatrices(rootElement)[0]!.rows.map((r) => [r.elementId, formatAssignees(r.raci.responsible)]);
    };
    // B liegt in einer Lane ohne Zuordnung: kein D, auch nicht vom Pool.
    expect(await rows(withLanes)).toEqual([
      ['A', 'group(service_desk)'],
      ['B', ''],
    ]);
    const withoutLanes = `${head}${pool}<bpmn:process id="P"><bpmn:userTask id="A" /></bpmn:process></bpmn:definitions>`;
    expect(await rows(withoutLanes)).toEqual([['A', 'role(process_owner)']]);
  });

  it('meldet eine Lane ohne Rolle oder Gruppe als Fehler', async () => {
    const lanes = `<bpmn:laneSet id="LS">
      <bpmn:lane id="Ok" name="Service-Desk" raci:assignee="group(service_desk)"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Leer"><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>`;
    expect(await codes(`<bpmn:userTask id="A" /><bpmn:userTask id="B" />`, lanes)).toEqual([
      ['lane-without-role', 'Leer'],
      ['raci-missing-responsible', 'B'],
    ]);
  });

  it('erlaubt mehrere D an Multi-Instanz-Aufgaben', async () => {
    const mi = (parallel: boolean) =>
      `<bpmn:userTask id="A"><bpmn:multiInstanceLoopCharacteristics isSequential="${!parallel}" />${owner('group(X), role(Y)')}</bpmn:userTask>`;
    expect(await codes(mi(true))).toEqual([]);
    expect(await codes(mi(false))).toEqual([]);
    const lanes = `<bpmn:laneSet id="LS"><bpmn:lane id="L" name="Autoren"><bpmn:flowNodeRef>A</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>`;
    const { rootElement } = await createModdle().fromXML(`${head}<bpmn:process id="P">${lanes}${mi(true)}</bpmn:process></bpmn:definitions>`);
    expect(formatAssignees(deriveRaciMatrices(rootElement)[0]!.rows[0]!.raci.responsible)).toBe('group(X), role(Y)');
  });

  it('warnt bei Rollen und Gruppen, die die Tabelle nicht kennt', async () => {
    const { deriveStatusModels: derive } = await import('../src/index.js');
    // Die Regel für IT-Services hat eigene Tests.
    const deriveStatusModels = (...[xml, catalog, options]: Parameters<typeof derive>) =>
      derive(xml, catalog, { ...options, disabledRules: ['task-without-service', ...(options?.disabledRules ?? [])] });
    const [m] = await deriveStatusModels(
      `${head}<bpmn:process id="P"><bpmn:userTask id="A">${owner('group(gibts_nicht)')}</bpmn:userTask>
       <bpmn:userTask id="B">${owner('role(process_owner)')}</bpmn:userTask></bpmn:process></bpmn:definitions>`,
      { roles: [{ id: 'process_owner', name: 'Process owner', kind: 'role' }] },
    );
    expect(m!.issues).toEqual([
      expect.objectContaining({ code: 'raci-unknown-assignee', severity: 'warning', elementId: 'A', params: { element: 'A', assignee: 'group(gibts_nicht)' } }),
    ]);
  });

  it('erlaubt höchstens ein E, aber mehrere M und I', async () => {
    const task = (ext: string) => `<bpmn:userTask id="A"><bpmn:extensionElements>${ext}</bpmn:extensionElements>${owner('group(X)')}</bpmn:userTask>`;
    expect(
      await codes(task('<raci:accountable><raci:group ref="Q" /><raci:user ref="u" /></raci:accountable>')),
    ).toEqual([['raci-multiple-accountable', 'A']]);
    expect(
      await codes(
        task(
          '<raci:accountable><raci:group ref="Q" /></raci:accountable><raci:consulted><raci:group ref="a" /><raci:group ref="b" /></raci:consulted><raci:informed><raci:group ref="c" /><raci:group ref="d" /></raci:informed>',
        ),
      ),
    ).toEqual([]);
  });
});

describe('Pools ohne Swimlanes', () => {
  // Zwei Pools ohne Lanes: „Autoren“ nur mit Namen, der zweite mit Gruppe aus dem Panel.
  // „Prüfen“ hat zusätzlich ein M für die Autoren an der Aufgabe.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:raci="urn:bestadd:raci:1.0" id="D" targetNamespace="t">
  <bpmn:collaboration id="C">
    <bpmn:participant id="PoolA" name="Autoren" processRef="PA" />
    <bpmn:participant id="PoolB" name="Prüfteam" processRef="PB" raci:assignee="group(reviewers)" />
    <bpmn:participant id="PoolC" processRef="PC" />
  </bpmn:collaboration>
  <bpmn:process id="PA"><bpmn:userTask id="Schreiben" name="Schreiben" /></bpmn:process>
  <bpmn:process id="PB">
    <bpmn:userTask id="Pruefen" name="Prüfen">
      <bpmn:extensionElements><raci:consulted><raci:group ref="Autoren" /></raci:consulted></bpmn:extensionElements>
    </bpmn:userTask>
  </bpmn:process>
  <bpmn:process id="PC"><bpmn:task id="Ablegen" name="Ablegen" /></bpmn:process>
</bpmn:definitions>`;

  it('nimmt D aus dem Pool, auch nur aus seinem Namen, und bildet eine gemeinsame Tabelle', async () => {
    const { rootElement } = await createModdle().fromXML(xml);
    const matrix = combineRaciMatrices(deriveRaciMatrices(rootElement));
    expect(matrix.columns).toEqual(['group(Autoren)', 'group(reviewers)']);
    expect(matrix.rows.map((r) => [r.elementId, r.cells, r.responsibleFromLane])).toEqual([
      ['Schreiben', { 'group(Autoren)': ['responsible'] }, true],
      ['Pruefen', { 'group(reviewers)': ['responsible'], 'group(Autoren)': ['consulted'] }, true],
      ['Ablegen', {}, false],
    ]);
  });

  it('prüft einen Pool ohne Lanes wie eine Lane', async () => {
    const models = await deriveStatusModels(xml);
    const laneIssues = models.flatMap((m) => m.issues).filter((i) => i.code === 'lane-without-role');
    expect(laneIssues.map((i) => i.elementId).sort()).toEqual(['PoolA', 'PoolC']);
  });
});
