/**
 * Beschriftung einer DataObject-Referenz in der Schreibweise des Zielbilds: `Vorgang [Offen]`; der Teil in Klammern ist der Status.
 */
export interface StateLabel {
  object: string;
  state?: string;
}

const LABEL = /^\s*(.*?)\s*\[\s*([^\]]*?)\s*\]\s*$/;

/** Zerlegt `Vorgang [Offen]` in Objekt und Zustand. Ohne Klammer gibt es nur das Objekt. */
export function parseStateLabel(label: string | undefined | null): StateLabel | null {
  if (label == null) {
    return null;
  }
  const trimmed = label.trim();
  if (trimmed === '') {
    return null;
  }
  const match = LABEL.exec(trimmed);
  if (!match) {
    return { object: trimmed };
  }
  const object = match[1] ?? '';
  const state = match[2] ?? '';
  return state === '' ? { object } : { object, state };
}

/** Setzt Objekt und Zustand wieder zur Beschriftung zusammen. */
export function formatStateLabel(object: string, state?: string): string {
  return state ? `${object} [${state}]` : object;
}
