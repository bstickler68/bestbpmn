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
    expect([...new Set(m!.issues.map((i) => i.code))].sort()).toEqual(['lane-without-role', 'raci-missing-responsible']);
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
    expect(matchRuleProfile(['lane-without-role', 'raci-missing-responsible'])).toBe('document');
    expect(matchRuleProfile([])).toBe('complete');
    expect(matchRuleProfile(['unknown-state'])).toBeUndefined();
  });

  it('kennt alle 13 Regeln', () => {
    expect(new Set(ISSUE_CODES).size).toBe(13);
  });
});
