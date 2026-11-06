import { h } from '@bpmn-io/properties-panel/preact';
import { CheckboxEntry, isCheckboxEntryEdited, isTextAreaEntryEdited, TextAreaEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { allowedRuleKinds, RULE_KINDS, type RuleKind } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { findRules, ruleKindsOf, UPDATE_RULES } from './rules';
import { is, type DiagramElement } from './util';

// Nach den Zusatzattributen, damit „Regeln“ am Ende steht.
const LOW_PRIORITY = 350;

/**
 * Gruppe „Regeln“ an Aktivitäten: Kennzeichen als Checkboxen und eine Beschreibung in Worten.
 * Aufgaben, die niemand abschließt, bieten nur Start- und Folgeaktionen an; ein dort schon gesetztes
 * anderes Kennzeichen bleibt sichtbar, damit man es abwählen kann.
 */
export default class RulesPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn'];

  private i18n: BestbpmnI18n;

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined) {
    this.i18n = resolveI18n(config);
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      if (!is(bo, 'bpmn:Activity')) {
        return groups;
      }
      const { t } = this.i18n;
      const allowed = allowedRuleKinds(bo as any);
      const set = ruleKindsOf(bo);
      const shown = RULE_KINDS.filter((kind) => allowed.includes(kind) || set.includes(kind));
      const entries: any[] = shown.map((kind) => ({
        id: `bestbpmn-rules-${kind}`,
        component: KindEntry,
        isEdited: isCheckboxEntryEdited,
        kind,
        label: t(`ruleKind.${kind}`),
      }));
      if (allowed.length < RULE_KINDS.length) {
        entries.unshift({ id: 'bestbpmn-rules-hint', component: Hint, text: t('panel.rulesOnlyActions') });
      }
      entries.push({ id: 'bestbpmn-rules-description', component: DescriptionEntry, isEdited: isTextAreaEntryEdited, i18n: this.i18n });
      groups.push({ id: 'bestbpmn-rules', label: t('panel.rules'), entries });
      return groups;
    };
  }
}

function KindEntry(props: { element: DiagramElement; id: string; kind: RuleKind; label: string }) {
  const { element, id, kind, label } = props;
  const commandStack = useService('commandStack');
  return h(CheckboxEntry, {
    element,
    id,
    label,
    getValue: () => ruleKindsOf(element.businessObject).includes(kind),
    setValue: (checked: boolean) => {
      const current = ruleKindsOf(element.businessObject);
      const kinds = checked ? [...current, kind] : current.filter((k) => k !== kind);
      commandStack.execute(UPDATE_RULES, { element, kinds });
    },
  });
}

function DescriptionEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const commandStack = useService('commandStack');
  const debounce = useService('debounceInput');
  return h(TextAreaEntry, {
    element,
    id,
    label: i18n.t('panel.rulesDescription'),
    description: i18n.t('panel.rulesDescriptionHint'),
    debounce,
    rows: 4,
    getValue: () => findRules(element.businessObject)?.description ?? '',
    setValue: (value: string) => commandStack.execute(UPDATE_RULES, { element, description: value ?? '' }),
  });
}

function Hint(props: { id: string; text: string }) {
  return h('div', { class: 'bio-properties-panel-description bestbpmn-empty', 'data-entry-id': props.id }, props.text);
}
