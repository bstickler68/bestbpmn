import type { TFunction } from '@bestbpmn/i18n';
import {
  calculateStaffing,
  catalogLabel,
  DEFAULT_HOURS_PER_FTE,
  DEFAULT_WORKING_DAYS_PER_YEAR,
  describeTimeSpan,
  deriveElementTables,
  deriveProfile,
  deriveRaciMatrices,
  findRole,
  localize,
  parseAssignee,
  type ElementRow,
  type FlowReference,
  type LinkValue,
  type ModdleElement,
  type InterfaceEntry,
  type ProcessSymbolEntry,
  type ProfileEntry,
  type RoleDefinition,
  type ServiceRefValue,
  type StatusModel,
} from '@bestbpmn/model';
import { renderRaciMatrix } from '../raciMatrix';
import { REPORT_CSS } from './reportStyles';

export interface ReportInput {
  t: TFunction;
  /** Sprache der Oberfläche; in ihr stehen Überschriften und Datum. */
  language: string;
  definitions: ModdleElement;
  /** Name der Datei, falls das Modell aus einer stammt. */
  fileName?: string;
  /** Zeitpunkt für „Stand“, sonst jetzt. */
  now?: Date;
  /** Rollen und Gruppen aus dem eigenen Katalog, für Anzeigenamen. */
  roles?: RoleDefinition[];
  /** Nur Gesamtdokument: Grafik des Diagramms. */
  svg?: string;
  /** Nur Gesamtdokument: Status und Statuswechsel. */
  statusModels?: StatusModel[];
  /** Nur Personalbedarf: Jahresarbeitszeit eines VZÄ und woraus sie folgt, für eine eigene Einstellung; Vorgabe 38,5 h × 220 ÷ 5 = 1694 h. */
  fteBasis?: { weeklyHours: number; workingDaysPerYear: number; workingDaysPerWeek: number; hoursPerFte: number };
  /** Nur Personalbedarf: Minuten je Arbeitstag für Aufwände in Tagen, Vorgabe 480. */
  minutesPerDay?: number;
}


export const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Nur http(s)- und mailto-Links werden anklickbar; alles andere bleibt Text. */
const safeHref = (href: string) => /^(https?:|mailto:)/i.test(href.trim());

function link(value: LinkValue): string {
  const text = escape(value.title || value.href);
  return safeHref(value.href) ? `<a href="${escape(value.href)}">${text}</a>` : text;
}

/** Eine Unterlage: Web-Adresse als Link, Dokument-Record als Name mit Schlüssel. */
function documentItem(value: { name?: string; documentRef?: string; href?: string }): string {
  if (value.documentRef) {
    return escape(value.name ? `${value.name} (${value.documentRef})` : value.documentRef);
  }
  return value.href ? link({ href: value.href, ...(value.name ? { title: value.name } : {}) }) : escape(value.name ?? '');
}

/** Mehrzeiliger Text mit Absätzen; Markdown bleibt als Text stehen. */
const paragraphs = (text: string | undefined) =>
  text
    ? text
        .split(/\n{2,}/)
        .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
        .join('')
    : '';

const dash = (t: TFunction) => `<p class="none">${escape(t('report.none'))}</p>`;

/** Name des Modells: Kollaboration, sonst der einzige Prozess. */
function title(input: ReportInput): string {
  return deriveProfile(input.definitions).name ?? input.t('report.untitled');
}

/** Ein ganzes HTML-Dokument mit Kopf, Stil und Fußzeile. */
function page(input: ReportInput, kind: 'profile' | 'full' | 'staffing', body: string): string {
  const { t, language } = input;
  const name = title(input);
  const heading = t(`report.${kind}`);
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(input.now ?? new Date());
  const meta = [t('report.generated', { date }), input.fileName ? t('report.file', { name: input.fileName }) : undefined]
    .filter(Boolean)
    .map((text) => escape(text!))
    .join(' · ');
  return `<!doctype html>
<html lang="${escape(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="bestbpmn">
<title>${escape(`${name} – ${heading}`)}</title>
<style>${REPORT_CSS}</style>
</head>
<body class="report report-${kind}">
<header class="report-head">
<p class="report-kind">${escape(heading)}</p>
<h1>${escape(name)}</h1>
<p class="report-meta">${meta}</p>
</header>
${body}
</body>
</html>
`;
}

function entries(items: ProfileEntry[], t: TFunction, withKind = false): string {
  if (!items.length) {
    return dash(t);
  }
  return `<ul class="entries">${items
    .map((item) => {
      const kind = withKind && item.kind && item.kind !== 'none' ? ` <span class="kind">(${escape(t(`report.kind.${item.kind}`))})</span>` : '';
      return `<li><strong>${escape(item.name ?? item.id)}</strong>${kind}${paragraphs(item.description)}</li>`;
    })
    .join('')}</ul>`;
}

const processName = (p: ProcessSymbolEntry) => escape(p.name ?? p.id) + (p.processRef ? ` <span class="kind">(${escape(p.processRef)})</span>` : '');

/** Vor- oder nachgelagerte Prozesse. */
function processList(items: ProcessSymbolEntry[], t: TFunction): string {
  if (!items.length) {
    return dash(t);
  }
  return `<ul class="entries">${items.map((p) => `<li><strong>${processName(p)}</strong>${paragraphs(p.description)}</li>`).join('')}</ul>`;
}

/** Schnittstellen mit Typ, Partnerprozess und Ereignis. */
function interfaceList(items: InterfaceEntry[], t: TFunction, direction: 'in' | 'out'): string {
  if (!items.length) {
    return dash(t);
  }
  return `<ul class="entries">${items
    .map((item) => {
      const type = item.type ? ` <span class="kind">(${escape(t(`interfaceType.${item.type}`, { defaultValue: item.type }))})</span>` : '';
      const details = [
        item.processes.length ? t(direction === 'in' ? 'report.from' : 'report.to', { names: item.processes.map((p) => p.name ?? p.id).join(', ') }) : '',
        item.events.length ? t('report.at', { names: item.events.join(', ') }) : '',
      ].filter(Boolean);
      const meta = details.length ? `<div class="meta">${escape(details.join(' · '))}</div>` : '';
      return `<li><strong>${escape(item.name ?? item.id)}</strong>${type}${meta}${paragraphs(item.description)}</li>`;
    })
    .join('')}</ul>`;
}

/** Anzeigename einer Zuordnung: aus dem Katalog, sonst der Name in Klammern, sonst die Schreibweise. */
function assigneeName(text: string, input: ReportInput): string {
  const assignee = parseAssignee(text);
  const role = findRole(input.roles, assignee);
  if (role) {
    return catalogLabel(role, input.language);
  }
  if (assignee && (assignee.kind === 'group' || assignee.kind === 'role' || assignee.kind === 'user')) {
    return assignee.ref;
  }
  return text;
}

function systems(services: ServiceRefValue[]): string {
  return services.map((s) => escape(s.name || s.ref)).join(', ');
}

/** Der Steckbrief: die wesentlichen Angaben, ohne Grafik. */
export function profileHtml(input: ReportInput): string {
  const { t } = input;
  const profile = deriveProfile(input.definitions);
  const people = profile.resources.people.map((p) => assigneeName(p, input));
  const documents = [
    ...profile.resources.documents.map((d) => `<li>${d.documentRef || d.href ? documentItem(d) : escape(d.name ?? d.id)}</li>`),
    ...profile.resources.links.map((l) => `<li>${link(l)}</li>`),
  ];
  const body = `<main>
<section class="purpose"><h2>${escape(t('report.purpose'))}</h2>${paragraphs(profile.description) || dash(t)}</section>
<div class="grid">
<section><h2>${escape(t('report.upstream'))}</h2>${processList(profile.upstream, t)}</section>
<section><h2>${escape(t('report.downstream'))}</h2>${processList(profile.downstream, t)}</section>
<section><h2>${escape(t('report.inputs'))}</h2>${interfaceList(profile.inputs, t, 'in')}</section>
<section><h2>${escape(t('report.outputs'))}</h2>${interfaceList(profile.outputs, t, 'out')}</section>
<section><h2>${escape(t('report.triggers'))}</h2>${entries(profile.triggers, t, true)}</section>
<section><h2>${escape(t('report.endStates'))}</h2>${entries(profile.endStates, t, true)}</section>
<section><h2>${escape(t('report.firstActivities'))}</h2>${entries(profile.firstActivities, t)}</section>
<section><h2>${escape(t('report.lastActivities'))}</h2>${entries(profile.lastActivities, t)}</section>
</div>
<section class="resources"><h2>${escape(t('report.resources'))}</h2>
<table class="resources-table"><tbody>
<tr><th scope="row">${escape(t('report.people'))}</th><td>${people.length ? `<ul>${people.map((p) => `<li>${escape(p)}</li>`).join('')}</ul>` : escape(t('report.none'))}</td></tr>
<tr><th scope="row">${escape(t('report.documents'))}</th><td>${documents.length ? `<ul>${documents.join('')}</ul>` : escape(t('report.none'))}</td></tr>
<tr><th scope="row">${escape(t('report.systems'))}</th><td>${profile.resources.systems.length ? `<ul>${profile.resources.systems.map((s) => `<li>${escape(s.name || s.ref)}</li>`).join('')}</ul>` : escape(t('report.none'))}</td></tr>
</tbody></table>
</section>
</main>`;
  return page(input, 'profile', body);
}

/** Text für einen Verweis, z. B. „Ja: weiter bei 6“ oder „bei „Frist“: weiter bei 10“. */
export function referenceText(ref: FlowReference, t: TFunction): string {
  const rest = t(ref.direction === 'back' ? 'report.next.back' : 'report.next.forward', { target: ref.target });
  if (ref.boundary) {
    return t('report.next.boundary', { name: ref.boundary.name ?? t(`report.kind.${ref.boundary.kind}`), rest });
  }
  const label = ref.label ?? (ref.isDefault ? t('report.next.default') : undefined);
  return label ? t('report.next.labelled', { label, rest }) : rest;
}

/** Regel-Kennzeichen und Beschreibung, z. B. „Regeln (Bedingung, Folgeaktion): Vier-Augen-Prinzip“. */
function rulesText(row: ElementRow, t: TFunction): string {
  if (!row.rules) {
    return '';
  }
  const kinds = row.rules.kinds.map((k) => t(`ruleKind.${k}`)).join(', ');
  const head = kinds ? `${t('panel.rules')} (${kinds})` : t('panel.rules');
  return `<p class="rules"><strong>${escape(head)}</strong>${row.rules.description ? `: ${escape(row.rules.description)}` : ''}</p>`;
}

/** Ein- oder ausgehende Daten eines Schritts, je Zeile ein Eintrag. */
function dataItems(items: string[]): string {
  return items.length ? `<ul class="data">${items.map((i) => `<li>${escape(i)}</li>`).join('')}</ul>` : '';
}

function elementRow(row: ElementRow, t: TFunction): string {
  const kind = [
    t(`report.kind.${row.kind}`),
    row.nonInterrupting ? t('report.nonInterrupting') : undefined,
    row.loop ? t(`report.loop.${row.loop}`) : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  const next = row.next.length
    ? `<ul class="next">${row.next.map((ref) => `<li>${escape(referenceText(ref, t))}</li>`).join('')}</ul>`
    : '';
  return `<tr class="depth-${Math.min(row.depth, 3)}" data-element-id="${escape(row.id)}">
<td class="number">${escape(row.number)}</td>
<td>${escape(t(`report.type.${row.type}`))}</td>
<td>${escape(kind)}</td>
<td class="name">${escape(row.name ?? '')}</td>
<td>${systems(row.services)}</td>
<td>${dataItems(row.inputs)}</td>
<td>${dataItems(row.outputs)}</td>
<td class="description">${paragraphs(row.description)}${rulesText(row, t)}${next}</td>
<td>${row.documents.length || row.links.length ? `<ul>${[...row.documents.map(documentItem), ...row.links.map(link)].map((item) => `<li>${item}</li>`).join('')}</ul>` : ''}</td>
</tr>`;
}

function elementTables(input: ReportInput): string {
  const { t } = input;
  const tables = deriveElementTables(input.definitions);
  if (!tables.length) {
    return dash(t);
  }
  const head = ['number', 'type', 'kind', 'name', 'systems', 'inputs', 'outputs', 'description', 'links']
    .map((c) => `<th scope="col" class="col-${c}">${escape(t(`report.col.${c}`))}</th>`)
    .join('');
  return tables
    .map(
      (table) => `${tables.length > 1 ? `<h3>${escape(table.processName ?? table.processId)}</h3>` : ''}
<table class="elements"><thead><tr>${head}</tr></thead><tbody>
${table.rows.map((row) => elementRow(row, t)).join('')}
</tbody></table>`,
    )
    .join('');
}

function statusSection(models: StatusModel[], input: ReportInput): string {
  const { t, language } = input;
  if (!models.length) {
    return dash(t);
  }
  return models
    .map((model) => {
      const name = (key: string) => escape(localize(model.statusNames[key] ?? key, model.statusTranslations[key], language) ?? key);
      const statuses = model.statuses.length
        ? `<table class="status"><thead><tr><th scope="col">${escape(t('report.col.number'))}</th><th scope="col">${escape(t('report.col.status'))}</th><th scope="col">${escape(t('report.col.key'))}</th><th scope="col">${escape(t('report.col.initial'))}</th></tr></thead><tbody>${model.statuses
            .map(
              (s, i) =>
                `<tr><td class="number">${i + 1}</td><td>${name(s)}</td><td><code>${escape(s)}</code></td><td>${model.initialStatuses.includes(s) ? escape(t('report.yes')) : ''}</td></tr>`,
            )
            .join('')}</tbody></table>`
        : `<p>${escape(t('status.noStates'))}</p>`;
      const changes = model.changes.filter((c) => c.outputs.length);
      const changeTable = changes.length
        ? `<table class="status"><thead><tr><th scope="col">${escape(t('report.col.activity'))}</th><th scope="col">${escape(t('report.col.sets'))}</th></tr></thead><tbody>${changes
            .map(
              (c) =>
                `<tr><td>${escape(c.elementName ?? c.elementId)}</td><td>${c.outputs.map(name).join(` ${escape(t('status.or'))} `)}</td></tr>`,
            )
            .join('')}</tbody></table>`
        : `<p>${escape(t('status.noChanges'))}</p>`;
      const object = model.dataObjectName ? t('status.statesOf', { object: model.dataObjectName }) : t('report.statusTable');
      return `${models.length > 1 ? `<h3>${escape(model.processName ?? model.processId)}</h3>` : ''}
<h4>${escape(object)}</h4>${statuses}
<h4>${escape(t('report.statusChanges'))}</h4>${changeTable}`;
    })
    .join('');
}

/** Die DEMI-Matrix wie im Reiter, als HTML-Text. */
function raciSection(input: ReportInput): string {
  const container = document.createElement('div');
  renderRaciMatrix(container, deriveRaciMatrices(input.definitions), input.t, { roles: input.roles, language: input.language });
  // Die Prozessüberschrift der Matrix wird eine Ebene tiefer gesetzt.
  container.querySelectorAll('h2').forEach((h) => {
    const h3 = document.createElement('h3');
    h3.textContent = h.textContent;
    h.replaceWith(h3);
  });
  return container.innerHTML;
}

/** Das Gesamtdokument: Modellinformationen, Grafik, Elemente, Status und DEMI-Matrix. */
export function fullHtml(input: ReportInput): string {
  const { t } = input;
  const profile = deriveProfile(input.definitions);
  const models = input.statusModels ?? [];
  // Das Kapitel Status erscheint nur, wenn im Modell mindestens ein Status modelliert ist.
  const hasStatuses = models.some((m) => m.statuses.length > 0);
  const info = [
    [t('report.name'), escape(profile.name ?? t('report.untitled'))],
    [t('report.description'), paragraphs(profile.description) || escape(t('report.none'))],
    ...(input.fileName ? [[t('report.fileLabel'), escape(input.fileName)]] : []),
    // Prozessketten wie im Steckbrief.
    [t('report.upstream'), processList(profile.upstream, t)],
    [t('report.downstream'), processList(profile.downstream, t)],
    [t('report.inputs'), interfaceList(profile.inputs, t, 'in')],
    [t('report.outputs'), interfaceList(profile.outputs, t, 'out')],
  ];
  const body = `<main>
<section class="info"><h2>${escape(t('report.modelInfo'))}</h2>
<table class="info-table"><tbody>${info.map(([k, v]) => `<tr><th scope="row">${escape(k!)}</th><td>${v}</td></tr>`).join('')}</tbody></table>
</section>
${input.svg ? `<section class="graphic"><h2>${escape(t('report.graphic'))}</h2><div class="diagram">${input.svg.replace(/^<\?xml[^>]*>\s*/, '')}</div></section>` : ''}
<section class="elements-section"><h2>${escape(t('report.elements'))}</h2>${elementTables(input)}</section>
${hasStatuses ? `<section class="status-section"><h2>${escape(t('report.statusTable'))}</h2>${statusSection(models, input)}</section>` : ''}
<section class="raci-section"><h2>${escape(t('report.raci'))}</h2>${raciSection(input)}</section>
</main>`;
  return page(input, 'full', body);
}

/**
 * Personalbedarf: je Durchführungsverantwortung (D) der Aufwand des D je Ausführung mal
 * Ausführungen im Jahr, in Stunden und Vollzeitäquivalenten, auf zwei Nachkommastellen gerundet.
 */
export function staffingHtml(input: ReportInput): string {
  const { t, language } = input;
  const basis = input.fteBasis ?? { weeklyHours: 38.5, workingDaysPerYear: DEFAULT_WORKING_DAYS_PER_YEAR, workingDaysPerWeek: 5, hoursPerFte: DEFAULT_HOURS_PER_FTE };
  const report = calculateStaffing(input.definitions, {
    hoursPerFte: basis.hoursPerFte,
    ...(input.minutesPerDay ? { minutesPerDay: input.minutesPerDay } : {}),
  });
  const fixed = new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plain = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const effort = (minutes: number) => describeTimeSpan({ days: 0, minutes }, { days: t('panel.timingUnitDays'), hours: 'h', minutes: 'min' });
  const counted = report.processes.filter((p) => p.annualOccurrence !== undefined);
  const processLabel = (id: string) => {
    const process = report.processes.find((p) => p.processId === id);
    return process?.name ?? id;
  };
  const num = (value: number, cls = 'num') => `<td class="${cls}">${escape(fixed.format(value))}</td>`;

  const basisRows = report.processes
    .map(
      (p) => `<tr><td>${escape(p.name ?? p.processId)}</td><td class="num">${
        p.annualOccurrence !== undefined ? escape(plain.format(p.annualOccurrence)) : `<span class="none">${escape(t(p.invalidOccurrence ? 'report.staffingInvalidOccurrence' : 'report.none'))}</span>`
      }</td>${p.annualOccurrence !== undefined ? `${num(p.hours)}${num(p.fte)}` : '<td></td><td></td>'}</tr>`,
    )
    .join('');
  const basisTable = report.processes.length
    ? `<table class="staffing staffing-basis"><thead><tr>${['process', 'annualOccurrence', 'hoursPerYear', 'fte']
        .map((c) => `<th scope="col" class="col-${c}${c === 'process' ? '' : ' num'}">${escape(t(`report.col.${c}`))}</th>`)
        .join('')}</tr></thead><tbody>${basisRows}</tbody></table>`
    : dash(t);

  let byHolder: string;
  if (!counted.length) {
    byHolder = `<p class="none">${escape(t('report.staffingNoOccurrence'))}</p>`;
  } else if (!report.holders.length) {
    byHolder = `<p class="none">${escape(t('report.staffingNoEffort'))}</p>`;
  } else {
    const head = ['holderTask', 'effortPerExecution', 'executionsPerYear', 'hoursPerYear', 'fte']
      .map((c) => `<th scope="col" class="col-${c}${c === 'holderTask' ? '' : ' num'}">${escape(t(`report.col.${c}`))}</th>`)
      .join('');
    const rows = report.holders
      .map((holder) => {
        const label = holder.holder === null ? t('report.staffingUnassigned') : assigneeName(holder.holder, input);
        const tasks = holder.tasks
          .map((task) => {
            const origin = [counted.length > 1 ? processLabel(task.processId) : '', task.path ? task.path.split('/').slice(0, -1).join(' / ') : '']
              .filter(Boolean)
              .join(' · ');
            return `<tr class="task" data-element-id="${escape(task.elementId)}"><td>${escape(task.name ?? task.elementId)}${
              origin ? ` <span class="kind">(${escape(origin)})</span>` : ''
            }</td><td class="num">${escape(effort(task.effortPerExecution))}</td><td class="num">${escape(plain.format(task.executionsPerYear))}</td>${num(task.hours)}${num(task.fte)}</tr>`;
          })
          .join('');
        return `<tbody class="holder" data-holder="${escape(holder.holder ?? '')}"><tr class="subtotal"><th scope="rowgroup" colspan="3">${escape(label)}</th>${num(holder.hours)}${num(holder.fte)}</tr>${tasks}</tbody>`;
      })
      .join('');
    byHolder = `<table class="staffing staffing-holders"><thead><tr>${head}</tr></thead>${rows}<tfoot><tr class="total"><th scope="row" colspan="3">${escape(
      t('report.staffingTotal'),
    )}</th>${num(report.hours)}${num(report.fte)}</tr></tfoot></table>`;
  }

  const missing = [
    ...report.processes.filter((p) => p.annualOccurrence === undefined && counted.length).map((p) => t(p.invalidOccurrence ? 'report.staffingProcessInvalid' : 'report.staffingProcessWithout', { name: p.name ?? p.processId })),
    ...report.missingEffort.map((m) => t('report.staffingTaskWithoutEffort', { name: taskName(input, m.elementId) })),
  ];
  const body = `<main>
<section class="staffing-basis-section"><h2>${escape(t('report.staffingBasis'))}</h2>${basisTable}
<p class="meta">${escape(
    t('report.staffingFte', {
      hours: plain.format(report.hoursPerFte),
      weekly: plain.format(basis.weeklyHours),
      days: plain.format(basis.workingDaysPerYear),
      perWeek: plain.format(basis.workingDaysPerWeek),
    }),
  )}</p></section>
<section class="staffing-section"><h2>${escape(t('report.staffingByHolder'))}</h2>${byHolder}
<p class="meta">${escape(t('report.staffingHint'))}</p></section>
${missing.length ? `<section class="staffing-missing"><h2>${escape(t('report.staffingMissing'))}</h2><ul class="entries">${missing.map((m) => `<li>${escape(m)}</li>`).join('')}</ul></section>` : ''}
</main>`;
  return page(input, 'staffing', body);
}

/** Name einer Aufgabe aus dem Modell, sonst ihre ID. */
function taskName(input: ReportInput, id: string): string {
  const find = (container: any): any => {
    for (const el of (container?.flowElements ?? []) as any[]) {
      if (el.id === id) {
        return el;
      }
      const inner = el.flowElements ? find(el) : undefined;
      if (inner) {
        return inner;
      }
    }
    return undefined;
  };
  for (const root of ((input.definitions as any).rootElements ?? []) as any[]) {
    const found = find(root);
    if (found) {
      return found.name || id;
    }
  }
  return id;
}
