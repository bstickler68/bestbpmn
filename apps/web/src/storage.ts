import {
  DEFAULT_RULE_PROFILE,
  disabledRulesOf,
  isIssueCode,
  parseCatalog,
  serializeCatalog,
  type CatalogFile,
  type IssueCode,
} from '@bestbpmn/model';

const CATALOG_KEY = 'bestbpmn.catalog';
const RULES_KEY = 'bestbpmn.rules';

/** Liest einen Wert aus dem Browser-Speicher; ohne Speicher (z. B. gesperrt) gibt es nichts. */
function read(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: string | undefined): void {
  try {
    if (value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ohne Speicher gilt die Einstellung nur bis zum Neuladen.
  }
}

/** Der eigene Katalog dieses Browsers. Ohne gespeicherten Katalog: leer, also Freitext. */
export function loadCatalog(): CatalogFile {
  const text = read(CATALOG_KEY);
  return text ? parseCatalog(text).catalog : {};
}

export function saveCatalog(catalog: CatalogFile): void {
  const text = serializeCatalog(catalog);
  write(CATALOG_KEY, text.trim() === '{}' ? undefined : text);
}

/** Die abgeschalteten Prüfregeln. Standard ist das Profil „Dokumentieren“. */
export function loadDisabledRules(): IssueCode[] {
  const text = read(RULES_KEY);
  if (!text) {
    return disabledRulesOf(DEFAULT_RULE_PROFILE);
  }
  try {
    const value = JSON.parse(text) as { disabled?: unknown };
    return Array.isArray(value.disabled) ? value.disabled.filter(isIssueCode) : disabledRulesOf(DEFAULT_RULE_PROFILE);
  } catch {
    return disabledRulesOf(DEFAULT_RULE_PROFILE);
  }
}

export function saveDisabledRules(disabled: IssueCode[]): void {
  write(RULES_KEY, JSON.stringify({ disabled }));
}
