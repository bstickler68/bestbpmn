import type { ModdleElement } from '../states/types.js';

type El = ModdleElement & Record<string, any>;

/** Sprachen, die bestbpmn von Anfang an unterstützt. Englisch ist die Standardsprache. */
export const SUPPORTED_LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number] | (string & {});
export const DEFAULT_LANGUAGE: Language = 'en';

/** Text eines Elements in einer Sprache. */
export interface TranslatedText {
  name?: string;
  documentation?: string;
}

/** Hauptsprache eines Modells (`bestadd:language` an `bpmn:definitions`), sonst Englisch. */
export function modelLanguage(definitions: ModdleElement | undefined): Language {
  return ((definitions as El | undefined)?.language as string | undefined) || DEFAULT_LANGUAGE;
}

function extensionValues(element: ModdleElement | undefined): El[] {
  return (((element as El | undefined)?.extensionElements?.values ?? []) as El[]);
}

/** Übersetzungen eines Elements je Sprache, ohne die Hauptsprache (die steht in `name` und `documentation`). */
export function readTranslations(element: ModdleElement): Record<string, TranslatedText> {
  const container = extensionValues(element).find((v) => v.$type === 'bestadd:Translations');
  return toRecord((container?.translations ?? []) as El[]);
}

/**
 * Übersetzte Statusnamen je Schlüssel, gepflegt einmal am DataObject (`bestadd:states`).
 * Ergebnis: `{ in_review: { en: 'In review' } }`.
 */
export function readStateTranslations(dataObject: ModdleElement | undefined): Record<string, Record<string, string>> {
  const container = extensionValues(dataObject).find((v) => v.$type === 'bestadd:States');
  const result: Record<string, Record<string, string>> = {};
  for (const state of (container?.states ?? []) as El[]) {
    if (!state.key) {
      continue;
    }
    const names: Record<string, string> = {};
    for (const [lang, text] of Object.entries(toRecord((state.translations ?? []) as El[]))) {
      if (text.name) {
        names[lang] = text.name;
      }
    }
    result[state.key] = names;
  }
  return result;
}

/**
 * Wählt den Text für eine Sprache: die Übersetzung, sonst den Text der Hauptsprache.
 * So bleibt ein Element lesbar, auch wenn eine Übersetzung fehlt.
 */
export function localize(
  original: string | undefined,
  translations: Record<string, string | undefined> | undefined,
  language: Language,
): string | undefined {
  return translations?.[language] || original;
}

function toRecord(translations: El[]): Record<string, TranslatedText> {
  const result: Record<string, TranslatedText> = {};
  for (const t of translations) {
    if (!t.lang) {
      continue;
    }
    result[t.lang] = {
      ...(t.name ? { name: t.name } : {}),
      ...(t.documentation ? { documentation: t.documentation } : {}),
    };
  }
  return result;
}

/** Liefert einen sprachabhängigen Text; fehlt die Sprache, gilt Englisch, dann der erste vorhandene. */
export function pickText(text: string | Record<string, string> | undefined, language: Language): string | undefined {
  if (text === undefined || typeof text === 'string') {
    return text;
  }
  return text[language] ?? text[DEFAULT_LANGUAGE] ?? Object.values(text)[0];
}
