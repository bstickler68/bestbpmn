import { h } from '@bpmn-io/properties-panel/preact';
import {
  isSelectEntryEdited,
  isTextAreaEntryEdited,
  isTextFieldEntryEdited,
  SelectEntry,
  TextAreaEntry,
  TextFieldEntry,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { modelLanguage, SUPPORTED_LANGUAGES } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { findTranslation, findTranslations, UPDATE_TRANSLATION } from './translations';
import { processOfRoot } from './processRoot';
import { is, type BusinessObject, type DiagramElement } from './util';

const LOW_PRIORITY = 450;

/**
 * Übersetzungen im Eigenschaftenpanel. Namen und Beschreibungen stehen in der
 * Hauptsprache des Modells in BPMN selbst; hier werden die übrigen Sprachen gepflegt.
 * Status werden in der Statustabelle übersetzt, nicht im Modell.
 */
export default class TranslationsPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn', 'bpmnjs'];

  private i18n: BestbpmnI18n;

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined, private bpmnjs: any) {
    this.i18n = resolveI18n(config);
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      const definitions = this.bpmnjs.getDefinitions();
      const main = modelLanguage(definitions);
      const others = SUPPORTED_LANGUAGES.filter((lang) => lang !== main);
      const { t } = this.i18n;

      const entries: any[] = [];
      if (is(bo, 'bpmn:Process') || is(bo, 'bpmn:Collaboration')) {
        entries.push({
          id: 'bestbpmn-model-language',
          component: ModelLanguageEntry,
          definitions,
          i18n: this.i18n,
          isEdited: isSelectEntryEdited,
        });
      }
      // Ein Prozess mit Swimlanes ist eine Collaboration mit einem Pool; übersetzt wird der Prozess.
      const target = is(bo, 'bpmn:Participant') ? bo.processRef : (processOfRoot(bo) ?? bo);
      if (target && (is(target, 'bpmn:FlowNode') || is(target, 'bpmn:Process'))) {
        for (const lang of others) {
          const language = t(`language.${lang}`);
          entries.push(
            {
              id: `bestbpmn-translation-${lang}-name`,
              component: TranslationEntry,
              target,
              lang,
              field: 'name',
              label: t('panel.name', { language }),
              isEdited: isTextFieldEntryEdited,
            },
            {
              id: `bestbpmn-translation-${lang}-documentation`,
              component: TranslationEntry,
              target,
              lang,
              field: 'documentation',
              label: t('panel.documentation', { language }),
              isEdited: isTextAreaEntryEdited,
            },
          );
        }
      }
      if (entries.length) {
        groups.push({ id: 'bestbpmn-translations', label: t('panel.translations'), entries });
      }
      return groups;
    };
  }
}

function TranslationEntry(props: {
  element: DiagramElement;
  id: string;
  target: BusinessObject;
  lang: string;
  field: 'name' | 'documentation';
  label: string;
}) {
  const { element, id, target, lang, field, label } = props;
  const commandStack = useService('commandStack');
  const debounce = useService('debounceInput');
  const entry = {
    element,
    id,
    label,
    debounce,
    getValue: () => findTranslation(findTranslations(target)?.translations, lang)?.[field] ?? '',
    setValue: (value: string) =>
      commandStack.execute(UPDATE_TRANSLATION, { element, target, lang, [field]: value ?? '' }),
  };
  return field === 'documentation' ? h(TextAreaEntry, { ...entry, rows: 4 }) : h(TextFieldEntry, entry);
}

function ModelLanguageEntry(props: { element: DiagramElement; id: string; definitions: BusinessObject; i18n: BestbpmnI18n }) {
  const { element, id, definitions, i18n } = props;
  const modeling = useService('modeling');
  return h(SelectEntry, {
    element,
    id,
    label: i18n.t('panel.modelLanguage'),
    description: i18n.t('panel.modelLanguageDescription'),
    getValue: () => modelLanguage(definitions),
    setValue: (language: string) => modeling.updateModdleProperties(element, definitions, { language }),
    getOptions: () => SUPPORTED_LANGUAGES.map((lang) => ({ value: lang, label: i18n.t(`language.${lang}`) })),
  });
}
