// Die Pakete des bpmn.io-Eigenschaftenpanels bringen keine Typen mit.
declare module 'bpmn-js-properties-panel' {
  export const BpmnPropertiesPanelModule: any;
  export const BpmnPropertiesProviderModule: any;
  export function useService(name: string): any;
}

declare module '@bpmn-io/properties-panel' {
  export const CheckboxEntry: any;
  export const ListGroup: any;
  export const SelectEntry: any;
  export const TextAreaEntry: any;
  export const TextFieldEntry: any;
  export const isCheckboxEntryEdited: any;
  export const isSelectEntryEdited: any;
  export const isTextAreaEntryEdited: any;
  export const isTextFieldEntryEdited: any;
}

declare module 'bpmn-js-i18n/translations/de' {
  const translations: Record<string, string>;
  export default translations;
}
