import i18next, { type i18n, type TFunction } from 'i18next';
import de from './locales/de.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

/**
 * Systemtexte von bestbpmn. Die JSON-Dateien unter `locales/` sind die einzige Quelle;
 * Modellierer und Oberfläche lesen dieselben Dateien.
 */
export const resources = {
  en: { translation: en },
  de: { translation: de },
} as const;

export type SupportedLanguage = keyof typeof resources;
export const SUPPORTED_LANGUAGES = Object.keys(resources) as SupportedLanguage[];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/** Wählt aus den bevorzugten Sprachen (z. B. `navigator.languages`) die erste unterstützte. */
export function matchLanguage(preferred: readonly string[] | undefined): SupportedLanguage {
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split('-')[0];
    if (SUPPORTED_LANGUAGES.includes(base as SupportedLanguage)) {
      return base as SupportedLanguage;
    }
  }
  return DEFAULT_LANGUAGE;
}

/** Erzeugt eine eigene i18next-Instanz, sofort einsatzbereit. Fehlt ein Text, gilt Englisch. */
export function createI18n(language: string): i18n {
  const instance = i18next.createInstance();
  void instance.init({
    initAsync: false,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    resources,
    interpolation: { escapeValue: false },
  });
  return instance;
}

export type { i18n, TFunction };
