import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { readAttributes } from '@bestbpmn/model';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import services from '../../../templates/catalog/services.json';
import {
  bestbpmnModdleExtensions,
  bestbpmnModule,
  bestbpmnPropertiesProviderModule,
  UPDATE_ATTRIBUTE,
  type ServiceOverlays,
} from '@bestbpmn/bpmn-js-extension';

let container: HTMLDivElement;
let modeler: any;
const get = <T = any>(name: string): T => modeler.get(name) as T;

async function setup(xml = template) {
  container = document.createElement('div');
  container.innerHTML = '<div id="c" style="width:1000px;height:600px"></div><div id="p"></div>';
  document.body.appendChild(container);
  modeler = new Modeler({
    container: container.querySelector<HTMLElement>('#c')!,
    additionalModules: [
      BpmnPropertiesPanelModule,
      BpmnPropertiesProviderModule,
      bestbpmnModule,
      bestbpmnPropertiesProviderModule,
    ],
    moddleExtensions: bestbpmnModdleExtensions,
    propertiesPanel: { parent: container.querySelector('#p') },
    bestbpmn: { services },
  });
  await modeler.importXML(xml);
}

const element = (id: string) => get('elementRegistry').get(id);
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 150));

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Zusatzattribute an Aktivitäten', () => {
  it('setzt einen Wert und legt dabei alle Container an', async () => {
    await setup();
    const task = element('Pruefen');
    get('commandStack').execute(UPDATE_ATTRIBUTE, { element: task, key: 'hinweis', value: 'Vier-Augen-Prinzip' });

    expect(readAttributes(task.businessObject)).toEqual([
      { key: 'hinweis', value: 'Vier-Augen-Prinzip', links: [], services: [] },
    ]);
    const { xml } = await modeler.saveXML();
    expect(xml).toContain('<bestadd:attribute key="hinweis" value="Vier-Augen-Prinzip" />');
  });

  it('macht das Setzen in einem Schritt rückgängig', async () => {
    await setup();
    const task = element('Pruefen');
    const extensionsBefore = task.businessObject.extensionElements.values.length;
    get('commandStack').execute(UPDATE_ATTRIBUTE, { element: task, key: 'hinweis', value: 'x' });
    get('commandStack').undo();

    expect(readAttributes(task.businessObject)).toEqual([]);
    expect(task.businessObject.extensionElements.values).toHaveLength(extensionsBefore);
  });

  it('räumt leere Container wieder auf', async () => {
    await setup();
    const task = element('Ueberarbeiten');
    const hadExtensions = !!task.businessObject.extensionElements;
    get('commandStack').execute(UPDATE_ATTRIBUTE, { element: task, key: 'hinweis', value: 'x' });
    get('commandStack').execute(UPDATE_ATTRIBUTE, { element: task, key: 'hinweis', value: '' });

    expect(readAttributes(task.businessObject)).toEqual([]);
    expect(!!task.businessObject.extensionElements).toBe(hadExtensions);
  });

  it('ordnet Services über den Katalog zu', async () => {
    await setup();
    const task = element('Pruefen');
    const ref = get('bpmnFactory').create('bestadd:ServiceRef', { ref: 'svc-wiki', name: 'Wissensdatenbank' });
    get('commandStack').execute(UPDATE_ATTRIBUTE, { element: task, key: 'services', items: [ref] });

    expect(readAttributes(task.businessObject)[0]?.services).toEqual([{ ref: 'svc-wiki', name: 'Wissensdatenbank' }]);
  });
});

describe('Eigenschaftenpanel', () => {
  it('zeigt Beschreibung, Links und nur Business-Services', async () => {
    await setup();
    await nextTick(); // Das Panel hört erst nach dem ersten Rendern auf die Auswahl.
    get('selection').select(element('Erstellen'));
    await nextTick();

    const panel = container.querySelector('#p')!;
    expect(panel.querySelector('[data-group-id="group-bestbpmn-links"]')).not.toBeNull();
    const servicesGroup = panel.querySelector('[data-group-id="group-bestbpmn-services"]')!;
    expect(servicesGroup.textContent).toContain('Dokumentenmanagement');
    expect(servicesGroup.textContent).not.toContain('Datenbankcluster');
    expect(panel.textContent).toContain('Dokumentvorlagen');
  });

  it('beschriftet einen neuen Link mit „Web(URL)“ statt mit der Adresse', async () => {
    await setup();
    await nextTick();
    get('selection').select(element('Pruefen'));
    await nextTick();

    const group = container.querySelector('[data-group-id="group-bestbpmn-links"]')!;
    group.querySelector<HTMLButtonElement>('.bio-properties-panel-add-entry')!.click();
    await nextTick();

    const link = readAttributes(element('Pruefen').businessObject)[0]?.links[0];
    expect(link?.href ?? '').toBe('');
    expect(group.textContent).toContain('Web(URL)');
    expect(group.textContent).not.toContain('https://');
    get('selection').select(null);
    await nextTick();
  });

  it('zeigt keine Zusatzattribute an Ereignissen', async () => {
    await setup();
    await nextTick();
    get('selection').select(element('Start'));
    await nextTick();
    expect(container.querySelector('[data-group-id="group-bestbpmn-services"]')).toBeNull();
  });
});

describe('Services am Diagramm', () => {
  it('zeigt die Anzahl und auf Wunsch die Namen', async () => {
    await setup();
    const overlays = get('overlays').get({ element: 'Erstellen', type: 'bestbpmn-services' });
    expect(overlays).toHaveLength(1);
    expect(overlays[0].html.textContent).toBe('⚙ 1');

    get<ServiceOverlays>('bestbpmnServiceOverlays').toggleNames(true);
    const named = get('overlays').get({ element: 'Erstellen', type: 'bestbpmn-services' });
    expect(named[0].html.textContent).toBe('Dokumentenmanagement');
  });

  it('aktualisiert die Anzeige nach einer Änderung', async () => {
    await setup();
    const task = element('Pruefen');
    expect(get('overlays').get({ element: 'Pruefen', type: 'bestbpmn-services' })).toHaveLength(0);
    const ref = get('bpmnFactory').create('bestadd:ServiceRef', { ref: 'svc-mail', name: 'E-Mail und Kalender' });
    get('commandStack').execute(UPDATE_ATTRIBUTE, { element: task, key: 'services', items: [ref] });
    expect(get('overlays').get({ element: 'Pruefen', type: 'bestbpmn-services' })).toHaveLength(1);
  });
});
