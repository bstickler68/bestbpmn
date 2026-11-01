import type { TFunction } from '@bestbpmn/i18n';
import { localize, type StatusModel } from '@bestbpmn/model';

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface PanelI18n {
  language: string;
  t: TFunction;
}

/**
 * Zeigt Status, Statuswechsel und Meldungen der Modellprüfung an. Status erscheinen in der
 * Sprache der Oberfläche, falls übersetzt, sonst in der Hauptsprache des Modells.
 */
export function renderStatusPanel(container: HTMLElement, models: StatusModel[], i18n: PanelI18n): void {
  container.innerHTML = models.map((m) => renderModel(m, i18n)).join('') || `<p>${escape(i18n.t('status.noProcess'))}</p>`;
}

function renderModel(model: StatusModel, { language, t }: PanelI18n): string {
  const name = (key: string) =>
    escape(localize(model.statusNames[key] ?? key, model.statusTranslations[key], language) ?? key);
  const title = escape(model.processName ?? model.processId);
  const statuses = model.statuses.length
    ? `<ol>${model.statuses
        .map(
          (s) =>
            `<li>${name(s)} <code>${escape(s)}</code>${model.initialStatuses.includes(s) ? ` <em>(${escape(t('status.start'))})</em>` : ''}</li>`,
        )
        .join('')}</ol>`
    : `<p>${escape(t('status.noStates'))}</p>`;
  const changes = model.changes.filter((c) => c.outputs.length > 0);
  const changeList = changes.length
    ? `<ul>${changes
        .map(
          (c) =>
            `<li>${escape(c.elementName ?? c.elementId)} → ${c.outputs.map(name).join(` ${escape(t('status.or'))} `)}</li>`,
        )
        .join('')}</ul>`
    : `<p>${escape(t('status.noChanges'))}</p>`;
  const issues = model.issues.length
    ? model.issues
        .map(
          (i) =>
            `<p class="issue ${i.severity}">${escape(t(i.severity === 'error' ? 'status.error' : 'status.warning'))}: ${escape(t(`issue.${i.code}`, i.params))}</p>`,
        )
        .join('')
    : `<p class="ok">${escape(t('status.ok'))}</p>`;
  const heading = model.dataObjectName ? t('status.statesOf', { object: model.dataObjectName }) : t('status.states');

  return `<section>
    <h2>${title}</h2>
    <h3>${escape(heading)}</h3>${statuses}
    <h3>${escape(t('status.changes'))}</h3>${changeList}
    <h3>${escape(t('status.check'))}</h3>${issues}
  </section>`;
}
