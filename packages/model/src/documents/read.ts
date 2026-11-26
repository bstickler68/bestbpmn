import { isProcessObjectName } from '../states/processObject.js';
import type { ModdleElement, ModelIssue } from '../states/types.js';

type El = ModdleElement & Record<string, any>;

/** Schlüssel des alten Attributs „Weiterführende Dokumentation“ an Aufgaben; ersetzt durch Datenobjekte. */
export const LEGACY_LINKS_ATTRIBUTE = 'links';

/**
 * Eine Unterlage an einer Aktivität: ein Datenobjekt, das per Eingabe an der Aktivität hängt.
 * Verweist es auf einen Dokument-Record oder eine Web-Adresse, ist es eine Unterlage dieses Schritts.
 */
export interface DocumentInput {
  /** ID des `bpmn:DataObject`. */
  dataObjectId: string;
  /** Name des Datenobjekts, z. B. „Arbeitsanweisung Reklamation“. */
  name?: string;
  /** Schlüssel eines Dokument-Records aus einem anderen Werkzeug, z. B. `DOC-12`; bestbpmn behält ihn nur. */
  documentRef?: string;
  /** Web-Adresse der Unterlage, z. B. eine Wiki-Seite. */
  href?: string;
}

/** Verweis eines Datenobjekts; leere Werte zählen nicht. */
export function readDocumentRef(dataObject: ModdleElement | undefined): { documentRef?: string; href?: string } {
  const el = dataObject as El | undefined;
  const documentRef = (el?.documentRef as string | undefined)?.trim();
  const href = (el?.href as string | undefined)?.trim();
  return { ...(documentRef ? { documentRef } : {}), ...(href ? { href } : {}) };
}

/** Das Datenobjekt hinter einer Referenz; nur Datenobjekte, nicht Datenspeicher. */
function dataObjectOf(source: El | undefined): El | undefined {
  if (source?.$type === 'bpmn:DataObjectReference') {
    return source.dataObjectRef as El | undefined;
  }
  return source?.$type === 'bpmn:DataObject' ? source : undefined;
}

function isProcessObject(dataObject: El): boolean {
  return isProcessObjectName(dataObject.name as string | undefined);
}

/**
 * Die Unterlagen einer Aktivität: alle Datenobjekte außer „Prozess“, die per Eingabe an ihr hängen, in der
 * Reihenfolge der Eingaben und ohne Doppelte. Auch Datenobjekte ohne Verweis sind dabei (z. B. „Angebot“);
 * zur Laufzeit zählen nur die mit Verweis.
 */
export function documentsOfActivity(activity: ModdleElement): DocumentInput[] {
  const seen = new Set<string>();
  const result: DocumentInput[] = [];
  for (const association of ((activity as El).dataInputAssociations ?? []) as El[]) {
    for (const source of (association.sourceRef ?? []) as El[]) {
      const dataObject = dataObjectOf(source);
      if (!dataObject?.id || isProcessObject(dataObject) || seen.has(dataObject.id)) {
        continue;
      }
      seen.add(dataObject.id);
      const name = ((dataObject.name as string | undefined) || (source.name as string | undefined))?.trim();
      result.push({ dataObjectId: dataObject.id, ...(name ? { name } : {}), ...readDocumentRef(dataObject) });
    }
  }
  return result;
}

/** Hat die Aktivität noch Links im alten Attribut „Weiterführende Dokumentation“? */
export function legacyLinksOf(activity: ModdleElement): { href: string; title?: string }[] {
  const container = (((activity as El).extensionElements?.values ?? []) as El[]).find((v) => v.$type === 'bestadd:Attributes');
  const attribute = ((container?.attributes ?? []) as El[]).find((a) => a.key === LEGACY_LINKS_ATTRIBUTE);
  return ((attribute?.items ?? []) as El[])
    .filter((item) => item.$type === 'bestadd:Link' && item.href)
    .map((item) => ({ href: item.href as string, ...(item.title ? { title: item.title as string } : {}) }));
}

/**
 * Prüft die Unterlagen; nur Hinweise:
 * - `document-not-input`: Ein Datenobjekt verweist auf ein Dokument, hängt aber an keiner Aktivität als Eingabe.
 * - `document-ref-and-href`: Ein Datenobjekt verweist zugleich auf einen Record und eine Web-Adresse.
 * - `legacy-links-attribute`: Eine Aktivität hat noch Links im alten Attribut; der Modellierer wandelt sie beim Öffnen um.
 *
 * Ob ein Dokument-Record existiert, kann bestbpmn nicht prüfen.
 */
export function checkDocuments(flowElements: ModdleElement[]): ModelIssue[] {
  const elements = flowElements as El[];
  const issues: ModelIssue[] = [];
  const used = new Set(elements.flatMap((el) => documentsOfActivity(el).map((d) => d.dataObjectId)));
  for (const dataObject of elements.filter((el) => el.$type === 'bpmn:DataObject' && !isProcessObject(el))) {
    const ref = readDocumentRef(dataObject);
    const params = { element: (dataObject.name as string | undefined) || dataObject.id || '' };
    if (ref.documentRef && ref.href) {
      issues.push({ code: 'document-ref-and-href', severity: 'warning', elementId: dataObject.id, params });
    }
    if ((ref.documentRef || ref.href) && dataObject.id && !used.has(dataObject.id)) {
      // Die Meldung zeigt auf eine Referenz im Diagramm, damit man sie anklicken kann.
      const reference = elements.find((el) => el.$type === 'bpmn:DataObjectReference' && el.dataObjectRef === dataObject);
      issues.push({ code: 'document-not-input', severity: 'warning', elementId: reference?.id ?? dataObject.id, params });
    }
  }
  for (const activity of elements) {
    const links = legacyLinksOf(activity);
    if (links.length) {
      issues.push({
        code: 'legacy-links-attribute',
        severity: 'warning',
        elementId: activity.id,
        params: { element: (activity.name as string | undefined) || activity.id || '', count: String(links.length) },
      });
    }
  }
  return issues;
}
