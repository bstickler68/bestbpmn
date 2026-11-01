/** Text je Sprache; ein einfacher String gilt für alle Sprachen. */
export type LocalizedText = string | Record<string, string>;

/** Art eines Zusatzattributs. Bestimmt Eingabefeld und Speicherform (ADR 0009). */
export type AttributeType = 'text' | 'markdown' | 'links' | 'services';

/**
 * Definition eines Zusatzattributs. Der Administrator pflegt die Definitionen;
 * die Werte stehen im BPMN-Modell unter `praxiq:attributes`.
 */
export interface AttributeDefinition {
  /** Schlüssel, unter dem der Wert im Modell steht. Nach dem ersten Einsatz nicht mehr ändern. */
  key: string;
  /** Bezeichnung je Sprache, z. B. `{ en: 'IT services', de: 'IT-Services' }` (ADR 0010). */
  label: LocalizedText;
  type: AttributeType;
  description?: LocalizedText;
  /** BPMN-Typen, an denen das Attribut angeboten wird, z. B. `bpmn:Task`. Leer = alle Aktivitäten. */
  appliesTo?: string[];
  /** Nur bei `services`: zulässige Arten aus dem Service-Katalog, z. B. `business`. */
  serviceKinds?: string[];
}

/** Ein Eintrag aus dem Service-Katalog (später CMDB in PRAXIQ). */
export interface Service {
  id: string;
  name: string;
  /** Art des Service, z. B. `business` oder `technical`. */
  kind: string;
  description?: string;
}

export interface LinkValue {
  href: string;
  title?: string;
}

export interface ServiceRefValue {
  ref: string;
  /** Name zum Zeitpunkt der Auswahl, damit das Modell auch ohne Katalog lesbar bleibt. */
  name?: string;
}

/** Ein im Modell gespeicherter Attributwert. */
export interface AttributeValue {
  key: string;
  value?: string;
  links: LinkValue[];
  services: ServiceRefValue[];
}
