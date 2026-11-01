import { h } from '@bpmn-io/properties-panel/preact';
import {
  CheckboxEntry,
  isCheckboxEntryEdited,
  isTextAreaEntryEdited,
  isTextFieldEntryEdited,
  ListGroup,
  TextAreaEntry,
  TextFieldEntry,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { pickText, type AttributeDefinition, type Service } from '@bestbpmn/model';
import {
  definitionsFor,
  findAttribute,
  resolveDefinitions,
  UPDATE_ATTRIBUTE,
  type BestbpmnConfig,
} from './attributes';
import { resolveI18n, type BestbpmnI18n } from './i18n';
import type { BusinessObject, DiagramElement } from './util';

const LOW_PRIORITY = 400;

/**
 * Ergänzt das Eigenschaftenpanel um die Zusatzattribute.
 * Jede Attributdefinition wird zu einer eigenen Gruppe.
 */
export default class AttributesPropertiesProvider {
  static $inject = ['propertiesPanel', 'config.bestbpmn', 'injector'];

  private definitions: AttributeDefinition[];
  private services: Service[];
  private i18n: BestbpmnI18n;

  constructor(propertiesPanel: any, config: BestbpmnConfig | undefined, private injector: any) {
    this.definitions = resolveDefinitions(config);
    this.services = config?.services ?? [];
    this.i18n = resolveI18n(config);
    propertiesPanel.registerProvider(LOW_PRIORITY, this);
  }

  getGroups(element: DiagramElement) {
    return (groups: any[]) => {
      const bo = element.businessObject;
      const known = definitionsFor(this.definitions, bo);
      const knownKeys = new Set(this.definitions.map((d) => d.key));
      const unknown = (findAttributeKeys(bo) ?? [])
        .filter((key) => !knownKeys.has(key))
        .map((key): AttributeDefinition => ({ key, label: key, type: 'text' }));

      for (const definition of [...known, ...unknown]) {
        const group = this.groupFor(element, definition);
        if (group) {
          groups.push(group);
        }
      }
      return groups;
    };
  }

  private groupFor(element: DiagramElement, definition: AttributeDefinition) {
    const id = `bestbpmn-${definition.key}`;
    const { language } = this.i18n;
    switch (definition.type) {
      case 'text':
      case 'markdown':
        return {
          id,
          label: pickText(definition.label, language),
          entries: [
            {
              id: `${id}-value`,
              component: TextValueEntry,
              definition,
              language,
              isEdited: definition.type === 'text' ? isTextFieldEntryEdited : isTextAreaEntryEdited,
            },
          ],
        };
      case 'links':
        return linksGroup(element, definition, this.injector, this.i18n);
      case 'services':
        return servicesGroup(element, definition, this.services, this.i18n);
      default:
        return undefined;
    }
  }
}

function findAttributeKeys(bo: BusinessObject): string[] | undefined {
  return bo.extensionElements?.values
    ?.find((v: BusinessObject) => v.$type === 'bestadd:Attributes')
    ?.attributes?.map((a: BusinessObject) => a.key);
}

function TextValueEntry(props: {
  element: DiagramElement;
  id: string;
  definition: AttributeDefinition;
  language: string;
}) {
  const { element, id, definition, language } = props;
  const commandStack = useService('commandStack');
  const debounce = useService('debounceInput');
  const common = {
    element,
    id,
    label: pickText(definition.label, language),
    description: pickText(definition.description, language),
    debounce,
    getValue: () => findAttribute(element.businessObject, definition.key)?.value ?? '',
    setValue: (value: string) => commandStack.execute(UPDATE_ATTRIBUTE, { element, key: definition.key, value }),
  };
  return definition.type === 'markdown' ? h(TextAreaEntry, { ...common, rows: 6 }) : h(TextFieldEntry, common);
}

function itemsOf(element: DiagramElement, key: string, type: string): BusinessObject[] {
  return (findAttribute(element.businessObject, key)?.items ?? []).filter((i: BusinessObject) => i.$type === type);
}

function linksGroup(element: DiagramElement, definition: AttributeDefinition, injector: any, i18n: BestbpmnI18n) {
  const { t, language } = i18n;
  const { key } = definition;
  const commandStack = injector.get('commandStack');
  const bpmnFactory = injector.get('bpmnFactory');
  const attribute = findAttribute(element.businessObject, key);
  const links = itemsOf(element, key, 'bestadd:Link');
  const others = (attribute?.items ?? []).filter((i: BusinessObject) => i.$type !== 'bestadd:Link');

  const save = (next: BusinessObject[]) =>
    commandStack.execute(UPDATE_ATTRIBUTE, { element, key, value: attribute?.value, items: [...others, ...next] });

  return {
    id: `bestbpmn-${key}`,
    label: pickText(definition.label, language),
    component: ListGroup,
    add: (event: Event) => {
      event.stopPropagation();
      save([...links, bpmnFactory.create('bestadd:Link', { href: '', title: '' })]);
    },
    items: links.map((link, index) => ({
      id: `bestbpmn-${key}-${index}`,
      label: link.title || link.href || t('panel.link'),
      remove: () => save(links.filter((l) => l !== link)),
      autoFocusEntry: `bestbpmn-${key}-${index}-title`,
      entries: [
        { id: `bestbpmn-${key}-${index}-title`, component: LinkField, link, property: 'title', label: t('panel.linkTitle') },
        {
          id: `bestbpmn-${key}-${index}-href`,
          component: LinkField,
          link,
          property: 'href',
          label: t('panel.linkHref'),
          placeholder: 'https://',
        },
      ],
    })),
  };
}

function LinkField(props: {
  element: DiagramElement;
  id: string;
  link: BusinessObject;
  property: string;
  label: string;
  placeholder?: string;
}) {
  const { element, id, link, property, label, placeholder } = props;
  const modeling = useService('modeling');
  const debounce = useService('debounceInput');
  return h(TextFieldEntry, {
    element,
    id,
    label,
    placeholder,
    debounce,
    getValue: () => link[property] ?? '',
    setValue: (value: string) => modeling.updateModdleProperties(element, link, { [property]: value || undefined }),
  });
}

function servicesGroup(element: DiagramElement, definition: AttributeDefinition, catalog: Service[], i18n: BestbpmnI18n) {
  const { key, serviceKinds } = definition;
  const { t, language } = i18n;
  const offered = catalog.filter((s) => !serviceKinds?.length || serviceKinds.includes(s.kind));
  const selected = itemsOf(element, key, 'bestadd:ServiceRef');
  const missing = selected.filter((ref) => !offered.some((s) => s.id === ref.ref));

  const entries = [
    ...offered.map((service) => ({
      id: `bestbpmn-${key}-${service.id}`,
      component: ServiceCheckbox,
      isEdited: isCheckboxEntryEdited,
      attributeKey: key,
      serviceId: service.id,
      label: service.name,
      description: service.description,
    })),
    ...missing.map((ref) => ({
      id: `bestbpmn-${key}-${ref.ref}`,
      component: ServiceCheckbox,
      isEdited: isCheckboxEntryEdited,
      attributeKey: key,
      serviceId: ref.ref,
      label: t('panel.notInCatalog', { name: ref.name ?? ref.ref }),
    })),
  ];

  if (!entries.length) {
    entries.push({
      id: `bestbpmn-${key}-empty`,
      component: EmptyCatalog,
      text: t('panel.emptyCatalog'),
    } as any);
  }

  return { id: `bestbpmn-${key}`, label: pickText(definition.label, language), entries };
}

function ServiceCheckbox(props: {
  element: DiagramElement;
  id: string;
  attributeKey: string;
  serviceId: string;
  label: string;
  description?: string;
}) {
  const { element, id, attributeKey, serviceId, label, description } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory = useService('bpmnFactory');
  return h(CheckboxEntry, {
    element,
    id,
    label,
    description,
    getValue: () => itemsOf(element, attributeKey, 'bestadd:ServiceRef').some((r) => r.ref === serviceId),
    setValue: (checked: boolean) => {
      const attribute = findAttribute(element.businessObject, attributeKey);
      const items: BusinessObject[] = attribute?.items ?? [];
      const next = checked
        ? [...items, bpmnFactory.create('bestadd:ServiceRef', { ref: serviceId, name: label })]
        : items.filter((i) => !(i.$type === 'bestadd:ServiceRef' && i.ref === serviceId));
      commandStack.execute(UPDATE_ATTRIBUTE, { element, key: attributeKey, value: attribute?.value, items: next });
    },
  });
}

function EmptyCatalog(props: { text: string }) {
  return h('div', { class: 'bio-properties-panel-description bestbpmn-empty' }, props.text);
}
