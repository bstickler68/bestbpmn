import ColorPickerModule from 'bpmn-js-color-picker';
import 'bpmn-js-color-picker/colors/color-picker.css';

/**
 * Hintergrundfarben im Kontextmenü am Element (Palettensymbol neben dem Schraubenschlüssel).
 * Nur die Füllung wird gesetzt; der Rahmen bleibt schwarz. Gespeichert wird nach „BPMN in Color“
 * (`color:background-color`, `bioc:fill`), das lesen auch bpmn.io und der Camunda Modeler.
 */
export const COLOR_PICKER = {
  colors: [
    { label: 'Blue', fill: '#BBDEFB' },
    { label: 'Orange', fill: '#FFE0B2' },
    { label: 'Green', fill: '#C8E6C9' },
    { label: 'Red', fill: '#FFCDD2' },
    { label: 'Purple', fill: '#E1BEE7' },
    // `fill` muss da sein, sonst bleibt die alte Farbe stehen.
    { label: 'No color', fill: undefined },
  ],
};

export { ColorPickerModule };
