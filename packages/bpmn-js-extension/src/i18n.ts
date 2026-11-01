import { createI18n, DEFAULT_LANGUAGE, type TFunction } from '@bestbpmn/i18n';
import panelGerman from '@bestbpmn/i18n/locales/bpmn-de.json';
import bpmnGerman from 'bpmn-js-i18n/translations/de';

/** Sprache und Übersetzungsfunktion des Modellierers. */
export interface BestbpmnI18n {
  language: string;
  t: TFunction;
}

/** Liest Sprache und `t` aus der Konfiguration; ohne Angabe gilt Englisch. */
export function resolveI18n(config: { language?: string; t?: TFunction } | undefined): BestbpmnI18n {
  const language = config?.language ?? DEFAULT_LANGUAGE;
  return { language, t: config?.t ?? createI18n(language).t };
}

const DICTIONARIES: Record<string, Record<string, string>> = {
  de: { ...bpmnGerman, ...panelGerman },
  en: { Participant: 'Pool' },
};

/**
 * Übersetzungsdienst für bpmn-js und das Eigenschaftenpanel. bpmn-js übersetzt seine englischen
 * Texte selbst über `translate`; Deutsch kommt aus bpmn-js-i18n (MIT) und eigenen Ergänzungen.
 */
export function translateModule(language: string) {
  const dictionary = DICTIONARIES[language] ?? {};
  const translate = (template: string, replacements: Record<string, string> = {}) =>
    (dictionary[template] ?? template).replace(/{([^}]+)}/g, (_, key) => replacements[key] ?? `{${key}}`);
  return { translate: ['value', translate] };
}
