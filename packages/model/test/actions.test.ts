import { describe, expect, it } from 'vitest';
import { createModdle, deriveStatusModels, disabledRulesOf, readActions, readInternalActions } from '../src/index.js';

const head = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" id="D" targetNamespace="t">`;
const service = `<bpmn:extensionElements><bestadd:attributes><bestadd:attribute key="services"><bestadd:serviceRef ref="svc-dms" name="DMS" /></bestadd:attribute></bestadd:attributes></bpmn:extensionElements>`;
const action = (refs: string[]) =>
  `<bpmn:extensionElements><bestadd:attributes><bestadd:attribute key="services">${refs
    .map((r) => `<bestadd:serviceRef ref="svc-itsm" name="ITSM"><bestadd:actionRef ref="${r}" name="${r}" /></bestadd:serviceRef>`)
    .join('')}</bestadd:attribute></bestadd:attributes></bpmn:extensionElements>`;
const internal = (value: string) =>
  `<bpmn:extensionElements><bestadd:attributes><bestadd:attribute key="internalAction" value="${value}" /></bestadd:attributes></bpmn:extensionElements>`;
const CODES = ['service-task-without-action', 'multiple-actions', 'script-task-without-action', 'internal-action-not-on-script-task', 'multiple-none-start-events'];
const found = async (xml: string, profile: 'complete' | 'document') =>
  (await deriveStatusModels(xml, {}, { disabledRules: disabledRulesOf(profile) }))
    .flatMap((m) => m.issues)
    .filter((i) => CODES.includes(i.code))
    .map((i) => [i.code, i.elementId, i.severity]);

describe('Aktionen an Aufgaben', () => {
  const model = `${head}<bpmn:process id="P">
      <bpmn:serviceTask id="Ohne">${service}</bpmn:serviceTask>
      <bpmn:sendTask id="Senden">${action(['notify'])}</bpmn:sendTask>
      <bpmn:serviceTask id="Mit">${action(['create_issue'])}</bpmn:serviceTask>
      <bpmn:userTask id="Zwei">${action(['a', 'b'])}</bpmn:userTask>
      <bpmn:scriptTask id="Skript">${internal('create_record link_records')}</bpmn:scriptTask>
      <bpmn:scriptTask id="LeeresSkript" />
      <bpmn:userTask id="Intern">${internal('log_entry')}</bpmn:userTask>
    </bpmn:process></bpmn:definitions>`;

  it('verlangt im Profil „Vollständig“ eine Aktion an automatischen Aufgaben, höchstens eine je Aktivität', async () => {
    expect(await found(model, 'complete')).toEqual([
      ['service-task-without-action', 'Ohne', 'error'],
      ['multiple-actions', 'Zwei', 'error'],
      ['script-task-without-action', 'LeeresSkript', 'error'],
      ['internal-action-not-on-script-task', 'Intern', 'error'],
    ]);
  });

  it('verlangt im Profil „Dokumentieren“ keine Aktion, prüft aber, was im Modell steht', async () => {
    expect(await found(model, 'document')).toEqual([
      ['multiple-actions', 'Zwei', 'error'],
      ['internal-action-not-on-script-task', 'Intern', 'error'],
    ]);
  });

  it('liest Service, Aktion und interne Aktionen und behält sie beim Speichern', async () => {
    const moddle = createModdle();
    const { rootElement } = await moddle.fromXML(model);
    const elements = (rootElement as any).rootElements[0].flowElements;
    const byId = (id: string) => elements.find((el: any) => el.id === id);
    expect(readActions(byId('Mit'))).toEqual([{ service: 'svc-itsm', serviceName: 'ITSM', action: 'create_issue', actionName: 'create_issue' }]);
    expect(readInternalActions(byId('Skript'))).toEqual(['create_record', 'link_records']);
    const { xml } = await moddle.toXML(rootElement);
    expect(xml).toContain('<bestadd:actionRef ref="create_issue" name="create_issue" />');
  });
});

describe('Startereignisse ohne Auslöser', () => {
  const starts = `${head}<bpmn:process id="P">
      <bpmn:startEvent id="S1" name="Selbst" /><bpmn:startEvent id="S2" name="Anruf" />
      <bpmn:startEvent id="S3"><bpmn:messageEventDefinition /></bpmn:startEvent>
      <bpmn:subProcess id="Sub"><bpmn:startEvent id="SubStart" /></bpmn:subProcess>
    </bpmn:process></bpmn:definitions>`;

  it('meldet im Profil „Vollständig“ jedes weitere als Fehler, nicht in Teilprozessen', async () => {
    expect(await found(starts, 'complete')).toEqual([['multiple-none-start-events', 'S2', 'error']]);
  });

  it('erlaubt sie im Profil „Dokumentieren“', async () => {
    expect(await found(starts, 'document')).toEqual([]);
  });
});

describe('XML-Teile ohne eigene Oberfläche', () => {
  it('behält den Kalender eines Zeitgebers beim Speichern', async () => {
    const moddle = createModdle();
    const { rootElement } = await moddle.fromXML(`${head}<bpmn:process id="P">
      <bpmn:intermediateCatchEvent id="T"><bpmn:timerEventDefinition id="TD" bestadd:businessCalendar="office_at"><bpmn:timeDuration>P1D</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>
    </bpmn:process></bpmn:definitions>`);
    const timer = (rootElement as any).rootElements[0].flowElements[0].eventDefinitions[0];
    expect(timer.businessCalendar).toBe('office_at');
    const { xml } = await moddle.toXML(rootElement);
    expect(xml).toContain('bestadd:businessCalendar="office_at"');
  });
});
