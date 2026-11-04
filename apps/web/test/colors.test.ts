import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import { COLOR_PICKER, ColorPickerModule } from '../src/colors';

let container: HTMLDivElement;
let modeler: any;

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Hintergrundfarbe', () => {
  it('bietet am Element wenige Farben an und speichert nur die Füllung', async () => {
    container = document.createElement('div');
    container.style.width = '1000px';
    container.style.height = '600px';
    document.body.appendChild(container);
    modeler = new Modeler({ container, additionalModules: [ColorPickerModule], colorPicker: COLOR_PICKER });
    await modeler.importXML(template);
    const task = modeler.get('elementRegistry').get('Erstellen');

    expect(Object.keys(modeler.get('contextPad').getEntries(task))).toContain('set-color');
    const entries = modeler.get('colorPopupProvider').getEntries([task]);
    expect(entries.map((e: any) => e.id)).toEqual(['blue-color', 'orange-color', 'green-color', 'red-color', 'purple-color', 'no color-color']);

    entries.find((e: any) => e.id === 'green-color').action();
    const { xml } = await modeler.saveXML();
    const shape = xml.match(/<bpmndi:BPMNShape id="Erstellen_di"[^>]*>/)![0];
    expect(shape).toContain('bioc:fill="#c8e6c9"');
    expect(shape).toContain('color:background-color="#c8e6c9"');
    expect(shape).not.toContain('stroke');
    // Das Bild im Bericht zeigt die Farbe mit.
    const { svg } = await modeler.saveSVG();
    expect(svg).toMatch(/fill: rgb\(200, 230, 201\)|#c8e6c9/i);

    entries.find((e: any) => e.id === 'no color-color').action();
    const { xml: plain } = await modeler.saveXML();
    expect(plain.match(/<bpmndi:BPMNShape id="Erstellen_di"[^>]*>/)![0]).not.toContain('fill');
  });
});
