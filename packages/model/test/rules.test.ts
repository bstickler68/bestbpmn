import { describe, expect, it } from 'vitest';
import {
  deriveStatusModels,
  disabledRulesOf,
  filterIssues,
  ISSUE_CODES,
  matchRuleProfile,
  type ModelIssue,
} from '../src/index.js';

/** Ein Prozess, wie er aus bpmn.io kommt: Lane ohne Rolle, Benutzeraufgabe außerhalb der Lane ohne D. */
const plain = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:laneSet id="LS"><bpmn:lane id="L" name="Einkauf"><bpmn:flowNodeRef>T</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="L2"><bpmn:flowNodeRef>U</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:userTask id="T" name="Bestellen" />
    <bpmn:userTask id="U" name="Prüfen" />
  </bpmn:process>
</bpmn:definitions>`;

describe('Regelprofile', () => {
  it('meldet im Profil „Vollständig“ fehlendes D und Lane ohne Rolle', async () => {
    const [m] = await deriveStatusModels(plain, {}, { disabledRules: disabledRulesOf('complete') });
    expect([...new Set(m!.issues.map((i) => i.code))].sort()).toEqual([
      'lane-without-role',
      'raci-missing-responsible',
      'task-without-service',
    ]);
  });

  it('meldet im Profil „Dokumentieren“ nichts für ein reines bpmn.io-Diagramm', async () => {
    const [m] = await deriveStatusModels(plain, {}, { disabledRules: disabledRulesOf('document') });
    expect(m!.issues).toEqual([]);
  });

  it('schaltet einzelne Regeln ab', () => {
    const issues: ModelIssue[] = [
      { code: 'lane-without-role', severity: 'error', params: {} },
      { code: 'unknown-state', severity: 'warning', params: {} },
    ];
    expect(filterIssues(issues, ['unknown-state']).map((i) => i.code)).toEqual(['lane-without-role']);
    expect(filterIssues(issues, undefined)).toBe(issues);
  });

  it('erkennt das Profil zu einer Auswahl', () => {
    expect(matchRuleProfile(['lane-without-role', 'multi-instance-single-responsible', 'raci-missing-responsible', 'task-without-service'])).toBe('document');
    expect(matchRuleProfile([])).toBe('complete');
    expect(matchRuleProfile(['unknown-state'])).toBeUndefined();
  });

  it('kennt alle 15 Regeln', () => {
    expect(new Set(ISSUE_CODES).size).toBe(15);
  });
});

const services = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" id="D" targetNamespace="t">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:userTask id="U1" name="Erfassen" />
    <bpmn:userTask id="U2" name="Freigeben">
      <bpmn:extensionElements><bestadd:attributes><bestadd:attribute key="services"><bestadd:serviceRef ref="crm" name="CRM" /></bestadd:attribute></bestadd:attributes></bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:serviceTask id="S1" name="Buchen" />
    <bpmn:task id="T1" name="Ablegen" />
    <bpmn:manualTask id="M1" name="Unterschreiben" />
    <bpmn:subProcess id="SP" name="Versand"><bpmn:serviceTask id="S2" name="Mail senden" /></bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>`;

describe('Prüfregel IT-Service', () => {
  const serviceIssues = async (disabledRules: ReturnType<typeof disabledRulesOf>) => {
    const [m] = await deriveStatusModels(services, {}, { disabledRules });
    return m!.issues.filter((i) => i.code === 'task-without-service').map((i) => i.elementId);
  };

  it('verlangt im Profil „Vollständig“ einen IT-Service an Benutzer- und Serviceaufgaben', async () => {
    expect((await serviceIssues(disabledRulesOf('complete'))).sort()).toEqual(['S1', 'S2', 'U1']);
  });

  it('meldet einen fehlenden IT-Service nur als Warnung', async () => {
    const [m] = await deriveStatusModels(services, {}, { disabledRules: disabledRulesOf('complete') });
    const severities = m!.issues.filter((i) => i.code === 'task-without-service').map((i) => i.severity);
    expect(severities.length).toBeGreaterThan(0);
    expect(new Set(severities)).toEqual(new Set(['warning']));
  });

  it('ist im Profil „Dokumentieren“ abgeschaltet', async () => {
    expect(await serviceIssues(disabledRulesOf('document'))).toEqual([]);
  });
});
