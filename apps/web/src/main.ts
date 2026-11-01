import Modeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import './styles.css';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { createI18n, matchLanguage, SUPPORTED_LANGUAGES, type TFunction } from '@bestbpmn/i18n';
import { deriveRaciMatrices, type RoleDefinition, type StatusDefinition, type StatusModel } from '@bestbpmn/model';
import services from '../../../templates/catalog/services.json';
import states from '../../../templates/catalog/states.json';
import roles from '../../../templates/catalog/roles.json';
import incident from '../../../templates/processes/incident.bpmn?raw';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import { EMPTY_DIAGRAM } from './emptyDiagram';
import {
  fileNameFor,
  modelName,
  praxiqModdleExtensions,
  praxiqModule,
  praxiqPropertiesProviderModule,
  STATUS_CHANGED,
  translateModule,
  type ServiceOverlays,
} from '@bestbpmn/bpmn-js-extension';
import { renderRaciMatrix } from './raciMatrix';
import { renderStatusPanel } from './statusPanel';

const LANGUAGE_KEY = 'bestbpmn.language';
const statusPanel = document.querySelector<HTMLElement>('#status')!;
const raciPanel = document.querySelector<HTMLElement>('#raci')!;
const languageSelect = document.querySelector<HTMLSelectElement>('#language')!;
const showServices = document.querySelector<HTMLInputElement>('#show-services')!;
const nameLabel = document.querySelector<HTMLElement>('#model-name')!;

let modeler: any;
let t: TFunction;

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
async function createModeler(language: string, xml: string) {
  t = createI18n(language).t;
  applyStaticTexts(language);
  modeler?.destroy();
  modeler = new Modeler({
    container: '#canvas',
    additionalModules: [
      BpmnPropertiesPanelModule,
      BpmnPropertiesProviderModule,
      praxiqModule,
      praxiqPropertiesProviderModule,
      translateModule(language),
    ],
    moddleExtensions: praxiqModdleExtensions,
    propertiesPanel: { parent: '#properties' },
    // Bis zum Backend kommen Service-Katalog, Status-, Rollen- und Gruppentabelle aus Dateien im Repo (ADR 0009, 0012, 0013).
    praxiq: { services, states: states as StatusDefinition[], roles: roles as RoleDefinition[], language, t },
  });
  modeler.on(STATUS_CHANGED, ({ models }: { models: StatusModel[] }) => {
    renderStatusPanel(statusPanel, models, { language, t });
  });
  modeler.on(['import.done', 'commandStack.changed'], () => {
    const definitions = modeler.getDefinitions();
    renderRaciMatrix(raciPanel, definitions ? deriveRaciMatrices(definitions) : [], t, { roles: roles as RoleDefinition[], language });
    showModelName();
  });
  await open(xml);
  (modeler.get('praxiqServiceOverlays') as ServiceOverlays).toggleNames(showServices.checked);
}

async function open(xml: string) {
  try {
    await modeler.importXML(xml);
    modeler.get('canvas').zoom('fit-viewport');
  } catch (error) {
    statusPanel.textContent = t('app.openError', { message: (error as Error).message });
  }
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((other) => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      document.getElementById(other.dataset.tab!)!.hidden = !selected;
    });
  }),
);

showServices.addEventListener('change', () => {
  (modeler.get('praxiqServiceOverlays') as ServiceOverlays).toggleNames(showServices.checked);
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

document.querySelector('#new')!.addEventListener('click', () => open(EMPTY_DIAGRAM));
document.querySelector('#template')!.addEventListener('click', () => open(template));
document.querySelector('#template-incident')!.addEventListener('click', () => open(incident));
document.querySelector<HTMLInputElement>('#open')!.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    await open(await file.text());
  }
});
document.querySelector('#save')!.addEventListener('click', async () => {
  const { xml } = await modeler.saveXML({ format: true });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([xml!], { type: 'application/xml' }));
  link.download = fileNameFor(modelName(modeler.getDefinitions()));
  link.click();
  URL.revokeObjectURL(link.href);
});

void createModeler(storedLanguage() ?? matchLanguage(navigator.languages), template);
