const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * Erzeugt aus einem Statusnamen einen sprachneutralen technischen Schlüssel:
 * `In Prüfung` → `in_pruefung`. Der Modellierer setzt ihn einmal; danach bleibt er fest.
 */
export function stateKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
