import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { documentsOfActivity, readAttributes, readDocumentRef } from '@bestbpmn/model';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import {
  bestbpmnModdleExtensions,
  bestbpmnModule,
  bestbpmnPropertiesProviderModule,
  SET_DOCUMENT,
  type DocumentCommands,
} from '@bestbpmn/bpmn-js-extension';

let container: HTMLDivElement;
let modeler: any;
const get = <T = any>(name: string): T => modeler.get(name) as T;
const element = (id: string) => get('elementRegistry').get(id);
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 150));

async function setup(xml = template) {
  container = document.createElement('div');
  container.innerHTML = '<div id="c" style="width:1000px;height:600px"></div><div id="p"></div>';
  document.body.appendChild(container);
  modeler = new Modeler({
    container: container.querySelector<HTMLElement>('#c')!,
    additionalModules: [BpmnPropertiesPanelModule, BpmnPropertiesProviderModule, bestbpmnModule, bestbpmnPropertiesProviderModule],
    moddleExtensions: bestbpmnModdleExtensions,
    propertiesPanel: { parent: container.querySelector('#p') },
    bestbpmn: { language: 'de' },
  });
  await modeler.importXML(xml);
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

/** Die Vorlage mit Links im alten Attribut an „Dokument prüfen“. */
const legacy = template.replace(
  /(<bpmn:userTask id="Pruefen" name="Dokument prüfen">\s*<bpmn:extensionElements>)/,
  `$1
        <bestadd:attributes>
          <bestadd:attribute key="links">
            <bestadd:link href="https://example.org/wiki/pruefliste" title="Prüfliste" />
            <bestadd:link href="https://example.org/wiki/normen" />
          </bestadd:attribute>
        </bestadd:attributes>`,
);

describe('Unterlagen an Datenobjekten', () => {
  it('zeigt die Gruppe „Unterlage“ nur an Datenobjekten außer „Prozess“, ohne Dokument-Record', async () => {
    await setup();
    await nextTick();
    get('selection').select(element('Ref_Dokumentvorlagen'));
    await nextTick();
    const group = container.querySelector('[data-group-id="group-bestbpmn-document"]');
    expect(group).not.toBeNull();
    expect(group!.textContent).not.toContain('Dokument-Record');
    expect(container.querySelector<HTMLInputElement>('input[name="bestbpmn-document-href"]')?.value).toBe('https://example.org/wiki/dokumentvorlagen');

    get('selection').select(element('Ref_InPruefung'));
    await nextTick();
    expect(container.querySelector('[data-group-id="group-bestbpmn-document"]')).toBeNull();
  });

  it('behält einen Dokument-Record aus einem anderen Werkzeug beim Speichern und lässt ihn entfernen', async () => {
    await setup(template.replace('bestadd:href="https://example.org/wiki/dokumentvorlagen"', 'bestadd:documentRef="DOC-12"'));
    const { xml } = await modeler.saveXML();
    expect(xml).toContain('bestadd:documentRef="DOC-12"');

    await nextTick();
    get('selection').select(element('Ref_Dokumentvorlagen'));
    await nextTick();
    const group = container.querySelector('[data-group-id="group-bestbpmn-document"]')!;
    expect(group.textContent).toContain('„DOC-12“');
    expect(container.querySelector<HTMLInputElement>('input[name="bestbpmn-document-href"]')?.disabled).toBe(true);

    group.querySelector<HTMLButtonElement>('.bestbpmn-document-remove')!.click();
    expect(readDocumentRef(element('Ref_Dokumentvorlagen').businessObject.dataObjectRef)).toEqual({});
    get('commandStack').undo();
    expect(readDocumentRef(element('Ref_Dokumentvorlagen').businessObject.dataObjectRef)).toEqual({ documentRef: 'DOC-12' });
  });

  it('setzt einen Dokument-Record und löscht dabei die Web-Adresse; Rückgängig stellt sie wieder her', async () => {
    await setup();
    const reference = element('Ref_Dokumentvorlagen');
    get('commandStack').execute(SET_DOCUMENT, { element: reference, documentRef: 'DOC-1' });
    expect(readDocumentRef(reference.businessObject.dataObjectRef)).toEqual({ documentRef: 'DOC-1' });
    expect(documentsOfActivity(element('Erstellen').businessObject)[0]).toMatchObject({ documentRef: 'DOC-1' });

    get('commandStack').undo();
    expect(readDocumentRef(reference.businessObject.dataObjectRef)).toEqual({ href: 'https://example.org/wiki/dokumentvorlagen' });
  });

  it('wandelt Links im alten Attribut in Datenobjekte mit Eingabe um, als ein Schritt', async () => {
    await setup(legacy);
    const commands = get<DocumentCommands>('bestbpmnDocumentCommands');
    expect(commands.legacyTasks().map((t) => t.id)).toEqual(['Pruefen']);

    expect(commands.convertLegacyLinks()).toBe(2);
    const task = element('Pruefen').businessObject;
    expect(readAttributes(task).flatMap((a) => a.links)).toEqual([]);
    expect(documentsOfActivity(task).map(({ name, href }) => ({ name, href }))).toEqual([
      { name: 'Prüfliste', href: 'https://example.org/wiki/pruefliste' },
      { name: 'https://example.org/wiki/normen', href: 'https://example.org/wiki/normen' },
    ]);
    expect(commands.legacyTasks()).toEqual([]);

    get('commandStack').undo();
    expect(readAttributes(element('Pruefen').businessObject)[0]?.links).toHaveLength(2);
    expect(documentsOfActivity(element('Pruefen').businessObject)).toEqual([]);
  });

  it('ändert ein Modell ohne alte Links nicht', async () => {
    await setup();
    expect(get<DocumentCommands>('bestbpmnDocumentCommands').convertLegacyLinks()).toBe(0);
    expect(get('commandStack').canUndo()).toBe(false);
  });
});
