import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createModdle, deriveFromDefinitions, deriveProfile, deriveElementTables, documentsOfActivity, readDocumentRef } from '../src/index.js';

const template = readFileSync(new URL('../../../templates/processes/dokumentenfreigabe.bpmn', import.meta.url), 'utf8');

async function load(xml: string) {
  const { rootElement, elementsById } = await createModdle().fromXML(xml);
  return { definitions: rootElement, byId: elementsById as Record<string, any> };
}

const codes = async (xml: string) => {
  const { definitions } = await load(xml);
  return deriveFromDefinitions(definitions).flatMap((m) => m.issues).map((i) => i.code);
};

describe('Unterlagen an Aktivitäten', () => {
  it('liest Datenobjekte mit Eingabe an der Aufgabe, ohne „Prozess“', async () => {
    const { byId } = await load(template);
    expect(documentsOfActivity(byId.Erstellen)).toEqual([
      { dataObjectId: 'Dokumentvorlagen', name: 'Dokumentvorlagen', href: 'https://example.org/wiki/dokumentvorlagen' },
    ]);
    // „Dokument prüfen“ hat nur die Eingabe „Prozess [in_review]“.
    expect(documentsOfActivity(byId.Pruefen)).toEqual([]);
  });

  it('liest und schreibt den Verweis auf einen Dokument-Record', async () => {
    const xml = template.replace('bestadd:href="https://example.org/wiki/dokumentvorlagen"', 'bestadd:documentRef="DOC-1"');
    const moddle = createModdle();
    const { rootElement, elementsById } = await moddle.fromXML(xml);
    expect(readDocumentRef((elementsById as any).Dokumentvorlagen)).toEqual({ documentRef: 'DOC-1' });
    const { xml: saved } = await moddle.toXML(rootElement);
    expect(saved).toContain('<bpmn:dataObject id="Dokumentvorlagen" name="Dokumentvorlagen" bestadd:documentRef="DOC-1" />');
  });

  it('hat in der Vorlage keine Hinweise zu Unterlagen', async () => {
    const found = await codes(template);
    expect(found.filter((c) => c.startsWith('document') || c === 'legacy-links-attribute')).toEqual([]);
  });

  it('weist auf Verweise ohne Eingabe, doppelte Verweise und alte Links hin', async () => {
    const xml = template
      .replace(/<bpmn:dataInputAssociation id="In_Erstellen_Vorlagen">[\s\S]*?<\/bpmn:dataInputAssociation>/, '')
      .replace(/<bpmndi:BPMNEdge id="In_Erstellen_Vorlagen_di"[^\n]*\n/, '')
      .replace('bestadd:href=', 'bestadd:documentRef="DOC-1" bestadd:href=')
      .replace(
        '<bestadd:attribute key="services">',
        '<bestadd:attribute key="links"><bestadd:link href="https://example.org/wiki" /></bestadd:attribute><bestadd:attribute key="services">',
      );
    const { definitions } = await load(xml);
    const issues = deriveFromDefinitions(definitions).flatMap((m) => m.issues);
    expect(issues.find((i) => i.code === 'document-not-input')).toMatchObject({ elementId: 'Ref_Dokumentvorlagen', severity: 'warning' });
    expect(issues.find((i) => i.code === 'document-ref-and-href')).toMatchObject({ elementId: 'Dokumentvorlagen' });
    expect(issues.find((i) => i.code === 'legacy-links-attribute')).toMatchObject({ elementId: 'Erstellen', params: { count: '1' } });
  });

  it('zeigt Unterlagen in Steckbrief und Prozessschritten', async () => {
    const { definitions } = await load(template);
    expect(deriveProfile(definitions).resources.documents).toContainEqual({
      id: 'Ref_Dokumentvorlagen',
      name: 'Dokumentvorlagen',
      href: 'https://example.org/wiki/dokumentvorlagen',
    });
    const row = deriveElementTables(definitions)[0]!.rows.find((r) => r.id === 'Erstellen')!;
    expect(row.documents.map((d) => d.name)).toEqual(['Dokumentvorlagen']);
    expect(row.inputs).toContain('Dokumentvorlagen');
  });
});
