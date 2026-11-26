/**
 * Verzeichnisse, deren Schlüssel aus dem Modell oder einer Datei stammen (Status, Rollen, Sprachen),
 * haben keinen Prototyp. So sind Schlüssel wie `constructor`, `toString` oder `__proto__` gewöhnliche
 * Einträge: Sie liefern nichts Geerbtes und verändern kein Objekt (Schutz vor Prototype Pollution).
 */
export function dict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** Liest nur eigene Einträge; Geerbtes wie `constructor` gilt als nicht vorhanden. */
export function own<T>(record: Partial<Record<string, T>> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}
