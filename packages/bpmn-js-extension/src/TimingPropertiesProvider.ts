import { h } from '@bpmn-io/properties-panel/preact';
import { isSelectEntryEdited, isTextFieldEntryEdited, SelectEntry, TextFieldEntry } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import {
  analyzeValue,
  calculateProcess,
  describeTimeSpan,
  findParticipant,
  findTiming,
  formatAssignee,
  formatTimeSpan,
  isMultiInstance,
  laneMap,
  parseTimeInput,
  parseTimeSpan,
  readProbability,
  resolveRaci,
  TIMING_TYPES,
  usesPlanningValues,
  VALUE_BUCKETS,
  VALUE_CLASSES,
  VALUE_TYPES,
  type ProcessCalculation,
  type ValueAnalysis,
  type ValueFigures,
} from '@bestbpmn/model';
import type { BestbpmnConfig } from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import { UPDATE_TIMING, type UpdateTimingContext } from './timing';
import { findProcess, is, type BusinessObject, type DiagramElement } from './util';

const LOW_PRIORITY = 440;

/** Gateways, deren Ausgänge eine Wahrscheinlichkeit bekommen. */
const BRANCHING = ['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway', 'bpmn:EventBasedGateway'];

/**
 * Bereich „Planwerte“: Aufwand von D, E und M je Ausführung, Dauer und bei
 * Mehrfachinstanzen die erwartete Anzahl; an wartenden Ereignissen die Wartezeit; an den Ausgängen
 * von Gateways die Wahrscheinlichkeit. Eingaben wie `30`, `1h30m` oder `2d` werden als ISO-8601-Dauer
 * gespeichert. Die Werte steuern nichts, sie sind die Grundlage für Durchlaufzeit und Personalbedarf.
 */
export default class TimingPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn', 'bpmnjs'];

  private i18n: BestbpmnI18n;
  private minutesPerDay: number;
  private runs: number;
  private enabled: boolean;

  constructor(
    propertiesPanel: any,
    config: BestbpmnConfig | undefined,
    private bpmnjs: any,
  ) {
    this.i18n = resolveI18n(config);
    this.minutesPerDay = config?.planning?.minutesPerDay ?? 480;
    this.runs = config?.planning?.runs ?? 2000;
    this.enabled = config?.planning?.enabled ?? false;
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      if (!this.enabled) {
        return groups;
      }
      const bo = element.businessObject;
      const { t } = this.i18n;
      const boundary = is(bo, 'bpmn:SequenceFlow') && is(bo.sourceRef, 'bpmn:BoundaryEvent');
      if (is(bo, 'bpmn:SequenceFlow') && (boundary || BRANCHING.some((type) => is(bo.sourceRef, type)))) {
        groups.push({
          id: 'bestbpmn-timing',
          label: t('panel.timing'),
          entries: [
            {
              id: 'bestbpmn-timing-probability',
              component: ProbabilityEntry,
              isEdited: isTextFieldEntryEdited,
              i18n: this.i18n,
              hint: t(boundary ? 'panel.timingBoundaryProbabilityHint' : 'panel.timingProbabilityHint'),
            },
          ],
        });
        return groups;
      }
      const roots = this.rootProcesses(bo);
      if (roots) {
        groups.push({
          id: 'bestbpmn-calculation',
          label: t('panel.calculation'),
          entries: [{ id: 'bestbpmn-calculation-summary', component: CalculationSummary, calculate: () => this.calculate(roots), i18n: this.i18n, minutesPerDay: this.minutesPerDay, runs: this.runs }],
        });
        groups.push({
          id: 'bestbpmn-value',
          label: t('panel.valueAnalysis'),
          entries: [{ id: 'bestbpmn-value-analysis', component: ValueAnalysisView, analyze: () => this.analyze(roots), i18n: this.i18n, minutesPerDay: this.minutesPerDay }],
        });
        return groups;
      }
      if (!TIMING_TYPES.has(bo.$type)) {
        return groups;
      }
      const entries: any[] = [];
      const top = findProcess(bo);
      if (top && usesPlanningValues(collect(top))) {
        entries.push({ id: 'bestbpmn-timing-visits', component: VisitsHint, element, calculate: () => this.calculate([top], 0), i18n: this.i18n });
      }
      if (is(bo, 'bpmn:IntermediateCatchEvent')) {
        entries.push(timeEntry('duration', t('panel.timingWaiting'), t('panel.timingWaitingHint'), this.i18n));
      } else {
        const process = findProcess(bo);
        const raci = process ? resolveRaci(bo as any, laneMap(process as any, findParticipant(this.bpmnjs.getDefinitions(), process as any))) : undefined;
        const responsible = raci?.responsible.map(formatAssignee).join(', ');
        entries.push(
          timeEntry('effort', t('panel.timingEffort', { assignee: responsible || 'D' }), t('panel.timingEffortHint'), this.i18n),
        );
        for (const accountable of raci?.accountable ?? []) {
          entries.push(timeEntry('accountableEffort', t('panel.timingAccountableEffort', { assignee: formatAssignee(accountable) }), t('panel.timingAccountableHint'), this.i18n));
        }
        for (const consulted of raci?.consulted ?? []) {
          const assignee = formatAssignee(consulted);
          entries.push(timeEntry(`consulted:${assignee}`, t('panel.timingConsultedEffort', { assignee }), t('panel.timingConsultedHint'), this.i18n));
        }
        entries.push(timeEntry('duration', t('panel.timingDuration'), t('panel.timingDurationHint'), this.i18n));
        if (VALUE_TYPES.has(bo.$type)) {
          entries.push({ id: 'bestbpmn-timing-valueClass', component: ValueClassEntry, isEdited: isSelectEntryEdited, i18n: this.i18n });
        }
        if (isMultiInstance(bo as any)) {
          entries.push({ id: 'bestbpmn-timing-instances', component: InstancesEntry, isEdited: isTextFieldEntryEdited, i18n: this.i18n });
        }
      }
      groups.push({ id: 'bestbpmn-timing', label: t('panel.timing'), entries });
      return groups;
    };
  }

  /** Prozesse, deren Rechnung am Wurzelelement, an einem Pool oder am Prozess gezeigt wird. */
  private rootProcesses(bo: BusinessObject): BusinessObject[] | undefined {
    if (is(bo, 'bpmn:Process')) {
      return [bo];
    }
    if (is(bo, 'bpmn:Participant')) {
      return bo.processRef ? [bo.processRef] : [];
    }
    if (is(bo, 'bpmn:Collaboration')) {
      return ((bo.participants ?? []) as BusinessObject[]).map((p) => p.processRef).filter(Boolean);
    }
    return undefined;
  }

  private calculate(processes: BusinessObject[], runs = this.runs): ProcessCalculation[] {
    const definitions = this.bpmnjs.getDefinitions();
    return processes
      .filter((p) => ((p.flowElements ?? []) as BusinessObject[]).some((f) => is(f, 'bpmn:StartEvent')))
      .map((p) => calculateProcess(p as any, { minutesPerDay: this.minutesPerDay, runs }, definitions));
  }

  private analyze(processes: BusinessObject[]): ValueAnalysis[] {
    const definitions = this.bpmnjs.getDefinitions();
    return processes
      .filter((p) => ((p.flowElements ?? []) as BusinessObject[]).some((f) => is(f, 'bpmn:StartEvent')))
      .map((p) => analyzeValue(p as any, { minutesPerDay: this.minutesPerDay }, definitions));
  }
}

/** Alle Elemente eines Prozesses, auch in Teilprozessen. */
function collect(container: BusinessObject): any[] {
  return ((container.flowElements ?? []) as BusinessObject[]).flatMap((el) => [el, ...(el.flowElements ? collect(el) : [])]);
}

function timeEntry(attribute: UpdateTimingContext['attribute'], label: string, description: string, i18n: BestbpmnI18n) {
  return {
    id: `bestbpmn-timing-${attribute.replace(/[^a-zA-Z0-9]+/g, '-')}`,
    component: TimeEntry,
    isEdited: isTextFieldEntryEdited,
    attribute,
    label,
    description,
    i18n,
  };
}

/** Gespeicherter Wert eines Attributs, als ISO-Text. */
function storedValue(bo: BusinessObject, attribute: UpdateTimingContext['attribute']): string | undefined {
  const timing = findTiming(bo as any) as BusinessObject | undefined;
  if (!timing) {
    return undefined;
  }
  if (attribute.startsWith('consulted:')) {
    const assignee = attribute.slice('consulted:'.length);
    return ((timing.consultedEfforts ?? []) as BusinessObject[]).find((c) => c.assignee === assignee)?.effort;
  }
  return timing[attribute];
}

function TimeEntry(props: { element: DiagramElement; id: string; attribute: UpdateTimingContext['attribute']; label: string; description: string; i18n: BestbpmnI18n }) {
  const { element, id, attribute, label, description, i18n } = props;
  const commandStack = useService('commandStack');
  const debounce = useService('debounceInput');
  const units = { days: i18n.t('panel.timingUnitDays'), hours: 'h', minutes: 'min' };
  return h(TextFieldEntry, {
    element,
    id,
    label,
    description,
    debounce,
    getValue: () => {
      const stored = storedValue(element.businessObject, attribute);
      const span = parseTimeSpan(stored);
      // Unlesbare Werte bleiben sichtbar, damit man sie korrigieren kann.
      return span ? describeTimeSpan(span, units) : (stored ?? '');
    },
    validate: (value: string) => (!value?.trim() || parseTimeInput(value) ? null : i18n.t('panel.timingInvalid')),
    setValue: (value: string) => {
      const span = value?.trim() ? parseTimeInput(value) : undefined;
      if (value?.trim() && !span) {
        return;
      }
      commandStack.execute(UPDATE_TIMING, { element, attribute, value: span ? formatTimeSpan(span) : '' });
    },
  });
}

function InstancesEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const commandStack = useService('commandStack');
  const debounce = useService('debounceInput');
  return h(TextFieldEntry, {
    element,
    id,
    label: i18n.t('panel.timingInstances'),
    description: i18n.t('panel.timingInstancesHint'),
    debounce,
    getValue: () => String((findTiming(element.businessObject as any) as BusinessObject | undefined)?.instances ?? ''),
    validate: (value: string) => (!value?.trim() || Number(value.replace(',', '.')) > 0 ? null : i18n.t('panel.timingInvalidNumber')),
    setValue: (value: string) => {
      const number = Number(value?.replace(',', '.'));
      if (value?.trim() && !(number > 0)) {
        return;
      }
      commandStack.execute(UPDATE_TIMING, { element, attribute: 'instances', value: value?.trim() ? String(number) : '' });
    },
  });
}

function ProbabilityEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n; hint: string }) {
  const { element, id, i18n, hint } = props;
  const modeling = useService('modeling');
  const debounce = useService('debounceInput');
  const valid = (value: string) => {
    const number = Number(value.replace(',', '.').replace('%', '').trim());
    return Number.isFinite(number) && number >= 0 && number <= 100 ? number : undefined;
  };
  return h(TextFieldEntry, {
    element,
    id,
    label: i18n.t('panel.timingProbability'),
    description: hint,
    debounce,
    getValue: () => {
      const value = readProbability(element.businessObject as any);
      return value === undefined || Number.isNaN(value) ? String(element.businessObject.probability ?? '') : String(value).replace('.', ',');
    },
    validate: (value: string) => (!value?.trim() || valid(value) !== undefined ? null : i18n.t('panel.timingInvalidProbability')),
    setValue: (value: string) => {
      const number = value?.trim() ? valid(value) : undefined;
      if (value?.trim() && number === undefined) {
        return;
      }
      modeling.updateModdleProperties(element, element.businessObject, { probability: number === undefined ? undefined : String(number) });
    },
  });
}

/** Arbeitsminuten lesbar, z. B. `1 AT 2 h`. */
function describeMinutes(minutes: number, minutesPerDay: number, i18n: BestbpmnI18n): string {
  const days = Math.floor(minutes / minutesPerDay);
  const rest = Math.round(minutes - days * minutesPerDay);
  return describeTimeSpan({ days, minutes: rest }, { days: i18n.t('panel.timingUnitDays'), hours: 'h', minutes: 'min' });
}

/** Erwartete Ausführungen der Aufgabe je Durchlauf; nur sinnvoll, wenn der Prozess Planwerte nutzt. */
function VisitsHint(props: { element: DiagramElement; id: string; calculate: () => ProcessCalculation[]; i18n: BestbpmnI18n }) {
  const { element, id, calculate, i18n } = props;
  const visits = calculate()
    .flatMap((r) => r.elements)
    .find((e) => e.elementId === element.businessObject.id)?.visits;
  if (visits === undefined) {
    return null;
  }
  return h('div', { class: 'bio-properties-panel-description bestbpmn-empty', 'data-entry-id': id }, i18n.t('panel.calcVisits', { visits: String(visits).replace('.', ',') }));
}

/** Ergebnis der Rechnung am Prozess: Durchlaufzeit, Aufwand je Zuständigem, kritischer Pfad, fehlende Angaben. */
function CalculationSummary(props: { calculate: () => ProcessCalculation[]; i18n: BestbpmnI18n; minutesPerDay: number; runs: number }) {
  const { calculate, i18n, minutesPerDay, runs } = props;
  const { t } = i18n;
  const definitions = useService('bpmnjs').getDefinitions();
  const registry = useService('elementRegistry');
  const nameOf = (id: string) => registry.get(id)?.businessObject?.name || id;
  const results = calculate();
  const used = results.length && usesPlanningValues(((definitions?.rootElements ?? []) as BusinessObject[]).filter((r) => is(r, 'bpmn:Process')).flatMap(collect));
  if (!used) {
    return h('div', { class: 'bio-properties-panel-description bestbpmn-empty' }, t('panel.calcNone'));
  }
  const time = (m: number) => describeMinutes(m, minutesPerDay, i18n);
  const row = (label: string, value: string) => h('div', { class: 'bestbpmn-calc-row' }, [h('span', { class: 'bestbpmn-calc-label' }, label), h('span', null, value)]);
  return h(
    'div',
    { class: 'bestbpmn-calc' },
    results.map((r) => {
      const missing = new Map<string, string[]>();
      for (const m of r.missing) {
        missing.set(m.code, [...(missing.get(m.code) ?? []), nameOf(m.elementId)]);
      }
      return h('div', { class: 'bestbpmn-calc-process', 'data-process': r.processId }, [
        results.length > 1 ? h('div', { class: 'bestbpmn-calc-title' }, r.name || r.processId) : null,
        r.cycleTime
          ? row(t('panel.calcCycleTime'), t('panel.calcCycleTimeValue', { mean: time(r.cycleTime.mean), median: time(r.cycleTime.median), p85: time(r.cycleTime.p85), p95: time(r.cycleTime.p95) }))
          : null,
        row(t('panel.calcEffort'), time(r.effort)),
        ...r.effortByHolder.map((e) => row(`  ${e.holder ?? t('panel.calcUnassigned')}`, time(e.minutes))),
        r.criticalPath.length ? row(t('panel.calcCriticalPath'), r.criticalPath.map(nameOf).join(', ')) : null,
        h('div', { class: 'bestbpmn-calc-status' }, r.complete ? t('panel.calcComplete') : t('panel.calcIncomplete')),
        ...[...missing].map(([code, names]) => row(t(`panel.calcMissing_${code}`), names.join(', '))),
        h('div', { class: 'bio-properties-panel-description' }, t('panel.calcHint', { hours: String(Math.round((minutesPerDay / 60) * 100) / 100).replace('.', ','), runs: String(runs) })),
      ]);
    }),
  );
}

/** Bewertung der Aufgabe für die Wertschöpfungsanalyse. */
function ValueClassEntry(props: { element: DiagramElement; id: string; i18n: BestbpmnI18n }) {
  const { element, id, i18n } = props;
  const { t } = i18n;
  const commandStack = useService('commandStack');
  return h(SelectEntry, {
    element,
    id,
    label: t('panel.valueClass'),
    description: t('panel.valueClassHint'),
    getValue: () => String((findTiming(element.businessObject as any) as BusinessObject | undefined)?.valueClass ?? ''),
    setValue: (value: string) => commandStack.execute(UPDATE_TIMING, { element, attribute: 'valueClass', value }),
    // Feste Reihenfolge wie in der Analyse, nicht alphabetisch.
    getOptions: () => [{ value: '', label: t('panel.valueClassNone') }, ...VALUE_CLASSES.map((v) => ({ value: v, label: t(`panel.value_${v}`) }))],
  });
}

const percent = (value: number) => `${String(Math.round(value * 10) / 10).replace('.', ',')} %`;

/**
 * Wertschöpfungsanalyse am Prozess: je Weg die Anteile nach Anzahl und nach Bearbeitungszeit,
 * Durchlaufzeit und Flussrate; darüber der gewichtete Mittelwert.
 */
function ValueAnalysisView(props: { analyze: () => ValueAnalysis[]; i18n: BestbpmnI18n; minutesPerDay: number }) {
  const { analyze, i18n, minutesPerDay } = props;
  const { t } = i18n;
  const registry = useService('elementRegistry');
  const nameOf = (id: string) => registry.get(id)?.businessObject?.name || id;
  const results = analyze();
  const time = (m: number) => describeMinutes(m, minutesPerDay, i18n);
  const row = (label: string, value: string) => h('div', { class: 'bestbpmn-calc-row' }, [h('span', { class: 'bestbpmn-calc-label' }, label), h('span', null, value)]);
  const rated = results.some((r) => r.paths.some((p) => VALUE_CLASSES.some((c) => p.count[c] > 0)));
  if (!rated) {
    return h('div', { class: 'bio-properties-panel-description bestbpmn-empty' }, t('panel.valueNone'));
  }
  const buckets = (f: ValueFigures) => VALUE_BUCKETS.filter((b) => b !== 'unrated' || f.count.unrated > 0);
  const table = (f: ValueFigures) =>
    h('table', { class: 'bestbpmn-value-table' }, [
      h('thead', null, h('tr', null, [h('th', null, ''), h('th', null, t('panel.valueCount')), h('th', null, t('panel.valueProcessing'))])),
      h(
        'tbody',
        null,
        buckets(f).map((b) => h('tr', { 'data-bucket': b }, [h('td', null, t(`panel.value_${b}`)), h('td', null, percent(f.countShare[b])), h('td', null, percent(f.processingShare[b]))])),
      ),
    ]);
  const figures = (f: ValueFigures) => [
    table(f),
    row(t('panel.valueCycleTime'), time(f.cycleTime)),
    row(t('panel.valueProcessingTime'), time(f.criticalProcessing)),
    row(t('panel.valueWaiting'), time(f.waiting)),
    row(t('panel.valueFlowRate'), percent(f.flowRate)),
  ];
  return h(
    'div',
    { class: 'bestbpmn-calc bestbpmn-value' },
    results.map((r) =>
      h('div', { class: 'bestbpmn-calc-process', 'data-process': r.processId }, [
        results.length > 1 ? h('div', { class: 'bestbpmn-calc-title' }, r.name || r.processId) : null,
        r.mean ? h('div', { class: 'bestbpmn-value-path bestbpmn-value-mean' }, [h('div', { class: 'bestbpmn-calc-title' }, t('panel.valueMean', { count: String(r.paths.length) })), ...figures(r.mean)]) : null,
        ...r.paths.map((p, i) =>
          h('div', { class: 'bestbpmn-value-path', 'data-path': String(i + 1) }, [
            h('div', { class: 'bestbpmn-calc-title' }, t('panel.valuePath', { n: String(i + 1), probability: percent(p.probability) })),
            // Die Aufgabenfolge steht immer da; nur die Kennzahlen lassen sich einklappen.
            h('div', { class: 'bestbpmn-value-steps' }, p.steps.map((s) => nameOf(s.elementId)).join(' → ')),
            h('details', null, [h('summary', null, t('panel.valueFigures')), ...figures(p)]),
          ]),
        ),
        h('hr', { class: 'bestbpmn-value-separator' }),
        r.coverage < 99.5 ? h('div', { class: 'bio-properties-panel-description' }, t('panel.valueCoverage', { coverage: percent(r.coverage) })) : null,
        r.truncated ? h('div', { class: 'bio-properties-panel-description' }, t('panel.valueTruncated', { count: String(r.paths.length) })) : null,
        r.unrated.length ? row(t('panel.valueUnrated'), r.unrated.map(nameOf).join(', ')) : null,
        h('div', { class: 'bio-properties-panel-description' }, t('panel.valueHint')),
      ]),
    ),
  );
}
