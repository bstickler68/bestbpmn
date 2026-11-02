import {
  DEFAULT_RULE_PROFILE,
  disabledRulesOf,
  isIssueCode,
  matchRuleProfile,
  parseCatalog,
  RULE_PROFILES,
  serializeCatalog,
  type CatalogFile,
  type IssueCode,
  type RuleProfile,
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

/** Das Profil „Dokumentieren“ bis v0.1.0, gespeichert nur als Liste ohne Profilnamen. */
const LEGACY_DOCUMENT_RULES = ['lane-without-role', 'raci-missing-responsible'].join();

/**
 * Die abgeschalteten Prüfregeln. Standard ist das Profil „Dokumentieren“. Ist ein Profil gespeichert,
 * gilt dessen aktuelle Liste, damit neue Prüfregeln dem Profil folgen.
 */
export function loadDisabledRules(): IssueCode[] {
  const text = read(RULES_KEY);
  if (!text) {
    return disabledRulesOf(DEFAULT_RULE_PROFILE);
  }
  try {
    const value = JSON.parse(text) as { profile?: unknown; disabled?: unknown };
    if (typeof value.profile === 'string' && value.profile in RULE_PROFILES) {
      return disabledRulesOf(value.profile as RuleProfile);
    }
    if (!Array.isArray(value.disabled)) {
      return disabledRulesOf(DEFAULT_RULE_PROFILE);
    }
    const disabled = value.disabled.filter(isIssueCode);
    return [...disabled].sort().join() === LEGACY_DOCUMENT_RULES ? disabledRulesOf('document') : disabled;
  } catch {
    return disabledRulesOf(DEFAULT_RULE_PROFILE);
  }
}

export function saveDisabledRules(disabled: IssueCode[]): void {
  const profile = matchRuleProfile(disabled);
  write(RULES_KEY, JSON.stringify(profile ? { profile, disabled } : { disabled }));
}
