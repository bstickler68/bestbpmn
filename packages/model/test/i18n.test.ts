import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createModdle,
  localize,
  modelLanguage,
  pickText,
  readStateTranslations,
  readTranslations,
  stateKey,
} from '../src/index.js';

const template = readFileSync(
  new URL('../../../templates/processes/dokumentenfreigabe.bpmn', import.meta.url),
  'utf8',
);

describe('Mehrsprachigkeit im Modell (ADR 0010)', () => {
  it('bildet sprachneutrale Schlüssel aus Namen', () => {
    expect(stateKey('In Prüfung')).toBe('in_pruefung');
    expect(stateKey('  Größe ändern! ')).toBe('groesse_aendern');
    expect(stateKey('Révision')).toBe('revision');
    expect(stateKey('In review')).toBe('in_review');
  });

  it('liest Hauptsprache und Übersetzungen der Vorlage', async () => {
    const { rootElement, elementsById } = await createModdle().fromXML(template);
    expect(modelLanguage(rootElement)).toBe('de');
    expect(readTranslations(elementsById['Erstellen']!)).toEqual({
      en: {
        name: 'Create document',
        documentation: expect.stringMatching(/^Create the document/),
      },
    });
    // Statusübersetzungen stehen in der Statustabelle (ADR 0012); ältere Modelle mit praxiq:states bleiben lesbar.
    expect(readStateTranslations(elementsById['Prozess'])).toEqual({});
  });

  it('fällt auf die Hauptsprache zurück, wenn eine Übersetzung fehlt', () => {
    expect(localize('Entwurf', { en: 'Draft' }, 'en')).toBe('Draft');
    expect(localize('Entwurf', { en: 'Draft' }, 'fr')).toBe('Entwurf');
    expect(pickText({ en: 'IT services', de: 'IT-Services' }, 'de')).toBe('IT-Services');
    expect(pickText({ en: 'IT services', de: 'IT-Services' }, 'fr')).toBe('IT services');
    expect(pickText('Hinweis', 'en')).toBe('Hinweis');
  });

  it('schreibt Schlüssel und Übersetzungen unverändert zurück', async () => {
    const moddle = createModdle();
    const { rootElement } = await moddle.fromXML(template);
    const { xml } = await moddle.toXML(rootElement);
    expect(xml).toContain('praxiq:language="de"');
    expect(xml).toContain('praxiq:key="in_review"');
    expect(xml).toContain('<praxiq:translation lang="en" name="Create document">');
  });
});
