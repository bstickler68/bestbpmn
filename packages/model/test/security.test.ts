import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogLabel, createModdle, deriveStatusModels, localize, parseCatalog, pickText } from '../src/index.js';

/**
 * Schlüssel aus Modell und Datei (Status, Sprachen, Rollen) dürfen keine geerbten Einträge treffen
 * und kein Objekt verändern (OWASP ASVS 4.0.3, 5.1.2 / Prototype Pollution).
 */
const RESERVED = ['constructor', '__proto__', 'toString', 'hasOwnProperty'];

const template = readFileSync(new URL('../../../templates/processes/dokumentenfreigabe.bpmn', import.meta.url), 'utf8');

describe('Reservierte Schlüssel aus dem Modell', () => {
  for (const key of RESERVED) {
    it(`Status „${key}“ ist ein gewöhnlicher Status`, async () => {
      const xml = template.replaceAll('"in_review"', `"${key}"`).replace('bestadd:language="de"', `bestadd:language="${key}"`);
      const [model] = await deriveStatusModels(xml, {}, { disabledRules: ['task-without-service'] });
      expect(model!.statuses).toEqual([key, 'reviewed', 'approved']);
      expect(Object.keys(model!.statusNames)).toEqual([key, 'reviewed', 'approved']);
      expect(model!.statusNames[key]).toBe(key);
      expect(model!.statusTranslations[key]).toBeUndefined();
      // Kein falscher Konflikt, weil `constructor` schon „bekannt“ schien.
      expect(model!.issues.map((i) => i.code)).not.toContain('state-key-conflict');
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  }

  it('Übersetzungen fallen bei geerbten Sprachschlüsseln auf den Originaltext zurück', () => {
    for (const key of RESERVED) {
      expect(localize('Original', {}, key)).toBe('Original');
      expect(catalogLabel({ name: 'Name' }, key)).toBe('Name');
      expect(catalogLabel({ name: 'Name', translations: {} }, key)).toBe('Name');
      expect(pickText({ en: 'Text' }, key)).toBe('Text');
    }
  });
});

describe('Reservierte Schlüssel in der Katalogdatei', () => {
  it('Sprachen wie __proto__ bleiben eigene Einträge und verändern keinen Prototyp', () => {
    const text = '{"states":[{"id":"a","name":"A","translations":{"__proto__":{"polluted":"ja"},"constructor":"K","de":"A-de"}}]}';
    const { catalog } = parseCatalog(text);
    const state = catalog.states![0]!;
    expect(Object.keys(state.translations!)).toEqual(['constructor', 'de']);
    expect(catalogLabel(state, 'constructor')).toBe('K');
    expect(catalogLabel(state, 'toString')).toBe('A');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('XML-Import (ASVS 5.5.2)', () => {
  it('löst keine eigenen oder externen Entitäten auf (kein XXE, keine Entitäten-Bombe)', async () => {
    const doctype = `<!DOCTYPE d [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY x SYSTEM "file:///etc/passwd">]>`;
    const xml = `<?xml version="1.0"?>${doctype}<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t"><bpmn:process id="P" name="&b;|&x;|&amp;|&#65;"/></bpmn:definitions>`;
    const { rootElement } = await createModdle().fromXML(xml);
    // Nur die vordefinierten Entitäten und Zeichenreferenzen gelten; alles andere bleibt Text.
    expect((rootElement as any).rootElements[0].name).toBe('&b;|&x;|&|A');
  });
});
