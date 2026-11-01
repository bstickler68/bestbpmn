import type { ModdleElement } from '../states/types.js';
import type { AttributeValue } from './types.js';

type El = ModdleElement & Record<string, any>;

export const ATTRIBUTES_TYPE = 'praxiq:Attributes';

/** Liefert den `praxiq:attributes`-Container eines Elements, falls vorhanden. */
export function findAttributesContainer(element: ModdleElement): El | undefined {
  const values = ((element as El).extensionElements?.values ?? []) as El[];
  return values.find((value) => value.$type === ATTRIBUTES_TYPE);
}

/** Liest alle Zusatzattribute eines BPMN-Elements, unabhängig davon, ob ihre Definition bekannt ist. */
export function readAttributes(element: ModdleElement): AttributeValue[] {
  const container = findAttributesContainer(element);
  return ((container?.attributes ?? []) as El[]).map((attribute) => {
    const items = (attribute.items ?? []) as El[];
    return {
      key: attribute.key,
      value: attribute.value,
      links: items
        .filter((item) => item.$type === 'praxiq:Link')
        .map((item) => ({ href: item.href, title: item.title })),
      services: items
        .filter((item) => item.$type === 'praxiq:ServiceRef')
        .map((item) => ({ ref: item.ref, name: item.name })),
    };
  });
}

/** Beschreibung eines Elements aus dem BPMN-Standardfeld `documentation` (Markdown). */
export function readDescription(element: ModdleElement): string | undefined {
  const docs = ((element as El).documentation ?? []) as El[];
  const text = docs.map((doc) => doc.text ?? '').join('\n\n').trim();
  return text || undefined;
}
