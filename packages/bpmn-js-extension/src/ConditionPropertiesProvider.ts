import { h } from '@bpmn-io/properties-panel/preact';
import { isSelectEntryEdited, isTextFieldEntryEdited, SelectEntry, TextFieldEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { catalogLabel, parseResultCondition, resultCondition, resultsForFlow, type StatusDefinition, type StatusModel } from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { is, type BusinessObject, type DiagramElement } from './util';

const LOW_PRIORITY = 550;
const CUSTOM = '__custom';

/** Quellen, nach denen ein Sequenzfluss eine Bedingung haben kann (BPMN 2.0). */
function canHaveCondition(source: BusinessObject | undefined): boolean {
  return is(source, 'bpmn:ExclusiveGateway') || is(source, 'bpmn:InclusiveGateway') || is(source, 'bpmn:Activity');
}

/**
 * Bedingung am Sequenzfluss: Auswahl aus den Ergebnissen der Aufgabe davor, geschrieben als
 * `${result == 'key'}`, oder ein eigener Ausdruck für Feldwerte. Direkt an einer Aufgabe zeichnet
 * bpmn-js dann die kleine Raute; nach einem Gateway sieht ein bedingter Weg aus wie ein normaler.
 */
export default class ConditionPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn', 'injector'];

  private i18n: BestbpmnI18n;
  private states: StatusDefinition[];

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined, private injector: any) {
    this.i18n = resolveI18n(config);
    this.states = config?.states ?? [];
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      if (!is(bo, 'bpmn:SequenceFlow') || !canHaveCondition(bo.sourceRef)) {
        return groups;
      }
      const { t } = this.i18n;
      const isDefault = bo.sourceRef?.default === bo;
      const entries = isDefault
        ? [{ id: 'bestbpmn-condition-default', component: Hint, text: t('panel.conditionDefault') }]
        : [
            {
              id: 'bestbpmn-condition-result',
              component: ResultEntry,
              isEdited: isSelectEntryEdited,
              i18n: this.i18n,
              results: this.results(bo),
            },
            {
              id: 'bestbpmn-condition-expression',
              component: ExpressionEntry,
              isEdited: isTextFieldEntryEdited,
              i18n: this.i18n,
            },
          ];
      const index = groups.findIndex((g) => g.id === 'general');
      groups.splice(index >= 0 ? index + 1 : groups.length, 0, { id: 'bestbpmn-condition', label: t('panel.condition'), entries, shouldOpen: true });
      return groups;
    };
  }

  /** Ergebnisse der Aufgabe(n) davor mit ihrem Namen aus der Statustabelle, sonst aus dem Modell. */
  private results(flow: BusinessObject): { key: string; label: string }[] {
    const models: StatusModel[] = this.injector.get('bestbpmnStatusCheck', false)?.getModels() ?? [];
    const changes = models.flatMap((m) => m.changes);
    const names = Object.assign({}, ...models.map((m) => m.statusNames)) as Record<string, string>;
    return resultsForFlow(flow as any, changes).map((key) => {
      const state = this.states.find((s) => s.id === key);
      return { key, label: state ? catalogLabel(state, this.i18n.language) : (names[key] ?? key) };
    });
  }
}

function bodyOf(bo: BusinessObject): string | undefined {
  const expression = bo.conditionExpression;
  return expression ? (expression.body ?? '') : undefined;
}

function ResultEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n; results: { key: string; label: string }[] }) {
  const { element, id, i18n, results } = props;
  const { t } = i18n;
  const modeling = useService('modeling');
  const bpmnFactory = useService('bpmnFactory');
  const bo = element.businessObject;
  const body = bodyOf(bo);
  const current = body === undefined ? '' : (parseResultCondition(body) ?? CUSTOM);
  return h(SelectEntry, {
    element,
    id,
    label: t('panel.conditionResult'),
    description: results.length ? t('panel.conditionResultDescription') : t('panel.conditionNoResults'),
    getValue: () => current,
    setValue: (value: string) => {
      if (!value) {
        modeling.updateProperties(element, { conditionExpression: undefined });
        return;
      }
      const text = value === CUSTOM ? (body ?? '') : resultCondition(value);
      const conditionExpression = bpmnFactory.create('bpmn:FormalExpression', { body: text });
      const result = results.find((r) => r.key === value);
      // Ohne Namen bekommt der Weg den Namen des Ergebnisses, damit das Diagramm die Bedingung zeigt.
      modeling.updateProperties(element, { conditionExpression, ...(result && !bo.name ? { name: result.label } : {}) });
    },
    getOptions: () => [
      { value: '', label: t('panel.conditionNone') },
      ...results.map((r) => ({ value: r.key, label: `${r.label} (${r.key})` })),
      ...(current && current !== CUSTOM && !results.some((r) => r.key === current)
        ? [{ value: current, label: t('panel.notInCatalog', { name: current }) }]
        : []),
      { value: CUSTOM, label: t('panel.conditionCustom') },
    ],
  });
}

function ExpressionEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const modeling = useService('modeling');
  const bpmnFactory = useService('bpmnFactory');
  const debounce = useService('debounceInput');
  const bo = element.businessObject;
  return h(TextFieldEntry, {
    element,
    id,
    label: i18n.t('panel.conditionExpression'),
    description: i18n.t('panel.conditionExpressionDescription'),
    debounce,
    getValue: () => bodyOf(bo) ?? '',
    setValue: (value: string) => {
      if (!value?.trim()) {
        modeling.updateProperties(element, { conditionExpression: undefined });
      } else if (bo.conditionExpression) {
        modeling.updateModdleProperties(element, bo.conditionExpression, { body: value });
      } else {
        modeling.updateProperties(element, { conditionExpression: bpmnFactory.create('bpmn:FormalExpression', { body: value }) });
      }
    },
  });
}

function Hint(props: { id: string; text: string }) {
  return h('div', { class: 'bio-properties-panel-description bestbpmn-empty', 'data-entry-id': props.id }, props.text);
}
