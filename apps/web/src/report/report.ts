import type { TFunction } from '@bestbpmn/i18n';
import {
  catalogLabel,
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
  type ProfileData,
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
}


export const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Nur http(s)- und mailto-Links werden anklickbar; alles andere bleibt Text. */
const safeHref = (href: string) => /^(https?:|mailto:)/i.test(href.trim());

function link(value: LinkValue): string {
  const text = escape(value.title || value.href);
  return safeHref(value.href) ? `<a href="${escape(value.href)}">${text}</a>` : text;
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
function page(input: ReportInput, kind: 'profile' | 'full', body: string): string {
  const { t, language } = input;
  const name = title(input);
  const heading = t(kind === 'profile' ? 'report.profile' : 'report.full');
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

function dataList(items: ProfileData[], t: TFunction): string {
  if (!items.length) {
    return dash(t);
  }
  return `<ul class="data">${items
    .map((item) => {
      const state = item.state ? ` <span class="state">[${escape(item.state)}]</span>` : '';
      const store = item.store ? ` <span class="kind">(${escape(t('report.store'))})</span>` : '';
      return `<li>${escape(item.name ?? item.id)}${state}${store}</li>`;
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
    ...profile.resources.documents.map((d) => `<li>${escape(d.name ?? d.id)}</li>`),
    ...profile.resources.links.map((l) => `<li>${link(l)}</li>`),
  ];
  const body = `<main>
<section class="purpose"><h2>${escape(t('report.purpose'))}</h2>${paragraphs(profile.description) || dash(t)}</section>
<div class="grid">
<section><h2>${escape(t('report.triggers'))}</h2>${entries(profile.triggers, t, true)}</section>
<section><h2>${escape(t('report.endStates'))}</h2>${entries(profile.endStates, t, true)}</section>
<section><h2>${escape(t('report.firstActivities'))}</h2>${entries(profile.firstActivities, t)}</section>
<section><h2>${escape(t('report.lastActivities'))}</h2>${entries(profile.lastActivities, t)}</section>
<section><h2>${escape(t('report.inputs'))}</h2>${dataList(profile.inputs, t)}</section>
<section><h2>${escape(t('report.outputs'))}</h2>${dataList(profile.outputs, t)}</section>
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
<td class="description">${paragraphs(row.description)}${next}</td>
<td>${row.links.length ? `<ul>${row.links.map((l) => `<li>${link(l)}</li>`).join('')}</ul>` : ''}</td>
</tr>`;
}

function elementTables(input: ReportInput): string {
  const { t } = input;
  const tables = deriveElementTables(input.definitions);
  if (!tables.length) {
    return dash(t);
  }
  const head = ['number', 'type', 'kind', 'name', 'systems', 'description', 'links']
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
