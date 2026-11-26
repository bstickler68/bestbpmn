import { describe, expect, it } from 'vitest';
import { createI18n } from '@bestbpmn/i18n';
import { createModdle, deriveFromDefinitions } from '@bestbpmn/model';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import incident from '../../../templates/processes/incident.bpmn?raw';
import { fullHtml, profileHtml, referenceText, staffingHtml } from '../src/report/report';

const t = createI18n('de').t;
const now = new Date('2026-11-01T10:00:00Z');

async function definitions(xml: string) {
  return (await createModdle().fromXML(xml)).rootElement;
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('Steckbrief', () => {
  it('enthält alle festgelegten Abschnitte und keine Grafik', async () => {
    const doc = parse(profileHtml({ t, language: 'de', definitions: await definitions(template), now, fileName: 'Freigabe.bpmn' }));

    expect(doc.title).toBe('Dokumentenfreigabe – Steckbrief');
    expect([...doc.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Zweck und Beschreibung',
      'Vorgelagerte Prozesse',
      'Nachgelagerte Prozesse',
      'Schnittstellen (Input)',
      'Schnittstellen (Output)',
      'Auslöser',
      'Endzustand',
      'Erste Aktivität',
      'Letzte Aktivität',
      'Ressourcen',
    ]);
    expect(doc.querySelector('svg')).toBeNull();
    expect(doc.querySelector('.report-meta')!.textContent).toContain('Datei: Freigabe.bpmn');
    expect(doc.body.textContent).toContain('Dokument erstellen');
    expect(doc.querySelector('.resources-table a')!.getAttribute('href')).toBe('https://example.org/wiki/dokumentvorlagen');
    expect(doc.querySelector('.resources-table')!.textContent).toContain('Dokumentenmanagement');
  });

  it('maskiert Text aus dem Modell und macht nur sichere Links anklickbar', async () => {
    const xml = template
      .replace('name="Dokumentenfreigabe"', 'name="&lt;script&gt;alert(1)&lt;/script&gt;"')
      .replace('https://example.org/wiki/dokumentvorlagen', 'javascript:alert(1)');
    const html = profileHtml({ t, language: 'de', definitions: await definitions(xml), now });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(parse(html).querySelector('a[href^="javascript"]')).toBeNull();
  });
});

describe('Gesamtdokument', () => {
  it('enthält Prozessinformationen, Diagramm, Prozessschritte, Status und DEMI, ohne Hauptsprache und Prüfergebnis', async () => {
    const defs = await definitions(incident);
    const doc = parse(
      fullHtml({
        t,
        language: 'de',
        definitions: defs,
        now,
        svg: '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        statusModels: deriveFromDefinitions(defs),
      }),
    );

    expect([...doc.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Prozessinformationen',
      'Prozessablaufdiagramm',
      'Beschreibung der Prozessschritte',
      'Status',
      'Verantwortlichkeiten (DEMI)',
    ]);
    expect(doc.querySelector('.info-table')!.textContent).not.toContain('Hauptsprache');
    // Prozessketten stehen hinten im Kopfteil.
    expect([...doc.querySelectorAll('.info-table th')].map((th) => th.textContent).slice(-4)).toEqual([
      'Vorgelagerte Prozesse',
      'Nachgelagerte Prozesse',
      'Schnittstellen (Input)',
      'Schnittstellen (Output)',
    ]);
    expect(doc.querySelector('.diagram svg')).not.toBeNull();
    const head = [...doc.querySelectorAll('table.elements thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Nr', 'Objekt', 'Typ', 'Name', 'System', 'Input', 'Output', 'Beschreibung', 'Unterlagen']);
    // Ausgaben auf „Prozess“ stehen in der Spalte Output.
    const outputs = [...doc.querySelectorAll('table.elements tbody tr')].map((tr) => tr.children[6]!.textContent ?? '');
    expect(outputs.some((o) => o.includes('Prozess ['))).toBe(true);
    const numbers = [...doc.querySelectorAll('table.elements td.number')].map((td) => td.textContent);
    expect(numbers[0]).toBe('1');
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(doc.querySelector('table.raci')).not.toBeNull();
    expect(doc.querySelector('table.status')).not.toBeNull();
  });

  it('lässt das Kapitel Status weg, wenn kein Status modelliert ist', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:process id="P" name="Ohne Status"><bpmn:task id="T" name="Erledigen" /></bpmn:process>
</bpmn:definitions>`;
    const defs = await definitions(xml);
    const doc = parse(fullHtml({ t, language: 'de', definitions: defs, now, statusModels: deriveFromDefinitions(defs) }));

    expect([...doc.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Prozessinformationen',
      'Beschreibung der Prozessschritte',
      'Verantwortlichkeiten (DEMI)',
    ]);
    expect(doc.querySelector('.status-section')).toBeNull();
  });

  it('schreibt Verweise auf andere Nummern in die Beschreibung', async () => {
    const doc = parse(fullHtml({ t, language: 'de', definitions: await definitions(template), now, statusModels: [] }));
    const notes = [...doc.querySelectorAll('ul.next li')].map((li) => li.textContent);
    expect(notes.some((n) => /zurück zu \d+/.test(n!))).toBe(true);
    expect(notes.some((n) => /: weiter bei \d+/.test(n!))).toBe(true);
  });

  it('nennt Regel-Kennzeichen und ihre Beschreibung beim Prozessschritt', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" id="D" targetNamespace="t">
  <bpmn:process id="P" name="Mit Regeln">
    <bpmn:userTask id="U" name="Freigeben"><bpmn:extensionElements><bestadd:rules kinds="follow_action condition">Vier-Augen-Prinzip &amp; Ablage</bestadd:rules></bpmn:extensionElements></bpmn:userTask>
    <bpmn:task id="T" name="Ablegen" />
  </bpmn:process>
</bpmn:definitions>`;
    const doc = parse(fullHtml({ t, language: 'de', definitions: await definitions(xml), now, statusModels: [] }));
    const rules = [...doc.querySelectorAll('p.rules')];
    expect(rules.map((p) => p.textContent)).toEqual(['Regeln (Bedingung, Folgeaktion): Vier-Augen-Prinzip & Ablage']);
    expect(rules[0]!.closest('tr')!.getAttribute('data-element-id')).toBe('U');
  });
});

describe('Verweistexte', () => {
  it('nennt Beschriftung, Standardfluss und angeheftete Ereignisse', () => {
    expect(referenceText({ target: '6', direction: 'forward', label: 'Ja' }, t)).toBe('Ja: weiter bei 6');
    expect(referenceText({ target: '9', direction: 'forward', isDefault: true }, t)).toBe('sonst: weiter bei 9');
    expect(referenceText({ target: '3', direction: 'back' }, t)).toBe('zurück zu 3');
    expect(referenceText({ target: '10', direction: 'forward', boundary: { name: 'Frist', kind: 'timer' } }, t)).toBe(
      'bei „Frist“: weiter bei 10',
    );
    expect(referenceText({ target: '10', direction: 'forward', boundary: { kind: 'timer' } }, t)).toBe(
      'bei „Zeitgeber“: weiter bei 10',
    );
  });
});

describe('Prozessketten im Gesamtdokument', () => {
  it('zeigt vorgelagerte Prozesse und Schnittstellen im Kopfteil', async () => {
    const xml = template
      .replace(
        '</bpmn:process>',
        `<bpmn:textAnnotation id="Vor" bestadd:symbol="process" bestadd:processRef="P-7"><bpmn:text>Bedarf melden</bpmn:text></bpmn:textAnnotation>
        <bpmn:textAnnotation id="In" bestadd:symbol="interface" bestadd:interfaceType="document"><bpmn:text>Anforderung</bpmn:text></bpmn:textAnnotation>
        <bpmn:association id="X1" sourceRef="Vor" targetRef="In" associationDirection="One" />
        <bpmn:association id="X2" sourceRef="In" targetRef="__START__" associationDirection="One" />
        </bpmn:process>`,
      );
    const startId = /<bpmn:startEvent id="([^"]+)"/.exec(template)![1]!;
    const defs = await definitions(xml.replace('__START__', startId));
    const text = parse(fullHtml({ t, language: 'de', definitions: defs, now })).querySelector('.info-table')!.textContent!;
    expect(text).toContain('Bedarf melden');
    expect(text).toContain('P-7');
    expect(text).toContain('Anforderung');
    expect(text).toContain('Dokument');
  });
});

describe('Personalbedarf', () => {
  const head = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bestadd="urn:bestadd:schema:1.0" id="D" targetNamespace="t">`;
  const owner = (assignee: string) =>
    `<bpmn:potentialOwner><bpmn:resourceAssignmentExpression><bpmn:formalExpression>${assignee}</bpmn:formalExpression></bpmn:resourceAssignmentExpression></bpmn:potentialOwner>`;
  const task = (id: string, name: string, effort: string, assignee: string) =>
    `<bpmn:userTask id="${id}" name="${name}"><bpmn:extensionElements><bestadd:timing effort="${effort}" /></bpmn:extensionElements>${owner(assignee)}</bpmn:userTask>`;
  const model = (occurrence: string) => `${head}<bpmn:process id="P" name="Antrag &lt;b&gt;bearbeiten&lt;/b&gt;"${occurrence}>
    <bpmn:startEvent id="S" />${task('A', 'Prüfen', 'PT30M', 'role(clerk)')}${task('B', 'Freigeben', 'PT1H', 'role(lead)')}<bpmn:endEvent id="E" />
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A" /><bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="B" /><bpmn:sequenceFlow id="F3" sourceRef="B" targetRef="E" />
  </bpmn:process></bpmn:definitions>`;
  const roles = [{ id: 'clerk', kind: 'role' as const, name: 'Clerk', translations: { de: 'Sachbearbeitung' } }];

  it('zeigt je D Stunden und VZÄ mit zwei Nachkommastellen', async () => {
    const doc = parse(staffingHtml({ t, language: 'de', definitions: await definitions(model(' bestadd:annualOccurrence="1200"')), now, roles }));
    expect(doc.title).toBe('Antrag <b>bearbeiten</b> – Personalbedarf');
    expect(doc.querySelector('h1 b')).toBeNull();
    expect([...doc.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Jährliches Vorkommen', 'Personalbedarf je Durchführungsverantwortung']);
    const subtotals = [...doc.querySelectorAll('tr.subtotal')].map((r) => [...r.children].map((c) => c.textContent));
    expect(subtotals).toEqual([
      ['lead', '1.200,00', '0,71'],
      ['Sachbearbeitung', '600,00', '0,35'],
    ]);
    const prüfen = [...doc.querySelector('tr[data-element-id="A"]')!.children].map((c) => c.textContent);
    expect(prüfen).toEqual(['Prüfen', '30 min', '1.200', '600,00', '0,35']);
    expect([...doc.querySelector('tr.total')!.children].map((c) => c.textContent)).toEqual(['Summe', '1.800,00', '1,06']);
    expect(doc.body.textContent).toContain('1 VZÄ (FTE) = 1.694 Stunden im Jahr: 38,5 h Wochenarbeitszeit × 220 Arbeitstage pro Jahr ÷ 5 Arbeitstage pro Woche, aufgerundet auf ganze Stunden.');
  });

  it('rechnet mit einer übergebenen Jahresarbeitszeit', async () => {
    const doc = parse(staffingHtml({ t, language: 'de', definitions: await definitions(model(' bestadd:annualOccurrence="1200"')), now, fteBasis: { weeklyHours: 40, workingDaysPerYear: 225, workingDaysPerWeek: 5, hoursPerFte: 1800 } }));
    expect(doc.body.textContent).toContain('1 VZÄ (FTE) = 1.800 Stunden im Jahr: 40 h Wochenarbeitszeit × 225 Arbeitstage');
    expect([...doc.querySelector('tr.total')!.children].map((c) => c.textContent)).toEqual(['Summe', '1.800,00', '1,00']);
  });

  it('sagt, wenn kein Prozess ein jährliches Vorkommen hat', async () => {
    const doc = parse(staffingHtml({ t, language: 'de', definitions: await definitions(model('')), now }));
    expect(doc.querySelector('table.staffing-holders')).toBeNull();
    expect(doc.body.textContent).toContain('Kein Prozess hat ein jährliches Vorkommen.');
  });
});
