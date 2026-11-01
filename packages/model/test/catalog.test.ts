import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveStatusModels, isEmptyCatalog, parseCatalog, serializeCatalog } from '../src/index.js';

const example = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../templates/catalog/${name}.json`, import.meta.url), 'utf8'));

describe('Katalog-Datei', () => {
  it('liest Status, Rollen und Services und schreibt sie unverändert zurück', () => {
    const file = { states: example('states'), roles: example('roles'), services: example('services') };
    const { catalog, errors } = parseCatalog(JSON.stringify(file));
    expect(errors).toEqual([]);
    expect(catalog).toEqual(file);
    expect(parseCatalog(serializeCatalog(catalog)).catalog).toEqual(file);
  });

  it('lässt leere und fehlende Tabellen weg', () => {
    const { catalog } = parseCatalog('{ "states": [], "roles": [{ "id": "einkauf", "name": "Einkauf", "kind": "group" }] }');
    expect(catalog).toEqual({ roles: [{ id: 'einkauf', name: 'Einkauf', kind: 'group' }] });
    expect(isEmptyCatalog(parseCatalog('{}').catalog)).toBe(true);
  });

  it('meldet ungültige Einträge und doppelte IDs, übernimmt aber den Rest', () => {
    const { catalog, errors } = parseCatalog(
      JSON.stringify({
        states: [{ id: 'neu', name: 'Neu' }, { id: 'neu', name: 'Nochmal' }, { name: 'ohne ID' }],
        roles: [{ id: 'x', name: 'X', kind: 'team' }],
        services: 'keine Liste',
      }),
    );
    expect(catalog).toEqual({ states: [{ id: 'neu', name: 'Neu' }] });
    expect(errors.map((e) => e.code)).toEqual(['duplicate-id', 'invalid-entry', 'invalid-entry', 'not-a-list']);
  });

  it('meldet Dateien, die kein Katalog sind', () => {
    expect(parseCatalog('kein JSON').errors[0]!.code).toBe('invalid-json');
    expect(parseCatalog('[1, 2]').errors[0]!.code).toBe('not-an-object');
  });

  it('erlaubt ohne Statustabelle jeden Status, mit Tabelle nur bekannte', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="t">
  <bpmn:process id="P">
    <bpmn:dataObject id="Vorgang" name="Prozess" />
    <bpmn:dataObjectReference id="R" name="Prozess [In Prüfung]" dataObjectRef="Vorgang">
      <bpmn:dataState id="R_s" name="In Prüfung" />
    </bpmn:dataObjectReference>
  </bpmn:process>
</bpmn:definitions>`;
    const [free] = await deriveStatusModels(xml, parseCatalog('{ "states": [] }').catalog);
    expect(free!.issues).toEqual([]);
    expect(free!.statuses).toEqual(['in_pruefung']);
    expect(free!.statusNames).toEqual({ in_pruefung: 'In Prüfung' });
    const [strict] = await deriveStatusModels(xml, parseCatalog('{ "states": [{ "id": "neu", "name": "Neu" }] }').catalog);
    expect(strict!.issues.map((i) => i.code)).toEqual(['unknown-state']);
  });
});
