import type { AttributeDefinition } from './types.js';

/**
 * Attribute, die bestbpmn ohne weitere Konfiguration anbietet.
 * Weitere lassen sich über die Konfiguration ergänzen.
 */
export const DEFAULT_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  {
    key: 'links',
    label: { en: 'Further documentation', de: 'Weiterführende Dokumentation' },
    type: 'links',
    description: {
      en: 'Links to guides, policies or wiki pages for this activity.',
      de: 'Links zu Anleitungen, Richtlinien oder Wiki-Seiten für diese Aktivität.',
    },
  },
  {
    key: 'services',
    label: { en: 'IT services', de: 'IT-Services' },
    type: 'services',
    description: {
      en: 'Business services from the service catalog used to perform this activity.',
      de: 'Business-Services aus dem Service-Katalog, mit denen die Aktivität durchgeführt wird.',
    },
    serviceKinds: ['business'],
  },
];
