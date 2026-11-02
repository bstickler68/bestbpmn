import { describe, expect, it } from 'vitest';
import { createI18n } from '@bestbpmn/i18n';
import { createModdle, deriveFromDefinitions } from '@bestbpmn/model';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import incident from '../../../templates/processes/incident.bpmn?raw';
import { fullHtml, profileHtml, referenceText } from '../src/report/report';

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
      'Auslöser',
      'Endzustand',
      'Erste Aktivität',
      'Letzte Aktivität',
      'Schnittstellen (Input)',
      'Schnittstellen (Output)',
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
    expect(doc.querySelector('.diagram svg')).not.toBeNull();
    const head = [...doc.querySelectorAll('table.elements thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Nr.', 'Elementtyp', 'Elementart', 'Name', 'IT-System(e)', 'Beschreibung', 'Weiterführende Dokumentation']);
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
