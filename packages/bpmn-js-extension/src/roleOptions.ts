import { catalogLabel, findRole, formatAssignee, type Assignee, type RoleDefinition } from '@bestbpmn/model';
import type { BestbpmnI18n } from './i18n';

export interface RoleOption {
  value: string;
  label: string;
}

/**
 * Auswahl aus der Rollen- und Gruppentabelle. Wert ist die Schreibweise `group(id)` bzw. `role(id)`.
 * Vorhandene Zuordnungen, die die Tabelle nicht kennt (z. B. `initiator()`), bleiben als eigene Einträge sichtbar.
 */
export function roleOptions(roles: RoleDefinition[], current: Assignee[], i18n: BestbpmnI18n): RoleOption[] {
  const { t, language } = i18n;
  const options: RoleOption[] = roles.map((role) => ({
    value: formatAssignee({ kind: role.kind, ref: role.id }),
    label: `${catalogLabel(role, language)} (${t(`lane.kind.${role.kind}`)})`,
  }));
  for (const assignee of current) {
    if (!findRole(roles, assignee)) {
      const value = formatAssignee(assignee);
      options.push({ value, label: t('panel.notInCatalog', { name: value }) });
    }
  }
  return options;
}

/** Texte des Suchfelds in der Sprache der Oberfläche. */
export function pickerTexts(i18n: BestbpmnI18n) {
  const { t } = i18n;
  return {
    placeholder: t('picker.placeholder'),
    noResults: t('picker.noResults'),
    remove: (name: string) => t('picker.remove', { name }),
  };
}
