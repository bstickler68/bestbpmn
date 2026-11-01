/// <reference path="./properties-panel.d.ts" />
import { praxiqModdle, raciModdle } from '@bestbpmn/model';
import { AttributeCommands } from './attributes';
import AttributesPropertiesProvider from './AttributesPropertiesProvider';
import LaneBehavior from './LaneBehavior';
import LanePropertiesProvider from './LanePropertiesProvider';
import ProcessObjectBehavior from './ProcessObjectBehavior';
import { ProcessNameBehavior } from './processRoot';
import ProcessRootPropertiesProvider from './ProcessRootPropertiesProvider';
import ServiceOverlays from './ServiceOverlays';
import StatusCheck from './StatusCheck';
import StatusPropertiesProvider from './StatusPropertiesProvider';
import { RaciCommands } from './raci';
import RaciPropertiesProvider from './RaciPropertiesProvider';
import { TranslationCommands } from './translations';
import TranslationsPropertiesProvider from './TranslationsPropertiesProvider';

/** bpmn-js-Erweiterung von PRAXIQ. Einbinden über `additionalModules`. */
export const praxiqModule = {
  __init__: [
    'praxiqProcessObject',
    'praxiqLane',
    'praxiqProcessName',
    'praxiqStatusCheck',
    'praxiqAttributeCommands',
    'praxiqTranslationCommands',
    'praxiqRaciCommands',
    'praxiqServiceOverlays',
  ],
  praxiqProcessObject: ['type', ProcessObjectBehavior],
  praxiqLane: ['type', LaneBehavior],
  praxiqProcessName: ['type', ProcessNameBehavior],
  praxiqStatusCheck: ['type', StatusCheck],
  praxiqAttributeCommands: ['type', AttributeCommands],
  praxiqTranslationCommands: ['type', TranslationCommands],
  praxiqRaciCommands: ['type', RaciCommands],
  praxiqServiceOverlays: ['type', ServiceOverlays],
};

/**
 * Status (ADR 0012), Lanes und RACI (ADR 0003, 0011, 0013), Übersetzungen (ADR 0010) und Zusatzattribute (ADR 0009) im Eigenschaftenpanel.
 * Setzt `BpmnPropertiesPanelModule` aus bpmn-js-properties-panel voraus.
 */
export const praxiqPropertiesProviderModule = {
  __init__: ['praxiqStatusProvider', 'praxiqLaneProvider', 'praxiqProcessRootProvider', 'praxiqRaciProvider', 'praxiqTranslationsProvider', 'praxiqAttributesProvider'],
  praxiqStatusProvider: ['type', StatusPropertiesProvider],
  praxiqLaneProvider: ['type', LanePropertiesProvider],
  praxiqProcessRootProvider: ['type', ProcessRootPropertiesProvider],
  praxiqRaciProvider: ['type', RaciPropertiesProvider],
  praxiqTranslationsProvider: ['type', TranslationsPropertiesProvider],
  praxiqAttributesProvider: ['type', AttributesPropertiesProvider],
};

/** moddle-Erweiterungen, die der Modellierer kennen muss. */
export const praxiqModdleExtensions = { raci: raciModdle, praxiq: praxiqModdle };

export { STATUS_CHANGED } from './StatusCheck';
export { UPDATE_ATTRIBUTE, type PraxiqConfig } from './attributes';
export { translateModule, resolveI18n } from './i18n';
export { UPDATE_RACI } from './raci';
export { UPDATE_TRANSLATION } from './translations';
export { fileNameFor, modelName } from './processRoot';
export type { default as StatusCheck } from './StatusCheck';
export type { default as ServiceOverlays } from './ServiceOverlays';
