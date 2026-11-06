import { afterEach, describe, expect, it, vi } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { createI18n } from '@bestbpmn/i18n';
import { disabledRulesOf, readRaci, type CatalogFile, type IssueCode, type StatusModel } from '@bestbpmn/model';
import {
  bestbpmnModdleExtensions,
  bestbpmnModule,
  bestbpmnPropertiesProviderModule,
  translateModule,
  type StatusCheck,
} from '@bestbpmn/bpmn-js-extension';
import { EMPTY_DIAGRAM } from '../src/emptyDiagram';
import { renderCatalogEditor, rowsToCatalog } from '../src/catalogEditor';
import { renderRulesPanel } from '../src/rulesPanel';

let container: HTMLDivElement;
let modeler: any;
const get = <T = any>(name: string): T => modeler.get(name) as T;
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 150));
const t = createI18n('de').t;

/** Modellierer ohne Katalog: Status, Rollen und Gruppen sind Freitext. */
async function setup(disabledRules: IssueCode[] = disabledRulesOf('document')) {
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
      translateModule('de'),
    ],
    moddleExtensions: bestbpmnModdleExtensions,
    propertiesPanel: { parent: container.querySelector('#p') },
    bestbpmn: { language: 'de', disabledRules },
  });
  await modeler.importXML(EMPTY_DIAGRAM);
}

function create(type: string, x: number, y = 300) {
  const shape = get('elementFactory').createShape({ type });
  return get('modeling').createShape(shape, { x, y }, get('canvas').getRootElement());
}

async function type(input: HTMLInputElement, text: string) {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));
}

const results = (entry: Element) =>
  [...entry.querySelectorAll('.bestbpmn-picker-results li')].map((li) => li.textContent);

function pick(entry: Element, value: string) {
  entry
    .querySelector(`.bestbpmn-picker-results li[data-value="${CSS.escape(value)}"]`)!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

const models = () => get<StatusCheck>('bestbpmnStatusCheck').getModels() as StatusModel[];

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Status als Freitext', () => {
  it('behält den Namen und bildet den Schlüssel daraus', async () => {
    await setup();
    const ref = create('bpmn:DataObjectReference', 200);
    get('modeling').updateLabel(ref, 'Prozess [In Prüfung]');

    expect(ref.businessObject.name).toBe('Prozess [In Prüfung]');
    expect(ref.businessObject.dataState.name).toBe('In Prüfung');
    expect(ref.businessObject.dataState.key).toBe('in_pruefung');
    const [model] = models();
    expect(model!.statuses).toEqual(['in_pruefung']);
    expect(model!.statusNames).toEqual({ in_pruefung: 'In Prüfung' });
    expect(model!.issues).toEqual([]);
  });

  it('schlägt Status aus dem Modell vor und nimmt neue an', async () => {
    await setup();
    const first = create('bpmn:DataObjectReference', 200);
    get('modeling').updateLabel(first, 'Prozess [Offen]');
    const second = create('bpmn:DataObjectReference', 320);
    get('modeling').updateLabel(second, 'Prozess');
    await nextTick();
    get('selection').select(second);
    await nextTick();

    const entry = container.querySelector('[data-entry-id="bestbpmn-status-state"]')!;
    expect(entry.textContent).toContain('Status aus dem Modell wählen');
    await type(entry.querySelector('input')!, 'of');
    expect(results(entry)).toEqual(['Offen', '„of“ als neuer Status']);

    await type(entry.querySelector('input')!, 'Erledigt');
    pick(entry, 'Erledigt');
    expect(second.businessObject.name).toBe('Prozess [Erledigt]');
    expect(second.businessObject.dataState.key).toBe('erledigt');
    get('selection').select(null);
    await nextTick();
  });
});

describe('Rollen und Gruppen als Freitext', () => {
  it('legt neue Gruppen an und schlägt sie danach im ganzen Modell vor', async () => {
    await setup();
    const first = create('bpmn:UserTask', 200);
    const second = create('bpmn:UserTask', 400);
    await nextTick();
    get('selection').select(first);
    await nextTick();

    const entry = () => container.querySelector('[data-entry-id="bestbpmn-raci-responsible"]')!;
    await type(entry().querySelector('input')!, 'Einkauf');
    expect(results(entry())).toEqual(['„Einkauf“ als neue Gruppe', '„Einkauf“ als neue Rolle']);
    pick(entry(), 'group(Einkauf)');
    await nextTick();
    expect(readRaci(first.businessObject).responsible).toEqual([{ kind: 'group', ref: 'Einkauf' }]);
    // Ohne Katalog ist Freitext normal und wird nicht als „nicht im Katalog“ markiert.
    expect(entry().textContent).toContain('Einkauf (Gruppe)');
    expect(entry().textContent).not.toContain('nicht im Katalog');

    get('selection').select(second);
    await nextTick();
    await type(entry().querySelector('input')!, 'ein');
    expect(results(entry())).toEqual(['Einkauf (Gruppe)', '„ein“ als neue Gruppe', '„ein“ als neue Rolle']);
    pick(entry(), 'group(Einkauf)');
    expect(readRaci(second.businessObject).responsible).toEqual([{ kind: 'group', ref: 'Einkauf' }]);
    get('selection').select(null);
    await nextTick();
  });

  it('entfernt Klammern und Kommas aus frei eingegebenen Namen', async () => {
    await setup();
    const task = create('bpmn:UserTask', 200);
    await nextTick();
    get('selection').select(task);
    await nextTick();
    const entry = container.querySelector('[data-entry-id="bestbpmn-raci-accountable"]')!;
    await type(entry.querySelector('input')!, 'Leitung (Nord), Süd');
    pick(entry, 'role(Leitung Nord Süd)');
    expect(readRaci(task.businessObject).accountable).toEqual([{ kind: 'role', ref: 'Leitung Nord Süd' }]);
    get('selection').select(null);
    await nextTick();
  });
});

describe('Regelprofile im Modellierer', () => {
  it('verlangt im Profil „Dokumentieren“ kein D und prüft nach dem Umschalten sofort neu', async () => {
    await setup();
    create('bpmn:UserTask', 200);
    expect(models()[0]!.issues).toEqual([]);

    get<StatusCheck>('bestbpmnStatusCheck').setDisabledRules(disabledRulesOf('complete'));
    expect(models()[0]!.issues.map((i) => i.code)).toEqual(['raci-missing-responsible', 'task-without-service']);
    // Rückgängig bleibt erhalten, weil der Modellierer nicht neu aufgebaut wird.
    get('commandStack').undo();
    expect(models()[0]!.issues).toEqual([]);
  });
});

describe('Einstellungen', () => {
  it('zeigt das Profil und meldet abgeschaltete Regeln', () => {
    const div = document.createElement('div');
    const onChange = vi.fn();
    renderRulesPanel(div, disabledRulesOf('document'), t, onChange);
    expect(div.querySelector<HTMLSelectElement>('#rule-profile')!.value).toBe('document');
    expect(div.querySelectorAll('input[type="checkbox"]')).toHaveLength(23);
    expect(div.querySelector<HTMLInputElement>('[data-rule="lane-without-role"]')!.checked).toBe(false);

    const box = div.querySelector<HTMLInputElement>('[data-rule="unknown-state"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect([...onChange.mock.calls[0]![0]].sort()).toEqual([
      'conditional-flows-without-default',
      'flow-without-condition',
      'lane-without-role',
      'multi-instance-single-responsible',
      'raci-missing-responsible',
      'task-without-service',
      'unknown-state',
    ]);

    renderRulesPanel(div, ['unknown-state'], t, onChange);
    expect(div.querySelector<HTMLSelectElement>('#rule-profile')!.value).toBe('custom');
    expect(div.textContent).toContain('Eigene Auswahl');
  });

  it('bearbeitet den Katalog und bildet fehlende IDs aus dem Namen', () => {
    const div = document.createElement('div');
    const applied: CatalogFile[] = [];
    const example: CatalogFile = { roles: [{ id: 'einkauf', name: 'Purchasing', kind: 'group', translations: { de: 'Einkauf' } }] };
    renderCatalogEditor(div, { t, catalog: {}, example, onApply: (c) => applied.push(c) });
    expect(div.textContent).toContain('Kein Katalog');

    div.querySelector<HTMLButtonElement>('[data-table="states"] .add-row')!.click();
    const name = div.querySelector<HTMLInputElement>('[data-table="states"] input[data-column="name"]')!;
    name.value = 'In Prüfung';
    name.dispatchEvent(new Event('input'));
    div.querySelector<HTMLButtonElement>('button.apply')!.click();
    expect(applied.at(-1)).toEqual({ states: [{ id: 'in_pruefung', name: 'In Prüfung' }] });
    expect(div.textContent).toContain('Katalog übernommen.');

    div.querySelector<HTMLButtonElement>('button.example')!.click();
    expect(applied.at(-1)).toEqual(example);
    expect(div.querySelector<HTMLInputElement>('[data-table="roles"] input[data-column="de"]')!.value).toBe('Einkauf');

    div.querySelector<HTMLButtonElement>('button.clear')!.click();
    expect(applied.at(-1)).toEqual({});
  });

  it('behält beim Bearbeiten Felder, die der Editor nicht zeigt', () => {
    const { catalog } = rowsToCatalog({
      states: [{ id: 'neu', name: 'New', de: 'Neu', kind: '', source: { id: 'neu', name: 'New', color: '#6b7280', translations: { fr: 'Nouveau' } } }],
      roles: [],
      services: [{ id: '', name: 'E-Mail', de: '', kind: 'business', source: {} }],
    });
    expect(catalog).toEqual({
      states: [{ id: 'neu', name: 'New', color: '#6b7280', translations: { fr: 'Nouveau', de: 'Neu' } }],
      services: [{ id: 'e_mail', name: 'E-Mail', kind: 'business' }],
    });
  });
});

describe('IDs', () => {
  it('zeigt die ID nur an; sie lässt sich im Panel nicht ändern', async () => {
    await setup();
    const task = create('bpmn:UserTask', 200);
    await nextTick();
    get('selection').select(task);
    await nextTick();
    const input = container.querySelector<HTMLInputElement>('[data-entry-id="id"] input')!;
    expect(input.value).toBe(task.businessObject.id);
    expect(input.disabled).toBe(true);
  });

  it('zeigt auch die Prozess-ID eines Pools nur an', async () => {
    await setup();
    const pool = create('bpmn:Participant', 400);
    get('selection').select(pool);
    await nextTick();
    for (const id of ['id', 'processId']) {
      expect(container.querySelector<HTMLInputElement>(`[data-entry-id="${id}"] input`)!.disabled).toBe(true);
    }
    expect(container.querySelector<HTMLInputElement>('[data-entry-id="processId"] input')!.value).toBe(
      pool.businessObject.processRef.id,
    );
  });
});
