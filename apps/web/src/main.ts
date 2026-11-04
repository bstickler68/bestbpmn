import Modeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
// Vor den eigenen Stilen, damit styles.css die Farbpalette anpassen kann.
import { COLOR_PICKER, ColorPickerModule } from './colors';
import './styles.css';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { createI18n, matchLanguage, SUPPORTED_LANGUAGES, type TFunction } from '@bestbpmn/i18n';
import { deriveRaciMatrices, parseCatalog, type CatalogFile, type IssueCode, type StatusModel } from '@bestbpmn/model';
import exampleServices from '../../../templates/catalog/services.json';
import exampleStates from '../../../templates/catalog/states.json';
import exampleRoles from '../../../templates/catalog/roles.json';
import { EMPTY_DIAGRAM } from './emptyDiagram';
import {
  fileNameFor,
  modelName,
  singleParticipant,
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
import { fullHtml, profileHtml, type ReportInput } from './report/report';
import { printHtml } from './report/print';
import { handleLaunchedFiles, registerServiceWorker } from './pwa';

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
const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
const undoButton = document.querySelector<HTMLButtonElement>('#undo')!;
const redoButton = document.querySelector<HTMLButtonElement>('#redo')!;
const layout = document.querySelector<HTMLElement>('.layout')!;
const sidebarToggle = document.querySelector<HTMLButtonElement>('#toggle-sidebar')!;
const SIDEBAR_KEY = 'bestbpmn.sidebar';

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
/**
 * Der zuletzt ausgeführte Schritt beim Öffnen oder Speichern. Macht man alles bis dahin rückgängig
 * (oder stellt es wieder her), gilt das Modell wieder als gespeichert.
 */
let savedStep: unknown = null;
/** Nach einem Neuaufbau mit ungespeicherten Änderungen gibt es keinen gespeicherten Schritt mehr. */
const NO_SAVED_STEP = {};

const currentStep = (): unknown => modeler.get('commandStack')._getUndoAction() ?? null;

/** Merkt sich den aktuellen Stand als gespeichert. */
function markSaved() {
  savedStep = currentStep();
  dirty = false;
}

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
    load: (xml, fileName) => open(xml, fileName),
    suggestedName: currentName,
    isDirty: () => dirty,
    markClean: () => {
      markSaved();
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
  // Ungespeicherte Änderungen: Der Speichern-Button wird dezent rot.
  saveButton.classList.toggle('unsaved', dirty);
  saveButton.title = dirty ? t('app.unsaved') : '';
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

// Die Version steht als Hinweis am Namen links oben, für Rückfragen.
document.querySelector<HTMLElement>('.toolbar strong')!.title = `bestbpmn ${__BESTBPMN_VERSION__}`;

/** Setzt alle festen Texte der Seite mit `data-i18n`. */
function applyStaticTexts(language: string) {
  document.documentElement.lang = language;
  document.title = t('app.title');
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.firstChild!.textContent = t(el.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
    el.setAttribute('aria-label', el.title);
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
      ColorPickerModule,
      translateModule(language),
    ],
    moddleExtensions: bestbpmnModdleExtensions,
    propertiesPanel: { parent: '#properties' },
    colorPicker: COLOR_PICKER,
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
    const changed = currentStep() !== savedStep;
    if (changed !== dirty) {
      dirty = changed;
      showFileState();
    }
  });
  modeler.on(['import.done', 'commandStack.changed'], showUndoState);
  // Ein Neuaufbau (Sprache, Katalog) ändert am Modell nichts.
  const wasDirty = dirty;
  await open(xml);
  if (wasDirty) {
    savedStep = NO_SAVED_STEP;
    dirty = true;
  }
  showFileState();
  (modeler.get('bestbpmnServiceOverlays') as ServiceOverlays).toggleNames(showServices.checked);
  renderSettings();
  showSidebar(!layout.classList.contains('sidebar-collapsed'));
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
async function open(xml: string, fileName?: string) {
  try {
    await modeler.importXML(xml);
    nameFromFile(fileName);
    modeler.get('canvas').zoom('fit-viewport');
  } catch (error) {
    statusPanel.textContent = t('app.openError', { message: (error as Error).message });
  }
  markSaved();
  showFileState();
}

/**
 * Hat das Modell keinen Namen, gilt der Dateiname ohne Endung, z. B. `Incident bearbeiten.bpmn`
 * → „Incident bearbeiten“. Der Name kommt ins Modell, ohne dass es als geändert gilt; gespeichert
 * wird er mit der nächsten Änderung.
 */
function nameFromFile(fileName: string | undefined) {
  const name = fileName?.replace(/\.(bpmn20\.xml|bpmn|xml)$/i, '').trim();
  if (!name || modelName(modeler.getDefinitions())) {
    return;
  }
  const root = modeler.get('canvas').getRootElement()?.businessObject;
  if (!root || !(root.$instanceOf('bpmn:Process') || root.$instanceOf('bpmn:Collaboration'))) {
    return;
  }
  root.name = name;
  // Bei nur einem Pool heißt der Prozess wie das Modell, wie beim Umbenennen im Panel.
  const process = singleParticipant(root)?.processRef;
  if (process && !process.name) {
    process.name = name;
  }
  showModelName();
}

/** Rückgängig und Wiederherstellen sind nur aktiv, wenn es etwas zurückzunehmen gibt. */
function showUndoState() {
  const commandStack = modeler.get('commandStack');
  undoButton.disabled = !commandStack.canUndo();
  redoButton.disabled = !commandStack.canRedo();
}

/** Ein Modell, das zu keiner Datei im Ordner gehört (neu, hochgeladen, hineingezogen). */
async function openDetached(xml: string | Promise<string>, fileName?: string) {
  if (await files.detach()) {
    await open(await xml, fileName);
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

// Menüs „Exportieren“ und „Bericht“: nach der Wahl und bei Klick daneben schließen.
const menus = [...document.querySelectorAll<HTMLDetailsElement>('details.menu')];
document.addEventListener('click', (event) => {
  for (const menu of menus) {
    if (!menu.contains(event.target as Node) || (event.target as Element).closest('.menu-items button')) {
      menu.open = false;
    }
  }
});

document.querySelector('#new')!.addEventListener('click', () => openDetached(EMPTY_DIAGRAM));
document.querySelector<HTMLInputElement>('#open')!.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) {
    await openDetached(file.text(), file.name);
  }
});
saveButton.addEventListener('click', () => files.save());
undoButton.addEventListener('click', () => modeler.get('commandStack').undo());
redoButton.addEventListener('click', () => modeler.get('commandStack').redo());

/** Eigenschaftenbereich auf- und zuklappen, für kleine Bildschirme. Der Zustand bleibt im Browser. */
function showSidebar(open: boolean) {
  layout.classList.toggle('sidebar-collapsed', !open);
  sidebarToggle.setAttribute('aria-expanded', String(open));
  sidebarToggle.textContent = open ? '⟩' : '⟨';
  sidebarToggle.title = t(open ? 'app.hideSidebar' : 'app.showSidebar');
  modeler.get('canvas').resized();
}
sidebarToggle.addEventListener('click', () => {
  const open = layout.classList.contains('sidebar-collapsed');
  showSidebar(open);
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed');
  } catch {
    // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
  }
});
document.querySelector('#export-bpmn')!.addEventListener('click', downloadBpmn);
document.querySelector('#export-svg')!.addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG();
  download(withExtension(files.fileName ?? currentName(), '.svg'), new Blob([svg], { type: 'image/svg+xml' }));
});
document.querySelector('#export-png')!.addEventListener('click', async () => {
  const { svg } = await modeler.saveSVG();
  download(withExtension(files.fileName ?? currentName(), '.png'), await svgToPng(svg));
});

// Berichte: Steckbrief und Gesamtdokument, als HTML-Datei oder über den Druckdialog (PDF).
async function reportInput(full: boolean): Promise<ReportInput> {
  return {
    t,
    language,
    definitions: modeler.getDefinitions(),
    fileName: files.fileName,
    roles: catalog.roles,
    ...(full
      ? {
          svg: (await modeler.saveSVG()).svg as string,
          statusModels: (modeler.get('bestbpmnStatusCheck') as StatusCheck).getModels(),
        }
      : {}),
  };
}

async function report(kind: 'profile' | 'full', target: 'html' | 'print') {
  const input = await reportInput(kind === 'full');
  const html = kind === 'full' ? fullHtml(input) : profileHtml(input);
  const suffix = t(kind === 'full' ? 'report.fileFull' : 'report.fileProfile');
  const base = withExtension(files.fileName ?? currentName(), '');
  if (target === 'html') {
    download(`${base}-${suffix}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
  } else {
    await printHtml(html, `${base}-${suffix}`);
  }
}

document.querySelector('#report-profile-print')!.addEventListener('click', () => report('profile', 'print'));
document.querySelector('#report-full-print')!.addEventListener('click', () => report('full', 'print'));
document.querySelector('#report-profile-html')!.addEventListener('click', () => report('profile', 'html'));
document.querySelector('#report-full-html')!.addEventListener('click', () => report('full', 'html'));

/** Eingabefelder (z. B. im Eigenschaftenpanel) behalten ihr eigenes Rückgängig. */
const isTextInput = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));

// Strg+S speichert wie unter Windows gewohnt, statt die Seite herunterzuladen.
// Strg+Z und Strg+Y (oder Strg+Umschalt+Z) gelten auch, wenn das Diagramm nicht im Fokus ist.
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 's') {
    event.preventDefault();
    void files.save();
    return;
  }
  // Hat das Diagramm die Taste schon verarbeitet, nicht noch einmal ausführen.
  if (event.defaultPrevented || isTextInput(event.target) || (key !== 'z' && key !== 'y')) {
    return;
  }
  event.preventDefault();
  const commandStack = modeler.get('commandStack');
  if (key === 'y' || event.shiftKey) {
    commandStack.redo();
  } else {
    commandStack.undo();
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
    void openDetached(file.text(), file.name);
  }
});

// Warnen, bevor ungespeicherte Änderungen verloren gehen; beim Schließen die Sperre freigeben.
window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
  }
});
window.addEventListener('pagehide', () => files.release());

function storedSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
  } catch {
    return true;
  }
}

layout.classList.toggle('sidebar-collapsed', !storedSidebar());
void createModeler(storedLanguage() ?? matchLanguage(navigator.languages), EMPTY_DIAGRAM).then(() => {
  handleLaunchedFiles((text, fileName) => void openDetached(text, fileName));
  registerServiceWorker(document.querySelector<HTMLElement>('#update')!, () => t);
  return files.restore();
});
