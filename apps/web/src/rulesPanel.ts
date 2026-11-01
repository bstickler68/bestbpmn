import type { TFunction } from '@bestbpmn/i18n';
import { disabledRulesOf, ISSUE_CODES, matchRuleProfile, RULE_PROFILES, type IssueCode, type RuleProfile } from '@bestbpmn/model';

const PROFILES = Object.keys(RULE_PROFILES) as RuleProfile[];

/**
 * Einstellungen der Prüfregeln: ein Profil zur Auswahl und darunter jede Regel einzeln.
 * Wer eine Regel ändert, landet bei „Eigene Auswahl“, solange die Auswahl zu keinem Profil passt.
 */
export function renderRulesPanel(
  container: HTMLElement,
  disabled: IssueCode[],
  t: TFunction,
  onChange: (disabled: IssueCode[]) => void,
): void {
  const off = new Set(disabled);
  const profile = matchRuleProfile(off) ?? 'custom';
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = t('rules.title');

  const label = document.createElement('label');
  label.className = 'settings-row';
  label.textContent = `${t('rules.profile')} `;
  const select = document.createElement('select');
  select.id = 'rule-profile';
  for (const value of [...PROFILES, 'custom']) {
    const option = new Option(t(`rules.profiles.${value}`), value, false, value === profile);
    option.disabled = value === 'custom' && profile !== 'custom';
    select.add(option);
  }
  select.addEventListener('change', () => {
    if (select.value !== 'custom') {
      onChange(disabledRulesOf(select.value as RuleProfile));
    }
  });
  label.append(select);

  const hint = document.createElement('p');
  hint.className = 'settings-hint';
  hint.textContent = t(`rules.profileHint.${profile}`);

  const list = document.createElement('ul');
  list.className = 'rule-list';
  for (const code of ISSUE_CODES) {
    const item = document.createElement('li');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = `rule-${code}`;
    box.dataset.rule = code;
    box.checked = !off.has(code);
    box.addEventListener('change', () => {
      onChange(ISSUE_CODES.filter((c) => (c === code ? !box.checked : off.has(c))));
    });
    const text = document.createElement('label');
    text.htmlFor = box.id;
    text.textContent = t(`rules.rule.${code}`);
    item.append(box, text);
    list.append(item);
  }
  container.append(heading, label, hint, list);
}
