import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createModdle, readAttributes, readDescription } from '../src/index.js';

const template = readFileSync(
  new URL('../../../templates/processes/dokumentenfreigabe.bpmn', import.meta.url),
  'utf8',
);

async function element(xml: string, id: string) {
  const { rootElement, elementsById } = await createModdle().fromXML(xml);
  return { rootElement, element: (elementsById as Record<string, any>)[id] };
}

describe('Zusatzattribute (ADR 0009)', () => {
  it('liest Links und Services aus der Vorlage', async () => {
    const { element: task } = await element(template, 'Erstellen');
    expect(readAttributes(task)).toEqual([
      {
        key: 'links',
        value: undefined,
        links: [{ href: 'https://example.org/wiki/dokumentvorlagen', title: 'Dokumentvorlagen' }],
        services: [],
      },
      {
        key: 'services',
        value: undefined,
        links: [],
        services: [{ ref: 'svc-dms', name: 'Dokumentenmanagement' }],
      },
    ]);
  });

  it('liest die Beschreibung aus documentation', async () => {
    const { element: task } = await element(template, 'Erstellen');
    expect(readDescription(task)).toMatch(/^Lege das Dokument/);
    const { element: process } = await element(template, 'Dokumentenfreigabe');
    expect(readDescription(process)).toMatch(/erstellt, geprüft und freigegeben/);
  });

  it('liefert leere Werte ohne Attribute', async () => {
    const { element: task } = await element(template, 'Pruefen');
    expect(readAttributes(task)).toEqual([]);
    expect(readDescription(task)).toBeUndefined();
  });

  it('behält unbekannte Attribute beim Speichern', async () => {
    const xml = template.replace(
      '<praxiq:attribute key="links">',
      '<praxiq:attribute key="dauer" value="2 Stunden" />\n          <praxiq:attribute key="links">',
    );
    const moddle = createModdle();
    const { rootElement } = await moddle.fromXML(xml);
    const { xml: saved } = await moddle.toXML(rootElement);
    expect(saved).toContain('<praxiq:attribute key="dauer" value="2 Stunden" />');
    const { element: task } = await element(saved, 'Erstellen');
    expect(readAttributes(task).map((a) => a.key)).toEqual(['dauer', 'links', 'services']);
  });
});
