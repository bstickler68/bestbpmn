import Modeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import './styles.css';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { createI18n, matchLanguage, SUPPORTED_LANGUAGES, type TFunction } from '@bestbpmn/i18n';
import { deriveRaciMatrices, parseCatalog, type CatalogFile, type IssueCode, type StatusModel } from '@bestbpmn/model';
import exampleServices from '../../../templates/catalog/services.json';
import exampleStates from '../../../templates/catalog/states.json';
import exampleRoles from '../../../templates/catalog/roles.json';
import incident from '../../../templates/processes/incident.bpmn?raw';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import { EMPTY_DIAGRAM } from './emptyDiagram';
import {
  fileNameFor,
  modelName,
  bestbpmnModdleExtensions,
  bestbpmnModule,
  bestbpmnPropertiesProviderModule,
  STATUS_CHANGED,
  translateModule,
  type ServiceOverlays,
  type StatusCheck,
} from '@bestbpmn/bpmn-js-extension';
import { renderRaciMatrix } from './raciMatrix';
import { renderStatusPanel } from './statusPanel';
import { renderCatalogEditor } from './catalogEditor';
import { renderRulesPanel } from './rulesPanel';
import { loadCatalog, loadDisabledRules, saveCatalog, saveDisabledRules } from './storage';
import { download, svgToPng, withExtension } from './export';
import { FilesController } from './files/controller';
import { renderBanner, renderFilesPanel } from './files/filesPanel';

const LANGUAGE_KEY = 'bestbpmn.language';
const statusPanel = document.querySelector<HTMLElement>('#status')!;
const raciPanel = document.querySelector<HTMLElement>('#raci')!;
const languageSelect = document.querySelector<HTMLSelectElement>('#language')!;
const showServices = document.querySelector<HTMLInputElement>('#show-services')!;
const nameLabel = document.querySelector<HTMLElement>('#model-name')!;
const rulesPanel = document.querySelector<HTMLElement>('#rules')!;
const catalogPanel = document.querySelector<HTMLElement>('#catalog')!;
const filesPanel = document.querySelector<HTMLElement>('#files')!;
const banner = document.querySelector<HTMLElement>('#banner')!;
const fileLabel = document.querySelector<HTMLElement>('#file-name')!;

/** Der Beispielkatalog aus `templates/catalog`, zum Ausprobieren in den Einstellungen. */
const EXAMPLE_CATALOG: CatalogFile = parseCatalog(
  JSON.stringify({ states: exampleStates, roles: exampleRoles, services: exampleServices }),
).catalog;

let modeler: any;
let t: TFunction;
let language: string;
// Ohne eigenen Katalog sind Status, Rollen und Gruppen Freitext.
let catalog: CatalogFile = loadCatalog();
let disabledRules: IssueCode[] = loadDisabledRules();
/** Ungespeicherte Änderungen seit dem letzten Öffnen oder Speichern. */
let dirty = false;

const currentName = () => fileNameFor(modelName(modeler.getDefinitions()));

async function currentXml(): Promise<string> {
  return (await modeler.saveXML({ format: true })).xml!;
}

/** Modell als BPMN-Datei herunterladen (Firefox, Kopie, Export). */
async function downloadBpmn() {
  download(files.fileName ?? currentName(), new Blob([await currentXml()], { type: 'application/xml' }));
}

const files = new FilesController(
  {
    t: () => t,
    language: () => language,
    getXml: currentXml,
    load: (xml) => open(xml),
    suggestedName: currentName,
    isDirty: () => dirty,
    markClean: () => {
      dirty = false;
      showFileState();
    },
    download: downloadBpmn,
    changed: () => showFileState(),
  },
  fileNameFor,
);

/** Dateiname, ungespeicherte Änderungen, Sperrhinweis und Dateiliste. */
function showFileState() {
  if (!t) {
    return;
  }
  const name = files.fileName;
  fileLabel.textContent = `${name ?? ''}${dirty ? ' ●' : ''}`;
  fileLabel.title = name ? `${files.folder?.name ?? ''}/${name}` : '';
  fileLabel.classList.toggle('readonly', !!name && files.access !== 'edit');
  renderBanner(banner, files, t);
  renderFilesPanel(filesPanel, files, t);
}

function storedLanguage(): string | undefined {
  try {
    return localStorage.getItem(LANGUAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Zeigt den Namen des Modells (Kollaboration oder Prozess) in Werkzeugleiste und Fenstertitel. */
function showModelName() {
  const name = modelName(modeler?.getDefinitions());
  nameLabel.textContent = name ?? t('app.untitled');
  nameLabel.classList.toggle('untitled', !name);
  document.title = `${name ?? t('app.untitled')} – ${t('app.title')}`;
}

/** Setzt alle festen Texte der Seite mit `data-i18n`. */
function applyStaticTexts(language: string) {
  document.documentElement.lang = language;
  document.title = t('app.title');
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.firstChild!.textContent = t(el.dataset.i18n!);
  });
  languageSelect.innerHTML = SUPPORTED_LANGUAGES.map(
    (lang) => `<option value="${lang}"${lang === language ? ' selected' : ''}>${t(`language.${lang}`)}</option>`,
  ).join('');
}

/**
 * bpmn-js übersetzt nur beim Aufbau. Ein Sprachwechsel baut den Modellierer deshalb neu auf
 * und lädt das aktuelle Modell wieder hinein; Rückgängig beginnt danach von vorn.
 */
async function createModeler(lang: string, xml: string) {
  language = lang;
  t = createI18n(language).t;
  applyStaticTexts(language);
  modeler?.destroy();
  modeler = new Modeler({
    container: '#canvas',
    additionalModules: [
      BpmnPropertiesPanelModule,
      BpmnPropertiesProviderModule,
      bestbpmnModule,
      bestbpmnPropertiesProviderModule,
      translateModule(language),
    ],
    moddleExtensions: bestbpmnModdleExtensions,
    propertiesPanel: { parent: '#properties' },
    bestbpmn: { ...catalog, disabledRules, language, t },
  });
  modeler.on(STATUS_CHANGED, ({ models }: { models: StatusModel[] }) => {
    renderStatusPanel(statusPanel, models, { language, t });
  });
  modeler.on(['import.done', 'commandStack.changed'], () => {
    const definitions = modeler.getDefinitions();
    renderRaciMatrix(raciPanel, definitions ? deriveRaciMatrices(definitions) : [], t, { roles: catalog.roles, language });
    showModelName();
  });
  modeler.on('commandStack.changed', () => {
    if (!dirty) {
      dirty = true;
      showFileState();
    }
  });
  // Ein Neuaufbau (Sprache, Katalog) ändert am Modell nichts.
  const wasDirty = dirty;
  await open(xml);
  dirty = wasDirty;
  showFileState();
  (modeler.get('bestbpmnServiceOverlays') as ServiceOverlays).toggleNames(showServices.checked);
  renderSettings();
}

/** Einstellungen: Prüfregeln gelten sofort, ein geänderter Katalog baut den Modellierer neu auf. */
function renderSettings() {
  renderRulesPanel(rulesPanel, disabledRules, t, (rules) => {
    disabledRules = rules;
    saveDisabledRules(rules);
    (modeler.get('bestbpmnStatusCheck') as StatusCheck).setDisabledRules(rules);
    renderSettings();
  });
  renderCatalogEditor(catalogPanel, {
    t,
    catalog,
    example: EXAMPLE_CATALOG,
    onApply: async (next) => {
      catalog = next;
      saveCatalog(next);
      const { xml } = await modeler.saveXML();
      await createModeler(language, xml);
    },
  });
}

/** Lädt ein Modell; danach gilt es als unverändert. */
async function open(xml: string) {
  try {
    await modeler.importXML(xml);
    modeler.get('canvas').zoom('fit-viewport');
  } catch (error) {
    statusPanel.textContent = t('app.openError', { message: (error as Error).message });
  }
  dirty = false;
  showFileState();
}

/** Ein Modell, das zu keiner Datei im Ordner gehört (neu, Vorlage, hochgeladen, hineingezogen). */
async function openDetached(xml: string | Promise<string>) {
  if (await files.detach()) {
    await open(await xml);
  }
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((other) => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      document.getElementById(other.dataset.tab!)!.hidden = !selected;
    });
    // Die Einstellungen mit dem Katalog brauchen mehr Platz.
    document.querySelector('.sidebar')!.classList.toggle('wide', tab.dataset.tab === 'settings');
  }),
);

showServices.addEventListener('change', () => {
  (modeler.get('bestbpmnServiceOverlays') as ServiceOverlays).toggleNames(showServices.checked);
});

languageSelect.addEventListener('change', async () => {
  const language = languageSelect.value;
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
  }
  const { xml } = await modeler.saveXML();
  await createModeler(language, xml);
});

// Menüs „Neu“ und „Exportieren“: nach der Wahl und bei Klick daneben schließen.
const menus = [...document.querySelectorAll<HTMLDetailsElement>('details.menu')];
document.addEventListener('click', (event) => {
  for (const menu of menus) {
    if (!menu.contains(event.target as Node) || (event.target as Element).closest('.menu-items button')) {
      menu.open = false;
    }
  }
});

document.querySelector('#new')!.addEventListener('click', () => openDetached(EMPTY_DIAGRAM));
document.querySelector('#template')!.addEventListener('click', () => openDetached(template));
document.querySelector('#template-incident')!.addEventListener('click', () => openDetached(incident));
document.querySelector<HTMLInputElement>('#open')!.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) {
    await openDetached(file.text());
  }
});
document.querySelector('#save')!.addEventListener('click', () => files.save());
document.querySelector('#export-bpmn')!.addEventListener('click', downloadBpmn);
document.querySelector('#export-svg')!.addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG();
  download(withExtension(files.fileName ?? currentName(), '.svg'), new Blob([svg], { type: 'image/svg+xml' }));
});
document.querySelector('#export-png')!.addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG();
  download(withExtension(files.fileName ?? currentName(), '.png'), await svgToPng(svg));
});

// Strg+S speichert wie unter Windows gewohnt, statt die Seite herunterzuladen.
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void files.save();
  }
});

// Eine .bpmn-Datei aus dem Explorer auf das Fenster ziehen öffnet sie.
document.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }
});
document.addEventListener('drop', (event) => {
  const file = [...(event.dataTransfer?.files ?? [])].find((item) => /\.(bpmn|xml)$/i.test(item.name));
  if (file) {
    event.preventDefault();
    void openDetached(file.text());
  }
});

// Warnen, bevor ungespeicherte Änderungen verloren gehen; beim Schließen die Sperre freigeben.
window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
  }
});
window.addEventListener('pagehide', () => files.release());

void createModeler(storedLanguage() ?? matchLanguage(navigator.languages), EMPTY_DIAGRAM).then(() => files.restore());
