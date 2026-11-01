import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import {
  bestbpmnModdleExtensions,
  bestbpmnModule,
  bestbpmnPropertiesProviderModule,
  translateModule,
} from '@bestbpmn/bpmn-js-extension';

// Ein Modell aus einem anderen Werkzeug (z. B. Camunda Modeler) mit Erweiterungen, die bestbpmn nicht kennt.
const FOREIGN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
                  id="Definitions_1" targetNamespace="urn:test">
  <bpmn:process id="Prozess_1" isExecutable="true" camunda:historyTimeToLive="180">
    <bpmn:userTask id="Pruefen" name="Prüfen" camunda:assignee="anna" camunda:candidateGroups="einkauf">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="pruefen" retries="3" />
        <camunda:inputOutput>
          <camunda:inputParameter name="betrag">\${betrag}</camunda:inputParameter>
        </camunda:inputOutput>
      </bpmn:extensionElements>
    </bpmn:userTask>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Prozess_1">
      <bpmndi:BPMNShape id="Pruefen_di" bpmnElement="Pruefen">
        <dc:Bounds x="200" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

let container: HTMLDivElement;
let modeler: any;

afterEach(() => {
  modeler?.destroy();
  container?.remove();
});

describe('Fremde Erweiterungen', () => {
  it('bleiben beim Öffnen, Bearbeiten und Speichern erhalten', async () => {
    container = document.createElement('div');
    container.innerHTML = '<div id="c" style="width:800px;height:500px"></div><div id="p"></div>';
    document.body.appendChild(container);
    modeler = new Modeler({
      container: container.querySelector<HTMLElement>('#c')!,
      additionalModules: [
        BpmnPropertiesPanelModule,
        BpmnPropertiesProviderModule,
        bestbpmnModule,
        bestbpmnPropertiesProviderModule,
        translateModule('de'),
      ],
      moddleExtensions: bestbpmnModdleExtensions,
      propertiesPanel: { parent: container.querySelector('#p') },
      bestbpmn: { language: 'de' },
    });
    const { warnings } = await modeler.importXML(FOREIGN);
    expect(warnings).toEqual([]);

    const task = modeler.get('elementRegistry').get('Pruefen');
    modeler.get('modeling').updateLabel(task, 'Antrag prüfen');
    const { xml } = await modeler.saveXML({ format: true });

    expect(xml).toContain('name="Antrag prüfen"');
    expect(xml).toContain('xmlns:camunda="http://camunda.org/schema/1.0/bpmn"');
    expect(xml).toContain('xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"');
    expect(xml).toContain('camunda:historyTimeToLive="180"');
    expect(xml).toContain('camunda:assignee="anna"');
    expect(xml).toContain('camunda:candidateGroups="einkauf"');
    expect(xml).toContain('<zeebe:taskDefinition type="pruefen" retries="3" />');
    expect(xml).toContain('<camunda:inputParameter name="betrag">${betrag}</camunda:inputParameter>');
  });
});
