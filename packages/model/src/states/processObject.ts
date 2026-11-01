import type { Language } from '../i18n/translations.js';

/**
 * Nur das Datenobjekt mit diesem Namen trägt den Status des Vorgangs (ADR 0012).
 * Andere Datenobjekte sind erlaubt, haben aber keinen Status.
 */
export const PROCESS_OBJECT_NAMES: Record<string, string> = { en: 'process', de: 'Prozess' };

/** Name des Status-Datenobjekts in der Hauptsprache des Modells. */
export function processObjectName(language: Language): string {
  return PROCESS_OBJECT_NAMES[language] ?? PROCESS_OBJECT_NAMES.en!;
}

/** Ist das der Name des Status-Datenobjekts, in irgendeiner unterstützten Sprache? Groß-/Kleinschreibung egal. */
export function isProcessObjectName(name: string | undefined | null): boolean {
  return canonicalProcessObjectName(name) !== undefined;
}

/** Die korrekte Schreibweise, z. B. `prozess` → `Prozess`; sonst `undefined`. */
export function canonicalProcessObjectName(name: string | undefined | null): string | undefined {
  const lower = name?.trim().toLowerCase();
  return lower ? Object.values(PROCESS_OBJECT_NAMES).find((n) => n.toLowerCase() === lower) : undefined;
}
