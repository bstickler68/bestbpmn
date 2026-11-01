import type { ModdleElement } from '../states/types.js';
import { parseAssignees, type Assignee } from './assignees.js';

type El = ModdleElement & Record<string, any>;

export type RaciRole = 'responsible' | 'accountable' | 'consulted' | 'informed';
export const RACI_ROLES: RaciRole[] = ['responsible', 'accountable', 'consulted', 'informed'];

export type Raci = Record<RaciRole, Assignee[]>;

const RACI_TYPE: Record<Exclude<RaciRole, 'responsible'>, string> = {
  accountable: 'raci:Accountable',
  consulted: 'raci:Consulted',
  informed: 'raci:Informed',
};

/** Typname des Erweiterungselements für A, C oder I. */
export function raciElementType(role: Exclude<RaciRole, 'responsible'>): string {
  return RACI_TYPE[role];
}

/** Text des `potentialOwner` einer Aktivität, z. B. `group(Autoren)`. */
export function readPotentialOwnerText(element: ModdleElement): string | undefined {
  const owners = (((element as El).resources ?? []) as El[]).filter((r) => r.$type === 'bpmn:PotentialOwner');
  const texts = owners
    .map((o) => (o.resourceAssignmentExpression?.expression?.body as string | undefined)?.trim())
    .filter((t): t is string => !!t);
  return texts.length ? texts.join(', ') : undefined;
}

/** Liest R aus `potentialOwner` und A, C, I aus dem `raci`-Namensraum. */
export function readRaci(element: ModdleElement): Raci {
  const values = ((element as El).extensionElements?.values ?? []) as El[];
  const fromExtension = (type: string) =>
    values.filter((v) => v.$type === type).flatMap((v) => ((v.assignees ?? []) as El[]).map(toAssignee));
  return {
    responsible: parseAssignees(readPotentialOwnerText(element)).assignees,
    accountable: fromExtension(RACI_TYPE.accountable).filter(isDefined),
    consulted: fromExtension(RACI_TYPE.consulted).filter(isDefined),
    informed: fromExtension(RACI_TYPE.informed).filter(isDefined),
  };
}

/** Übersetzt ein `raci:user`, `raci:group` oder `raci:dynamic` in eine Zuordnung. */
export function toAssignee(el: El): Assignee | undefined {
  switch (el.$type) {
    case 'raci:User':
      return el.ref ? { kind: 'user', ref: el.ref } : undefined;
    case 'raci:Group':
      return el.ref ? { kind: 'group', ref: el.ref } : undefined;
    case 'raci:Role':
      return el.ref ? { kind: 'role', ref: el.ref } : undefined;
    case 'raci:Dynamic':
      if (el.field) return { kind: 'field', ref: el.field };
      if (el.initiator) return { kind: 'initiator' };
      if (el.performerOf) return { kind: 'performerOf', ref: el.performerOf };
      if (el.excludePerformerOf) return { kind: 'notPerformerOf', ref: el.excludePerformerOf };
      if (el.orgRole) return el.of ? { kind: 'orgRole', ref: el.orgRole, of: el.of } : { kind: 'orgRole', ref: el.orgRole };
      return undefined;
    default:
      return undefined;
  }
}

/** Die Gegenrichtung: Typ und Attribute für bpmnFactory/moddle. */
export function fromAssignee(assignee: Assignee): { type: string; attrs: Record<string, unknown> } {
  switch (assignee.kind) {
    case 'user':
      return { type: 'raci:User', attrs: { ref: assignee.ref } };
    case 'group':
      return { type: 'raci:Group', attrs: { ref: assignee.ref } };
    case 'role':
      return { type: 'raci:Role', attrs: { ref: assignee.ref } };
    case 'field':
      return { type: 'raci:Dynamic', attrs: { field: assignee.ref } };
    case 'initiator':
      return { type: 'raci:Dynamic', attrs: { initiator: true } };
    case 'performerOf':
      return { type: 'raci:Dynamic', attrs: { performerOf: assignee.ref } };
    case 'notPerformerOf':
      return { type: 'raci:Dynamic', attrs: { excludePerformerOf: assignee.ref } };
    case 'orgRole':
      return { type: 'raci:Dynamic', attrs: assignee.of ? { orgRole: assignee.ref, of: assignee.of } : { orgRole: assignee.ref } };
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
