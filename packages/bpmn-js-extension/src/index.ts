/// <reference path="./properties-panel.d.ts" />
import { bestaddModdle, raciModdle } from '@bestbpmn/model';
import { AttributeCommands } from './attributes';
import AttributesPropertiesProvider from './AttributesPropertiesProvider';
import ConditionPropertiesProvider from './ConditionPropertiesProvider';
import GatewayOverlays from './GatewayOverlays';
import ElementNavigation from './ElementNavigation';
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
import { RuleCommands } from './rules';
import RuleOverlays from './RuleOverlays';
import RulesPropertiesProvider from './RulesPropertiesProvider';
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
    'bestbpmnRuleCommands',
    'bestbpmnRuleOverlays',
    'bestbpmnGatewayOverlays',
  ],
  bestbpmnNavigation: ['type', ElementNavigation],
  bestbpmnProcessObject: ['type', ProcessObjectBehavior],
  bestbpmnLane: ['type', LaneBehavior],
  bestbpmnProcessName: ['type', ProcessNameBehavior],
  bestbpmnStatusCheck: ['type', StatusCheck],
  bestbpmnAttributeCommands: ['type', AttributeCommands],
  bestbpmnTranslationCommands: ['type', TranslationCommands],
  bestbpmnRaciCommands: ['type', RaciCommands],
  bestbpmnServiceOverlays: ['type', ServiceOverlays],
  bestbpmnRuleCommands: ['type', RuleCommands],
  bestbpmnRuleOverlays: ['type', RuleOverlays],
  bestbpmnGatewayOverlays: ['type', GatewayOverlays],
};

/**
 * Status, Lanes und RACI, Übersetzungen, Zusatzattribute, Bedingungen an Sequenzflüssen und Regel-Kennzeichen
 * im Eigenschaftenpanel.
 * Setzt `BpmnPropertiesPanelModule` aus bpmn-js-properties-panel voraus.
 */
export const bestbpmnPropertiesProviderModule = {
  __init__: [
    'bestbpmnStatusProvider',
    'bestbpmnLaneProvider',
    'bestbpmnProcessRootProvider',
    'bestbpmnRaciProvider',
    'bestbpmnTranslationsProvider',
    'bestbpmnAttributesProvider',
    'bestbpmnReadOnlyIdsProvider',
    'bestbpmnConditionProvider',
    'bestbpmnRulesProvider',
  ],
  bestbpmnStatusProvider: ['type', StatusPropertiesProvider],
  bestbpmnLaneProvider: ['type', LanePropertiesProvider],
  bestbpmnProcessRootProvider: ['type', ProcessRootPropertiesProvider],
  bestbpmnRaciProvider: ['type', RaciPropertiesProvider],
  bestbpmnTranslationsProvider: ['type', TranslationsPropertiesProvider],
  bestbpmnAttributesProvider: ['type', AttributesPropertiesProvider],
  bestbpmnReadOnlyIdsProvider: ['type', ReadOnlyIdsProvider],
  bestbpmnConditionProvider: ['type', ConditionPropertiesProvider],
  bestbpmnRulesProvider: ['type', RulesPropertiesProvider],
};

/** moddle-Erweiterungen, die der Modellierer kennen muss. */
export const bestbpmnModdleExtensions = { raci: raciModdle, bestadd: bestaddModdle };

export { STATUS_CHANGED } from './StatusCheck';
export { default as ElementNavigation, navigationGroup, type NavigationGroup, type NavigationPosition } from './ElementNavigation';
export { UPDATE_ATTRIBUTE, type BestbpmnConfig } from './attributes';
export { translateModule, resolveI18n } from './i18n';
export { UPDATE_RACI } from './raci';
export { UPDATE_RULES } from './rules';
export { UPDATE_TRANSLATION } from './translations';
export { fileNameFor, modelName, singleParticipant } from './processRoot';
export type { default as StatusCheck } from './StatusCheck';
export type { default as ServiceOverlays } from './ServiceOverlays';
