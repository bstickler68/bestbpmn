/// <reference path="./properties-panel.d.ts" />
import { bestaddModdle, raciModdle } from '@bestbpmn/model';
import { AttributeCommands } from './attributes';
import AttributesPropertiesProvider from './AttributesPropertiesProvider';
import LaneBehavior from './LaneBehavior';
import LanePropertiesProvider from './LanePropertiesProvider';
import ProcessObjectBehavior from './ProcessObjectBehavior';
import { ProcessNameBehavior } from './processRoot';
import ProcessRootPropertiesProvider from './ProcessRootPropertiesProvider';
import ReadOnlyIdsProvider from './ReadOnlyIdsProvider';
import ServiceOverlays from './ServiceOverlays';
import StatusCheck from './StatusCheck';
import StatusPropertiesProvider from './StatusPropertiesProvider';
import { RaciCommands } from './raci';
import RaciPropertiesProvider from './RaciPropertiesProvider';
import { TranslationCommands } from './translations';
import TranslationsPropertiesProvider from './TranslationsPropertiesProvider';

/** bpmn-js-Erweiterung von bestbpmn. Einbinden über `additionalModules`. */
export const bestbpmnModule = {
  __init__: [
    'bestbpmnProcessObject',
    'bestbpmnLane',
    'bestbpmnProcessName',
    'bestbpmnStatusCheck',
    'bestbpmnAttributeCommands',
    'bestbpmnTranslationCommands',
    'bestbpmnRaciCommands',
    'bestbpmnServiceOverlays',
  ],
  bestbpmnProcessObject: ['type', ProcessObjectBehavior],
  bestbpmnLane: ['type', LaneBehavior],
  bestbpmnProcessName: ['type', ProcessNameBehavior],
  bestbpmnStatusCheck: ['type', StatusCheck],
  bestbpmnAttributeCommands: ['type', AttributeCommands],
  bestbpmnTranslationCommands: ['type', TranslationCommands],
  bestbpmnRaciCommands: ['type', RaciCommands],
  bestbpmnServiceOverlays: ['type', ServiceOverlays],
};

/**
 * Status, Lanes und RACI, Übersetzungen und Zusatzattribute im Eigenschaftenpanel.
 * Setzt `BpmnPropertiesPanelModule` aus bpmn-js-properties-panel voraus.
 */
export const bestbpmnPropertiesProviderModule = {
  __init__: ['bestbpmnStatusProvider', 'bestbpmnLaneProvider', 'bestbpmnProcessRootProvider', 'bestbpmnRaciProvider', 'bestbpmnTranslationsProvider', 'bestbpmnAttributesProvider', 'bestbpmnReadOnlyIdsProvider'],
  bestbpmnStatusProvider: ['type', StatusPropertiesProvider],
  bestbpmnLaneProvider: ['type', LanePropertiesProvider],
  bestbpmnProcessRootProvider: ['type', ProcessRootPropertiesProvider],
  bestbpmnRaciProvider: ['type', RaciPropertiesProvider],
  bestbpmnTranslationsProvider: ['type', TranslationsPropertiesProvider],
  bestbpmnAttributesProvider: ['type', AttributesPropertiesProvider],
  bestbpmnReadOnlyIdsProvider: ['type', ReadOnlyIdsProvider],
};

/** moddle-Erweiterungen, die der Modellierer kennen muss. */
export const bestbpmnModdleExtensions = { raci: raciModdle, bestadd: bestaddModdle };

export { STATUS_CHANGED } from './StatusCheck';
export { UPDATE_ATTRIBUTE, type BestbpmnConfig } from './attributes';
export { translateModule, resolveI18n } from './i18n';
export { UPDATE_RACI } from './raci';
export { UPDATE_TRANSLATION } from './translations';
export { fileNameFor, modelName, singleParticipant } from './processRoot';
export type { default as StatusCheck } from './StatusCheck';
export type { default as ServiceOverlays } from './ServiceOverlays';
