import type { TFunction } from '@bestbpmn/i18n';
import { catalogLabel, findRole, parseAssignee, type RaciMatrix, type RoleDefinition } from '@bestbpmn/model';

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Zeigt die RACI-Matrix: Zeilen = Aktivitäten, Spalten = Personen, Gruppen und Rollen. */
export function renderRaciMatrix(
  container: HTMLElement,
  matrices: RaciMatrix[],
  t: TFunction,
  catalog: { roles?: RoleDefinition[]; language?: string } = {},
): void {
  container.innerHTML = matrices.map((m) => renderMatrix(m, t, catalog)).join('') || `<p>${escape(t('raci.noActivities'))}</p>`;
}

function renderMatrix(matrix: RaciMatrix, t: TFunction, catalog: { roles?: RoleDefinition[]; language?: string }): string {
  if (!matrix.rows.length) {
    return `<section><h2>${escape(matrix.processName ?? matrix.processId)}</h2><p>${escape(t('raci.noActivities'))}</p></section>`;
  }
  // Spalten mit Rolle oder Gruppe aus der Tabelle zeigen deren Namen, die übrigen die Schreibweise.
  const head = matrix.columns
    .map((c) => {
      const role = findRole(catalog.roles, parseAssignee(c));
      return role
        ? `<th scope="col" title="${escape(c)}">${escape(catalogLabel(role, catalog.language ?? 'en'))}</th>`
        : `<th scope="col"><code>${escape(c)}</code></th>`;
    })
    .join('');
  const body = matrix.rows
    .map(
      (row) =>
        `<tr data-element-id="${escape(row.elementId)}"><th scope="row">${escape(row.elementName ?? row.elementId)}</th>${matrix.columns
          .map((c) => {
            const roles = row.cells[c] ?? [];
            const letters = escape(roles.map((role) => t(`raci.letter.${role}`)).join(''));
            // D aus der Swimlane wird schräg gestellt, damit man es von einem Eintrag an der Aufgabe unterscheidet.
            return row.responsibleFromLane && roles.includes('responsible')
              ? `<td class="from-lane" title="${escape(t('raci.laneHint'))}">${letters}</td>`
              : `<td>${letters}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `<section>
    <h2>${escape(matrix.processName ?? matrix.processId)}</h2>
    <div class="raci-scroll"><table class="raci">
      <thead><tr><th scope="col">${escape(t('raci.activity'))}</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <p class="raci-legend">${escape(t('raci.legend'))}</p>
  </section>`;
}
