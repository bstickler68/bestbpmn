import type { AttributeDefinition } from './types.js';

/**
 * Attribute, die bestbpmn ohne weitere Konfiguration anbietet.
 * Weitere lassen sich über die Konfiguration ergänzen. Die frühere „Weiterführende Dokumentation“ ist
 * jetzt ein Datenobjekt mit Eingabe an der Aufgabe.
 */
export const DEFAULT_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
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
