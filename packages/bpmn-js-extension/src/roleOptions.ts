import { catalogLabel, findRole, formatAssignee, type Assignee, type RoleDefinition } from '@bestbpmn/model';
import type { BestbpmnI18n } from './i18n';

export interface RoleOption {
  value: string;
  label: string;
}

/**
 * Auswahl für Rollen und Gruppen. Wert ist die Schreibweise `group(id)` bzw. `role(id)`.
 * Zuerst kommen die Einträge des Katalogs, dann Rollen und Gruppen, die im Modell schon vorkommen,
 * damit man sie beim nächsten Mal nicht neu tippen muss. Vorhandene Zuordnungen anderer Art
 * (z. B. `initiator()`) bleiben als eigene Einträge sichtbar.
 */
export function roleOptions(
  roles: RoleDefinition[],
  current: Assignee[],
  i18n: BestbpmnI18n,
  used: Assignee[] = [],
): RoleOption[] {
  const { t, language } = i18n;
  const options: RoleOption[] = roles.map((role) => ({
    value: formatAssignee({ kind: role.kind, ref: role.id }),
    label: `${catalogLabel(role, language)} (${t(`lane.kind.${role.kind}`)})`,
  }));
  for (const assignee of [...used, ...current]) {
    const value = formatAssignee(assignee);
    if (findRole(roles, assignee) || options.some((o) => o.value === value)) {
      continue;
    }
    options.push({ value, label: assigneeLabel(assignee, roles, i18n) });
  }
  return options;
}

/** Anzeige einer Zuordnung, die der Katalog nicht kennt: `Einkauf (Gruppe)` oder die Schreibweise. */
function assigneeLabel(assignee: Assignee, roles: RoleDefinition[], i18n: BestbpmnI18n): string {
  const { t } = i18n;
  if (assignee.kind !== 'group' && assignee.kind !== 'role') {
    return formatAssignee(assignee);
  }
  const label = `${assignee.ref} (${t(`lane.kind.${assignee.kind}`)})`;
  // Mit Rollen- und Gruppentabelle fällt auf, was dort fehlt; ohne Tabelle ist Freitext der Normalfall.
  return roles.length ? t('panel.notInCatalog', { name: label }) : label;
}

/** Freitext: aus „Einkauf“ wird wahlweise die Gruppe `group(Einkauf)` oder die Rolle `role(Einkauf)`. */
export function customRoleOptions(i18n: BestbpmnI18n) {
  return (query: string): RoleOption[] => {
    const name = cleanName(query);
    if (!name) {
      return [];
    }
    return (['group', 'role'] as const).map((kind) => ({
      value: formatAssignee({ kind, ref: name }),
      label: i18n.t(`picker.add.${kind}`, { name }),
    }));
  };
}

/** Klammern und Kommas trennen in der Schreibweise `group(…)` die Teile und sind im Namen nicht erlaubt. */
export function cleanName(text: string): string {
  return text.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Texte des Suchfelds in der Sprache der Oberfläche. */
export function pickerTexts(i18n: BestbpmnI18n, kind: 'role' | 'status' = 'role') {
  const { t } = i18n;
  return {
    placeholder: t(kind === 'status' ? 'picker.statusPlaceholder' : 'picker.placeholder'),
    noResults: t('picker.noResults'),
    remove: (name: string) => t('picker.remove', { name }),
  };
}
